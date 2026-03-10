import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  candidates,
  chatConversations,
  chatMessages,
  cvPool,
  interviews,
  jobs,
  screenings,
} from '@/db/schema';
import { callOpenRouter } from './ai';
import { getCvPoolStats, getJobsStats, getSmartInsights } from './statistics';

type UserRole = 'ta' | 'manager' | 'hr' | 'admin';

type CvRow = Pick<
  typeof cvPool.$inferSelect,
  | 'id'
  | 'extractedName'
  | 'extractedSkills'
  | 'extractedLanguages'
  | 'extractedExperiences'
  | 'createdAt'
>;
type JobRow = Pick<
  typeof jobs.$inferSelect,
  | 'id'
  | 'title'
  | 'seniority'
  | 'status'
  | 'mustHave'
  | 'niceToHave'
  | 'businessUnit'
>;
type CandidateRow = typeof candidates.$inferSelect;
type CandidateRawRow = typeof candidates.$inferSelect;
type InterviewRow = typeof interviews.$inferSelect;
type ScreeningRow = typeof screenings.$inferSelect;
type JobMap = Map<string, string>;
type CandidateByStage = { stage: string; candidates: string[] };

function getFilteredCandidates(
  allCandidatesRaw: CandidateRawRow[],
  role: UserRole
): CandidateRow[] {
  const roleStagePrefixes: Record<string, string[]> = {
    ta: [],
    admin: [],
    manager: [
      'manager_interview',
      'manager_accepted',
      'manager_rejected',
      'hr_interview',
      'hr_accepted',
      'hr_rejected',
      'hired',
    ],
    hr: ['hr_interview', 'hr_accepted', 'hr_rejected', 'hired'],
  };
  const allowedPrefixes = roleStagePrefixes[role] ?? [];
  return allowedPrefixes.length === 0
    ? allCandidatesRaw
    : allCandidatesRaw.filter((c) => allowedPrefixes.includes(c.stage));
}

function groupCandidatesByStage(
  filteredCandidates: CandidateRow[],
  jobMap: JobMap
): CandidateByStage[] {
  const stageGrouped = new Map<string, string[]>();
  for (const c of filteredCandidates) {
    const existing = stageGrouped.get(c.stage);
    const entry = `${c.fullName} (Job: ${jobMap.get(c.jobId) ?? 'Unknown'})`;
    if (existing) existing.push(entry);
    else stageGrouped.set(c.stage, [entry]);
  }
  return Array.from(stageGrouped, ([stage, candidates]) => ({
    stage,
    candidates,
  }));
}


function buildCvSection(cvs: CvRow[], role: UserRole): string {
  const canSeeCvs = role === 'ta' || role === 'admin';
  if (!canSeeCvs || cvs.length === 0) return '';

  const skillCounts: Record<string, number> = {};
  const langCounts: Record<string, number> = {};
  for (const cv of cvs) {
    for (const skill of cv.extractedSkills ?? []) {
      const n = skill.trim();
      if (n) skillCounts[n] = (skillCounts[n] ?? 0) + 1;
    }
    for (const lang of cv.extractedLanguages ?? []) {
      const n = lang.trim();
      if (n) langCounts[n] = (langCounts[n] ?? 0) + 1;
    }
  }

  const topSkills = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([s, c]) => `${s} (${c})`)
    .join(', ');

  const topLangs = Object.entries(langCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([l, c]) => `${l} (${c})`)
    .join(', ');

  const sections: string[] = [
    `## CV Pool\n- Total CVs: ${cvs.length}\n- Top Skills: ${topSkills || 'None'}\n- Languages: ${topLangs || 'None'}`,
  ];

  const topCvs = [...cvs]
    .sort(
      (a, b) =>
        (b.extractedSkills?.length ?? 0) - (a.extractedSkills?.length ?? 0)
    )
    .slice(0, 15);

  if (topCvs.length > 0) {
    const cvLines = topCvs
      .map(
        (cv, i) =>
          `${i + 1}. ${cv.extractedName ?? 'Unknown'} | Skills: ${(cv.extractedSkills ?? []).join(', ')} | Languages: ${(cv.extractedLanguages ?? []).join(', ')} | Positions: ${(cv.extractedExperiences ?? []).length}`
      )
      .join('\n');
    sections.push(`## Top CVs (by skill count)\n${cvLines}`);
  }

  return sections.join('\n\n');
}

function buildJobsSection(allJobs: JobRow[]): string {
  if (allJobs.length === 0) return '';

  const jobLines = allJobs
    .map(
      (j) =>
        `- "${j.title}" [${j.seniority}] Status: ${j.status} | Must-Have: ${j.mustHave.join(', ')} | Nice-to-Have: ${j.niceToHave.join(', ')}${j.businessUnit ? ` | BU: ${j.businessUnit}` : ''}`
    )
    .join('\n');

  return `## Jobs (${allJobs.length} total)\n${jobLines}`;
}

function buildCandidatePipelineSection(
  filteredCandidates: CandidateRow[],
  allCandidatesRaw: CandidateRawRow[],
  jobMap: JobMap,
  role: UserRole
): string {
  const sections: string[] = [];
  if (role === 'ta' || role === 'admin') {
    const fullStageCounts: Record<string, number> = {};
    for (const c of allCandidatesRaw) fullStageCounts[c.stage] = (fullStageCounts[c.stage] ?? 0) + 1;
    sections.push(`## Full Candidate Pipeline (${allCandidatesRaw.length} total)\n- ${Object.entries(fullStageCounts).map(([s, c]) => `${s}: ${c}`).join(', ') || 'No candidates'}`);
  }
  const stageCounts: Record<string, number> = {};
  for (const c of filteredCandidates) stageCounts[c.stage] = (stageCounts[c.stage] ?? 0) + 1;
  if (role === 'manager' || role === 'hr') {
    sections.push(`## Your Candidates (${filteredCandidates.length} total, ${role}-stage and beyond)\n- ${Object.entries(stageCounts).map(([s, c]) => `${s}: ${c}`).join(', ') || 'No candidates'}`);
  }

  const keyStages = ['hired', 'hr_accepted', 'hr_rejected', 'manager_accepted', 'manager_rejected', 'ta_accepted', 'ta_rejected'] as const;
  const stageGrouped = groupCandidatesByStage(filteredCandidates, jobMap);
  const stageOrder = new Map<string, number>(keyStages.map((stage, index) => [stage, index]));
  stageGrouped.sort((a, b) => (stageOrder.get(a.stage) ?? Number.MAX_SAFE_INTEGER) - (stageOrder.get(b.stage) ?? Number.MAX_SAFE_INTEGER));
  const stageListLines = stageGrouped.flatMap(({ stage, candidates }) => candidates.length > 0 ? [`### ${stage}\n${candidates.map((n) => `- ${n}`).join('\n')}`] : []);
  if (stageListLines.length > 0) sections.push(`## Candidates by Stage (EXACT - use these names when asked)\n${stageListLines.join('\n')}`);

  const recentCandidates = filteredCandidates.slice(0, 20);
  if (recentCandidates.length > 0) {
    const candLines = recentCandidates.map((c) => `- ${c.fullName} | Job: ${jobMap.get(c.jobId) ?? 'Unknown'} | Stage: ${c.stage} | ${c.createdAt?.toISOString().split('T')[0] ?? ''}`).join('\n');
    sections.push(`## Recent Candidates\n${candLines}`);
  }
  return sections.join('\n\n');
}

function buildInterviewSection(
  interviews: InterviewRow[],
  jobMap: JobMap,
  allCandidatesRaw: CandidateRawRow[],
  seeAllInterviews: boolean
): string {
  if (interviews.length === 0) return '';
  const ivStageCounts: Record<string, number> = {};
  const ivStatusCounts: Record<string, number> = {};
  for (const iv of interviews) {
    ivStageCounts[iv.stage] = (ivStageCounts[iv.stage] ?? 0) + 1;
    ivStatusCounts[iv.status] = (ivStatusCounts[iv.status] ?? 0) + 1;
  }
  const ivLabel = seeAllInterviews ? 'All Interviews' : 'Your Interviews';

  const sections: string[] = [
    `## ${ivLabel} (${interviews.length} total)\n- By Stage: ${Object.entries(ivStageCounts)
      .map(([s, c]) => `${s}: ${c}`)
      .join(', ')}\n- By Status: ${Object.entries(ivStatusCounts)
      .map(([s, c]) => `${s}: ${c}`)
      .join(', ')}`,
  ];

  const candMap = new Map(allCandidatesRaw.map((c) => [c.id, c.fullName]));
  const ivLines = interviews
    .slice(0, 30)
    .map(
      (iv) =>
        `- ${candMap.get(iv.candidateId) ?? 'Unknown'} | Job: ${jobMap.get(iv.jobId) ?? 'Unknown'} | Stage: ${iv.stage} | Date: ${iv.scheduledDate} ${iv.scheduledTime} | Status: ${iv.status}`
    )
    .join('\n');
  sections.push(`## Interview Schedule\n${ivLines}`);

  return sections.join('\n\n');
}

function buildScreeningSection(
  screenings: ScreeningRow[],
  jobMap: JobMap,
  filteredCandidates: CandidateRow[],
  allCandidatesRaw: CandidateRawRow[]
): string {
  void filteredCandidates;
  void jobMap;
  if (screenings.length === 0) return '';
  const avgScore =
    screenings.reduce((sum, s) => sum + s.score, 0) / screenings.length;
  const candMap = new Map(allCandidatesRaw.map((c) => [c.id, c.fullName]));
  const topScreen = [...screenings]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(
      (s) =>
        `- ${candMap.get(s.candidateId) ?? 'Unknown'}: ${s.score.toFixed(0)}% (Must: ${s.mustMatchScore.toFixed(0)}%, Nice: ${s.niceMatchScore.toFixed(0)}%) Gaps: ${s.gaps.join(', ') || 'None'}`
    )
    .join('\n');

  return `## Screening Results\n- Total: ${screenings.length} | Avg Score: ${avgScore.toFixed(1)}%\n${topScreen}`;
}

function buildSkillGapSection(
  filteredCandidates: CandidateRow[],
  allJobs: JobRow[],
  cvs: CvRow[]
): string {
  void filteredCandidates;
  const jobSkills: Record<string, number> = {};
  for (const j of allJobs) {
    for (const s of j.mustHave) {
      const n = s.trim().toLowerCase();
      if (n) jobSkills[n] = (jobSkills[n] ?? 0) + 1;
    }
  }
  const cvSkillsLower: Record<string, number> = {};
  for (const cv of cvs) {
    for (const s of cv.extractedSkills ?? []) {
      const n = s.trim().toLowerCase();
      if (n) cvSkillsLower[n] = (cvSkillsLower[n] ?? 0) + 1;
    }
  }
  const allKeys = new Set([
    ...Object.keys(jobSkills),
    ...Object.keys(cvSkillsLower),
  ]);
  const gapAnalysis = Array.from(allKeys)
    .map((s) => ({
      skill: s,
      demand: jobSkills[s] ?? 0,
      supply: cvSkillsLower[s] ?? 0,
    }))
    .sort((a, b) => b.demand - b.supply - (a.demand - a.supply))
    .slice(0, 12);

  if (gapAnalysis.length === 0) return '';
  const gapLines = gapAnalysis
    .map(
      (g) =>
        `- ${g.skill}: demand=${g.demand}, supply=${g.supply}, gap=${g.demand - g.supply}`
    )
    .join('\n');

  return `## Skill Gap (Demand vs Supply)\n${gapLines}`;
}

async function buildSemanticAvailabilitySection(
  role: UserRole,
  userId: string,
  cvs: CvRow[]
): Promise<string> {
  const canSeeCvs = role === 'ta' || role === 'admin';
  if (!canSeeCvs || cvs.length === 0) return '';

  // Count how many CVs have embeddings for semantic search availability
  // Wrapped in try/catch: the embedding column may not exist if db:push hasn't run
  // after the pgvector schema migration, and we must not break the entire chat context.
  try {
    const embeddedCount = await db
      .select({ id: cvPool.id })
      .from(cvPool)
      .where(
        role === 'admin'
          ? sql`${cvPool.embedding} IS NOT NULL`
          : sql`${cvPool.embedding} IS NOT NULL AND ${cvPool.uploadedBy} = ${userId}`
      );
    return `## Semantic Search\n- CVs with embeddings: ${embeddedCount.length}/${cvs.length}\n- Use the semantic_search_cvs tool for meaning-based CV search (finds conceptually relevant CVs even with different terminology)`;
  } catch {
    // pgvector extension or embedding column not available yet — skip silently
    return '';
  }
}

async function fetchChatData(userId: string, userRole: UserRole) {
  const canSeeCvs = userRole === 'ta' || userRole === 'admin';
  const seeAllInterviews = userRole === 'ta' || userRole === 'admin';
  const [cvs, allJobs, allCandidatesRaw, allInterviewsRaw, allScreeningsRaw] =
    await Promise.all([
      canSeeCvs
        ? db
            .select({
              id: cvPool.id,
              extractedName: cvPool.extractedName,
              extractedSkills: cvPool.extractedSkills,
              extractedLanguages: cvPool.extractedLanguages,
              extractedExperiences: cvPool.extractedExperiences,
              createdAt: cvPool.createdAt,
            })
            .from(cvPool)
            .where(userRole === 'admin' ? undefined : eq(cvPool.uploadedBy, userId))
        : Promise.resolve([]),
      db.select({ id: jobs.id, title: jobs.title, seniority: jobs.seniority, status: jobs.status, mustHave: jobs.mustHave, niceToHave: jobs.niceToHave, businessUnit: jobs.businessUnit }).from(jobs),
      db
        .select()
        .from(candidates)
        .orderBy(desc(candidates.createdAt))
        .limit(300),
      seeAllInterviews
        ? db.select().from(interviews).orderBy(desc(interviews.createdAt)).limit(150)
        : db
            .select()
            .from(interviews)
            .where(eq(interviews.interviewerId, userId))
            .orderBy(desc(interviews.createdAt))
            .limit(150),
      db.select().from(screenings).orderBy(desc(screenings.createdAt)).limit(300),
    ]);
  return { cvs, allJobs, allCandidatesRaw, allInterviewsRaw, allScreeningsRaw, seeAllInterviews };
}

export async function getStatisticsChatContext(
  userId: string,
  role: string
): Promise<string> {
  const userRole = role as UserRole;
  const { cvs, allJobs, allCandidatesRaw, allInterviewsRaw, allScreeningsRaw, seeAllInterviews } =
    await fetchChatData(userId, userRole);
  const filteredCandidates = getFilteredCandidates(allCandidatesRaw, userRole);
  const jobMap = new Map(allJobs.map((j) => [j.id, j.title]));
  const sections = [
    buildCvSection(cvs, userRole),
    buildJobsSection(allJobs),
    buildCandidatePipelineSection(filteredCandidates, allCandidatesRaw, jobMap, userRole),
    buildInterviewSection(allInterviewsRaw, jobMap, allCandidatesRaw, seeAllInterviews),
    buildScreeningSection(allScreeningsRaw, jobMap, filteredCandidates, allCandidatesRaw),
    buildSkillGapSection(filteredCandidates, allJobs, cvs),
    await buildSemanticAvailabilitySection(userRole, userId, cvs),
  ].filter((section) => section.length > 0);

  return sections.join('\n\n');
}

export async function askAiAboutStatistics(
  question: string,
  userId: string
): Promise<string> {
  const [cvStats, jobsStats, insights] = await Promise.all([
    getCvPoolStats(userId),
    getJobsStats(userId),
    getSmartInsights(userId),
  ]);

  const dataContext = `
## CV Pool Summary
- Total CVs: ${cvStats.totalCvs}
- Top Skills (name: count): ${cvStats.topSkills.map((s) => `${s.skill} (${s.count})`).join(', ') || 'None'}
- Languages: ${cvStats.languageDistribution.map((l) => `${l.language} (${l.count})`).join(', ') || 'None'}
- Upload Trend (last 7 days): ${cvStats.uploadTrend.map((t) => `${t.date}: ${t.count}`).join(', ')}

## Jobs Summary
- Total Jobs: ${jobsStats.totalJobs}
- By Seniority: ${jobsStats.bySeniority.map((s) => `${s.seniority} (${s.count})`).join(', ') || 'None'}
- By Status: ${jobsStats.byStatus.map((s) => `${s.status} (${s.count})`).join(', ') || 'None'}
- By Business Unit: ${jobsStats.byBusinessUnit.map((b) => `${b.unit} (${b.count})`).join(', ') || 'None'}
- Most Demanded Skills: ${jobsStats.topSkillsDemand.map((s) => `${s.skill} (${s.count})`).join(', ') || 'None'}

## Pipeline & Insights
- Most Demanded Job Profiles: ${insights.mostDemandedJobProfiles.map((p) => `${p.title} (${p.count})`).join(', ') || 'None'}
- Most Common CV Skills: ${insights.mostCommonCvSkills.map((s) => `${s.skill} (${s.count})`).join(', ') || 'None'}
- Skill Gap (demand vs supply): ${insights.skillGapAnalysis.map((g) => `${g.skill}: demand=${g.demand}, supply=${g.supply}`).join('; ') || 'None'}
- Pipeline Funnel: ${Object.entries(insights.pipelineFunnel).map(([stage, count]) => `${stage}=${count}`).join(', ')}
`.trim();

  const systemPrompt = `You are an AI recruitment analytics assistant at Capgemini. You have access to aggregated, anonymized recruitment statistics. Answer questions about trends, skills, pipeline health, and recruitment insights based on the data below. Be concise, data-driven, and actionable. Do not invent data that is not provided. If you cannot answer from the data, say so.

${dataContext}`;

  return callOpenRouter(systemPrompt, question);
}

export async function listChatConversations(userId: string) {
  return db
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
      createdAt: chatConversations.createdAt,
      updatedAt: chatConversations.updatedAt,
    })
    .from(chatConversations)
    .where(eq(chatConversations.userId, userId))
    .orderBy(desc(chatConversations.updatedAt));
}

export async function createChatConversation(userId: string, title?: string) {
  const [conversation] = await db
    .insert(chatConversations)
    .values({ userId, title: title ?? 'New Chat' })
    .returning();

  return conversation;
}

export async function getOrCreateChatConversation(userId: string, conversationId?: string) {
  if (conversationId) {
    const [existing] = await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.userId, userId)
        )
      );

    if (existing) return existing;
  }

  const [latest] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.userId, userId))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(1);

  if (latest) return latest;

  const [conversation] = await db
    .insert(chatConversations)
    .values({ userId })
    .returning();

  return conversation;
}

export async function getChatHistory(conversationId: string) {
  const messages = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt));

  return { conversationId, messages };
}

export async function saveChatMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
) {
  const [message] = await db
    .insert(chatMessages)
    .values({ conversationId, role, content })
    .returning();

  if (role === 'user') {
    const [convo] = await db
      .select({ title: chatConversations.title })
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId));

    if (convo?.title === 'New Chat' || convo?.title === 'Analytics Chat') {
      const title = content.length > 40 ? content.slice(0, 40) + '...' : content;
      await db
        .update(chatConversations)
        .set({ title, updatedAt: new Date() })
        .where(eq(chatConversations.id, conversationId));
    } else {
      await db
        .update(chatConversations)
        .set({ updatedAt: new Date() })
        .where(eq(chatConversations.id, conversationId));
    }
  } else {
    await db
      .update(chatConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversations.id, conversationId));
  }

  return message;
}

export async function deleteChatConversation(conversationId: string, userId: string) {
  await db
    .delete(chatConversations)
    .where(
      and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.userId, userId)
      )
    );
}

export async function clearChatConversation(userId: string) {
  const [conversation] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(eq(chatConversations.userId, userId));

  if (!conversation) return;

  await db
    .delete(chatMessages)
    .where(eq(chatMessages.conversationId, conversation.id));

  await db
    .update(chatConversations)
    .set({ updatedAt: new Date() })
    .where(eq(chatConversations.id, conversation.id));
}
