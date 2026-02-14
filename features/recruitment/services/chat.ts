import { and, asc, desc, eq } from 'drizzle-orm';
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

export async function getStatisticsChatContext(
  userId: string,
  role: string
): Promise<string> {
  const canSeeCvs = role === 'ta' || role === 'admin';
  const seeAllInterviews = role === 'ta' || role === 'admin';

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
            .where(role === 'admin' ? undefined : eq(cvPool.uploadedBy, userId))
        : Promise.resolve([]),
      db.select().from(jobs),
      db
        .select()
        .from(candidates)
        .orderBy(desc(candidates.createdAt)),
      seeAllInterviews
        ? db.select().from(interviews).orderBy(desc(interviews.createdAt))
        : db
            .select()
            .from(interviews)
            .where(eq(interviews.interviewerId, userId))
            .orderBy(desc(interviews.createdAt)),
      db.select().from(screenings),
    ]);

  const roleStagePrefixes: Record<string, string[]> = {
    ta: [],
    admin: [],
    manager: ['manager_interview', 'manager_accepted', 'manager_rejected', 'hr_interview', 'hr_accepted', 'hr_rejected', 'hired'],
    hr: ['hr_interview', 'hr_accepted', 'hr_rejected', 'hired'],
  };

  const allowedPrefixes = roleStagePrefixes[role] ?? [];
  const filteredCandidates =
    allowedPrefixes.length === 0
      ? allCandidatesRaw
      : allCandidatesRaw.filter((c) => allowedPrefixes.includes(c.stage));

  const sections: string[] = [];

  if (canSeeCvs && cvs.length > 0) {
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

    sections.push(
      `## CV Pool\n- Total CVs: ${cvs.length}\n- Top Skills: ${topSkills || 'None'}\n- Languages: ${topLangs || 'None'}`
    );

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
  }

  if (allJobs.length > 0) {
    const jobLines = allJobs
      .map(
        (j) =>
          `- "${j.title}" [${j.seniority}] Status: ${j.status} | Must-Have: ${j.mustHave.join(', ')} | Nice-to-Have: ${j.niceToHave.join(', ')}${j.businessUnit ? ` | BU: ${j.businessUnit}` : ''}`
      )
      .join('\n');
    sections.push(`## Jobs (${allJobs.length} total)\n${jobLines}`);
  }

  if (role === 'ta' || role === 'admin') {
    const stageCounts: Record<string, number> = {};
    for (const c of allCandidatesRaw) {
      stageCounts[c.stage] = (stageCounts[c.stage] ?? 0) + 1;
    }
    sections.push(
      `## Full Candidate Pipeline (${allCandidatesRaw.length} total)\n- ${
        Object.entries(stageCounts)
          .map(([s, c]) => `${s}: ${c}`)
          .join(', ') || 'No candidates'
      }`
    );
  }

  const stageCounts: Record<string, number> = {};
  for (const c of filteredCandidates) {
    stageCounts[c.stage] = (stageCounts[c.stage] ?? 0) + 1;
  }

  if (role === 'manager' || role === 'hr') {
    sections.push(
      `## Your Candidates (${filteredCandidates.length} total, ${role}-stage and beyond)\n- ${
        Object.entries(stageCounts)
          .map(([s, c]) => `${s}: ${c}`)
          .join(', ') || 'No candidates'
      }`
    );
  }

  const jobMap = new Map(allJobs.map((j) => [j.id, j.title]));

  // Explicit per-stage candidate lists so the LLM can answer "who is hired/rejected/etc." accurately
  const keyStages = ['hired', 'hr_accepted', 'hr_rejected', 'manager_accepted', 'manager_rejected', 'ta_accepted', 'ta_rejected'] as const;
  const stageGrouped: Record<string, string[]> = {};
  for (const c of filteredCandidates) {
    if (!stageGrouped[c.stage]) stageGrouped[c.stage] = [];
    stageGrouped[c.stage].push(`${c.fullName} (Job: ${jobMap.get(c.jobId) ?? 'Unknown'})`);
  }

  const stageListLines: string[] = [];
  for (const stage of keyStages) {
    const names = stageGrouped[stage];
    if (names && names.length > 0) {
      stageListLines.push(`### ${stage}\n${names.map((n) => `- ${n}`).join('\n')}`);
    }
  }
  // Also include remaining stages not in keyStages
  for (const [stage, names] of Object.entries(stageGrouped)) {
    if (!(keyStages as readonly string[]).includes(stage) && names.length > 0) {
      stageListLines.push(`### ${stage}\n${names.map((n) => `- ${n}`).join('\n')}`);
    }
  }
  if (stageListLines.length > 0) {
    sections.push(`## Candidates by Stage (EXACT - use these names when asked)\n${stageListLines.join('\n')}`);
  }

  const recentCandidates = filteredCandidates.slice(0, 20);
  if (recentCandidates.length > 0) {
    const candLines = recentCandidates
      .map(
        (c) =>
          `- ${c.fullName} | Job: ${jobMap.get(c.jobId) ?? 'Unknown'} | Stage: ${c.stage} | ${c.createdAt?.toISOString().split('T')[0] ?? ''}`
      )
      .join('\n');
    sections.push(`## Recent Candidates\n${candLines}`);
  }

  if (allInterviewsRaw.length > 0) {
    const ivStageCounts: Record<string, number> = {};
    const ivStatusCounts: Record<string, number> = {};
    for (const iv of allInterviewsRaw) {
      ivStageCounts[iv.stage] = (ivStageCounts[iv.stage] ?? 0) + 1;
      ivStatusCounts[iv.status] = (ivStatusCounts[iv.status] ?? 0) + 1;
    }
    const ivLabel = seeAllInterviews ? 'All Interviews' : 'Your Interviews';
    sections.push(
      `## ${ivLabel} (${allInterviewsRaw.length} total)\n- By Stage: ${Object.entries(ivStageCounts).map(([s, c]) => `${s}: ${c}`).join(', ')}\n- By Status: ${Object.entries(ivStatusCounts).map(([s, c]) => `${s}: ${c}`).join(', ')}`
    );

    const candMap = new Map(
      allCandidatesRaw.map((c) => [c.id, c.fullName])
    );
    const ivLines = allInterviewsRaw
      .slice(0, 30)
      .map(
        (iv) =>
          `- ${candMap.get(iv.candidateId) ?? 'Unknown'} | Job: ${jobMap.get(iv.jobId) ?? 'Unknown'} | Stage: ${iv.stage} | Date: ${iv.scheduledDate} ${iv.scheduledTime} | Status: ${iv.status}`
      )
      .join('\n');
    sections.push(`## Interview Schedule\n${ivLines}`);
  }

  if (allScreeningsRaw.length > 0) {
    const avgScore =
      allScreeningsRaw.reduce((sum, s) => sum + s.score, 0) /
      allScreeningsRaw.length;
    const candMap = new Map(
      allCandidatesRaw.map((c) => [c.id, c.fullName])
    );
    const topScreen = [...allScreeningsRaw]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(
        (s) =>
          `- ${candMap.get(s.candidateId) ?? 'Unknown'}: ${s.score.toFixed(0)}% (Must: ${s.mustMatchScore.toFixed(0)}%, Nice: ${s.niceMatchScore.toFixed(0)}%) Gaps: ${s.gaps.join(', ') || 'None'}`
      )
      .join('\n');
    sections.push(
      `## Screening Results\n- Total: ${allScreeningsRaw.length} | Avg Score: ${avgScore.toFixed(1)}%\n${topScreen}`
    );
  }

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

  if (gapAnalysis.length > 0) {
    const gapLines = gapAnalysis
      .map(
        (g) =>
          `- ${g.skill}: demand=${g.demand}, supply=${g.supply}, gap=${g.demand - g.supply}`
      )
      .join('\n');
    sections.push(`## Skill Gap (Demand vs Supply)\n${gapLines}`);
  }

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
