import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq, sql } from 'drizzle-orm';
import * as schema from './schema';

/**
 * Seed script: creates candidates from existing CVs + jobs, then populates
 * interviews across all pipeline stages with realistic scheduled dates.
 *
 * Run: bun run db/seed-interviews.ts
 */

// Helper to generate a Google Meet-style link
function meetLink() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const seg = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * 26)]).join('');
  return `https://meet.google.com/${seg(3)}-${seg(4)}-${seg(3)}`;
}

// Helper for a random time between 09:00 and 17:00
function randomTime() {
  const h = 9 + Math.floor(Math.random() * 8);
  const m = Math.random() > 0.5 ? '00' : '30';
  return `${h.toString().padStart(2, '0')}:${m}`;
}

// Helper: date string YYYY-MM-DD offset from today
function dateOffset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

async function main() {
  console.log('Seeding interviews & pipeline data...\n');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set.');
  }

  const sqlClient = neon(process.env.DATABASE_URL);
  const db = drizzle(sqlClient, { schema });

  // Fetch users by role
  const allUsers = await db.select().from(schema.users);
  const taUser = allUsers.find((u) => u.role === 'ta');
  const managerUser = allUsers.find((u) => u.role === 'manager');
  const hrUser = allUsers.find((u) => u.role === 'hr');

  if (!taUser) {
    console.error('No TA user found. Run seed-users.ts first.');
    process.exit(1);
  }
  if (!managerUser) {
    console.error('No Manager user found. Run seed-users.ts first.');
    process.exit(1);
  }
  if (!hrUser) {
    console.error('No HR user found. Run seed-users.ts first.');
    process.exit(1);
  }

  console.log(`TA: ${taUser.email}`);
  console.log(`Manager: ${managerUser.email}`);
  console.log(`HR: ${hrUser.email}\n`);

  // Fetch existing CVs and Jobs
  const cvs = await db.select().from(schema.cvPool).orderBy(schema.cvPool.createdAt);
  const jobs = await db.select().from(schema.jobs).orderBy(schema.jobs.createdAt);

  if (cvs.length === 0) {
    console.error('No CVs found. Upload CVs first.');
    process.exit(1);
  }
  if (jobs.length === 0) {
    console.error('No jobs found. Run seed-jobs.ts first.');
    process.exit(1);
  }

  console.log(`Found ${cvs.length} CVs and ${jobs.length} jobs.\n`);

  // Take up to 30 CVs and spread them across jobs + stages
  const cvsToUse = cvs.slice(0, 30);
  const stageScenarios: Array<{
    stage: typeof schema.candidateStageEnum.enumValues[number];
    createInterviews: Array<{
      stage: 'ta' | 'manager' | 'hr';
      status: 'scheduled' | 'completed' | 'cancelled';
      dayOffset: number;
      withReport: boolean;
      decision?: 'accepted' | 'rejected' | 'pending';
      score?: number;
    }>;
    createScreening: boolean;
  }> = [
    // 1. New candidates (3)
    { stage: 'new', createInterviews: [], createScreening: false },
    { stage: 'new', createInterviews: [], createScreening: false },
    { stage: 'new', createInterviews: [], createScreening: false },

    // 2. TA screening done (2)
    { stage: 'ta_screening', createInterviews: [], createScreening: true },
    { stage: 'ta_screening', createInterviews: [], createScreening: true },

    // 3. TA interview scheduled (future) (2)
    {
      stage: 'ta_interview',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'scheduled', dayOffset: 2, withReport: false },
      ],
    },
    {
      stage: 'ta_interview',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'scheduled', dayOffset: 5, withReport: false },
      ],
    },

    // 4. TA interview completed, accepted -> waiting manager (3)
    {
      stage: 'ta_accepted',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -5, withReport: true, decision: 'accepted', score: 82 },
      ],
    },
    {
      stage: 'ta_accepted',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -3, withReport: true, decision: 'accepted', score: 75 },
      ],
    },
    {
      stage: 'ta_accepted',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -7, withReport: true, decision: 'accepted', score: 90 },
      ],
    },

    // 5. TA rejected (2)
    {
      stage: 'ta_rejected',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -8, withReport: true, decision: 'rejected', score: 35 },
      ],
    },
    {
      stage: 'ta_rejected',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -6, withReport: true, decision: 'rejected', score: 42 },
      ],
    },

    // 6. Manager interview scheduled (2)
    {
      stage: 'manager_interview',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -10, withReport: true, decision: 'accepted', score: 78 },
        { stage: 'manager', status: 'scheduled', dayOffset: 1, withReport: false },
      ],
    },
    {
      stage: 'manager_interview',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -12, withReport: true, decision: 'accepted', score: 85 },
        { stage: 'manager', status: 'scheduled', dayOffset: 3, withReport: false },
      ],
    },

    // 7. Manager accepted (2)
    {
      stage: 'manager_accepted',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -15, withReport: true, decision: 'accepted', score: 88 },
        { stage: 'manager', status: 'completed', dayOffset: -4, withReport: true, decision: 'accepted', score: 80 },
      ],
    },
    {
      stage: 'manager_accepted',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -14, withReport: true, decision: 'accepted', score: 77 },
        { stage: 'manager', status: 'completed', dayOffset: -2, withReport: true, decision: 'accepted', score: 92 },
      ],
    },

    // 8. Manager rejected (1)
    {
      stage: 'manager_rejected',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -16, withReport: true, decision: 'accepted', score: 70 },
        { stage: 'manager', status: 'completed', dayOffset: -6, withReport: true, decision: 'rejected', score: 40 },
      ],
    },

    // 9. HR interview scheduled (2)
    {
      stage: 'hr_interview',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -20, withReport: true, decision: 'accepted', score: 85 },
        { stage: 'manager', status: 'completed', dayOffset: -10, withReport: true, decision: 'accepted', score: 88 },
        { stage: 'hr', status: 'scheduled', dayOffset: 0, withReport: false }, // today!
      ],
    },
    {
      stage: 'hr_interview',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -18, withReport: true, decision: 'accepted', score: 80 },
        { stage: 'manager', status: 'completed', dayOffset: -8, withReport: true, decision: 'accepted', score: 75 },
        { stage: 'hr', status: 'scheduled', dayOffset: 4, withReport: false },
      ],
    },

    // 10. HR accepted (2)
    {
      stage: 'hr_accepted',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -25, withReport: true, decision: 'accepted', score: 92 },
        { stage: 'manager', status: 'completed', dayOffset: -15, withReport: true, decision: 'accepted', score: 90 },
        { stage: 'hr', status: 'completed', dayOffset: -3, withReport: true, decision: 'accepted', score: 85 },
      ],
    },
    {
      stage: 'hr_accepted',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -22, withReport: true, decision: 'accepted', score: 88 },
        { stage: 'manager', status: 'completed', dayOffset: -12, withReport: true, decision: 'accepted', score: 82 },
        { stage: 'hr', status: 'completed', dayOffset: -1, withReport: true, decision: 'accepted', score: 90 },
      ],
    },

    // 11. HR rejected (1)
    {
      stage: 'hr_rejected',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -24, withReport: true, decision: 'accepted', score: 72 },
        { stage: 'manager', status: 'completed', dayOffset: -14, withReport: true, decision: 'accepted', score: 68 },
        { stage: 'hr', status: 'completed', dayOffset: -2, withReport: true, decision: 'rejected', score: 45 },
      ],
    },

    // 12. Hired (3)
    {
      stage: 'hired',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -30, withReport: true, decision: 'accepted', score: 95 },
        { stage: 'manager', status: 'completed', dayOffset: -20, withReport: true, decision: 'accepted', score: 93 },
        { stage: 'hr', status: 'completed', dayOffset: -10, withReport: true, decision: 'accepted', score: 91 },
      ],
    },
    {
      stage: 'hired',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -28, withReport: true, decision: 'accepted', score: 89 },
        { stage: 'manager', status: 'completed', dayOffset: -18, withReport: true, decision: 'accepted', score: 87 },
        { stage: 'hr', status: 'completed', dayOffset: -8, withReport: true, decision: 'accepted', score: 85 },
      ],
    },
    {
      stage: 'hired',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -35, withReport: true, decision: 'accepted', score: 94 },
        { stage: 'manager', status: 'completed', dayOffset: -25, withReport: true, decision: 'accepted', score: 91 },
        { stage: 'hr', status: 'completed', dayOffset: -15, withReport: true, decision: 'accepted', score: 88 },
      ],
    },

    // 13. Extra scheduled interviews today and near-future for testing date queries
    {
      stage: 'ta_interview',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'scheduled', dayOffset: 0, withReport: false }, // today
      ],
    },
    {
      stage: 'manager_interview',
      createScreening: true,
      createInterviews: [
        { stage: 'ta', status: 'completed', dayOffset: -9, withReport: true, decision: 'accepted', score: 76 },
        { stage: 'manager', status: 'scheduled', dayOffset: 0, withReport: false }, // today
      ],
    },
  ];

  const interviewerMap: Record<string, string> = {
    ta: taUser.id,
    manager: managerUser.id,
    hr: hrUser.id,
  };

  let candidateCount = 0;
  let interviewCount = 0;
  let reportCount = 0;
  let screeningCount = 0;

  for (let i = 0; i < stageScenarios.length && i < cvsToUse.length; i++) {
    const cv = cvsToUse[i];
    const scenario = stageScenarios[i];
    const job = jobs[i % jobs.length];

    // Check if candidate already exists for this CV + Job
    const existingCand = await db
      .select()
      .from(schema.candidates)
      .where(
        sql`${schema.candidates.cvId} = ${cv.id} AND ${schema.candidates.jobId} = ${job.id}`
      )
      .limit(1);

    let candidateId: string;

    if (existingCand.length > 0) {
      candidateId = existingCand[0].id;
      // Update stage
      await db
        .update(schema.candidates)
        .set({ stage: scenario.stage, updatedAt: new Date() })
        .where(eq(schema.candidates.id, candidateId));
      console.log(`[UPDATE] ${cv.extractedName ?? cv.filename} -> ${scenario.stage}`);
    } else {
      const [newCand] = await db
        .insert(schema.candidates)
        .values({
          fullName: cv.extractedName ?? `Candidate ${i + 1}`,
          email: cv.extractedEmail ?? `candidate${i + 1}@example.com`,
          phone: cv.extractedPhone ?? null,
          cvId: cv.id,
          jobId: job.id,
          stage: scenario.stage,
          assignedBy: taUser.id,
        })
        .returning();
      candidateId = newCand.id;
      candidateCount++;
      console.log(
        `[CREATE] Candidate: ${cv.extractedName ?? cv.filename} -> Job: "${job.title.slice(0, 40)}..." Stage: ${scenario.stage}`
      );
    }

    // Create screening if needed
    if (scenario.createScreening) {
      const existingScreen = await db
        .select()
        .from(schema.screenings)
        .where(
          sql`${schema.screenings.candidateId} = ${candidateId} AND ${schema.screenings.jobId} = ${job.id}`
        )
        .limit(1);

      if (existingScreen.length === 0) {
        const mustScore = 50 + Math.random() * 50;
        const niceScore = 30 + Math.random() * 70;
        const score = mustScore * 0.7 + niceScore * 0.3;
        const cvSkills = (cv.extractedSkills ?? []).map((s) => s.toLowerCase());
        const matchedMust = job.mustHave.filter((s) =>
          cvSkills.some((cs) => cs.includes(s.toLowerCase()))
        );
        const gaps = job.mustHave.filter(
          (s) => !cvSkills.some((cs) => cs.includes(s.toLowerCase()))
        );
        const matchedNice = job.niceToHave.filter((s) =>
          cvSkills.some((cs) => cs.includes(s.toLowerCase()))
        );

        await db.insert(schema.screenings).values({
          candidateId,
          jobId: job.id,
          score: Math.round(score),
          mustMatchScore: Math.round(mustScore),
          niceMatchScore: Math.round(niceScore),
          gaps,
          matchedMustHave: matchedMust,
          matchedNiceToHave: matchedNice,
          aiSummary: `Auto-generated screening for ${cv.extractedName ?? 'candidate'}. Match score: ${Math.round(score)}%.`,
        });
        screeningCount++;
      }
    }

    // Create interviews
    for (const iv of scenario.createInterviews) {
      const scheduledDate = dateOffset(iv.dayOffset);

      // Check existing
      const existingIv = await db
        .select()
        .from(schema.interviews)
        .where(
          sql`${schema.interviews.candidateId} = ${candidateId} AND ${schema.interviews.stage} = ${iv.stage}`
        )
        .limit(1);

      let interviewId: string;

      if (existingIv.length > 0) {
        interviewId = existingIv[0].id;
      } else {
        const [newIv] = await db
          .insert(schema.interviews)
          .values({
            candidateId,
            jobId: job.id,
            interviewerId: interviewerMap[iv.stage],
            stage: iv.stage,
            status: iv.status,
            scheduledDate,
            scheduledTime: randomTime(),
            meetLink: meetLink(),
            emailSent: true,
            emailSentAt: new Date(),
          })
          .returning();
        interviewId = newIv.id;
        interviewCount++;
        console.log(
          `  [IV] ${iv.stage} interview on ${scheduledDate} (${iv.status})`
        );
      }

      // Create report if needed
      if (iv.withReport && iv.decision && iv.score !== undefined) {
        const existingReport = await db
          .select()
          .from(schema.interviewReports)
          .where(eq(schema.interviewReports.interviewId, interviewId))
          .limit(1);

        if (existingReport.length === 0) {
          await db.insert(schema.interviewReports).values({
            interviewId,
            candidateId,
            interviewerId: interviewerMap[iv.stage],
            stage: iv.stage,
            notes: `${iv.stage.toUpperCase()} interview completed. Candidate showed ${iv.decision === 'accepted' ? 'strong' : 'insufficient'} performance.`,
            candidateAnswers: [
              {
                question: `Tell me about your experience relevant to this role.`,
                answer: `Candidate discussed their background in ${(cv.extractedSkills ?? []).slice(0, 3).join(', ') || 'various technologies'}.`,
              },
              {
                question: `What are your strengths?`,
                answer: `Candidate highlighted proficiency in ${(cv.extractedSkills ?? []).slice(0, 2).join(' and ') || 'their field'}.`,
              },
            ],
            overallEvaluation:
              iv.decision === 'accepted'
                ? `Strong candidate. Recommended to proceed to next stage.`
                : `Candidate did not meet the bar for this position. Not recommended.`,
            score: iv.score,
            decision: iv.decision,
          });
          reportCount++;
        }
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Candidates created: ${candidateCount}`);
  console.log(`Screenings created: ${screeningCount}`);
  console.log(`Interviews created: ${interviewCount}`);
  console.log(`Reports created: ${reportCount}`);

  // Print pipeline breakdown
  const allCandidates = await db
    .select({ stage: schema.candidates.stage })
    .from(schema.candidates);
  const breakdown: Record<string, number> = {};
  for (const c of allCandidates) {
    breakdown[c.stage] = (breakdown[c.stage] ?? 0) + 1;
  }
  console.log('\n--- Pipeline Breakdown ---');
  for (const [stage, count] of Object.entries(breakdown).sort()) {
    console.log(`  ${stage.padEnd(22)} ${count}`);
  }

  // Print upcoming interviews
  const upcoming = await db
    .select({
      stage: schema.interviews.stage,
      date: schema.interviews.scheduledDate,
      time: schema.interviews.scheduledTime,
      status: schema.interviews.status,
    })
    .from(schema.interviews)
    .where(sql`${schema.interviews.scheduledDate} >= ${dateOffset(0)}`)
    .orderBy(schema.interviews.scheduledDate);

  console.log(`\n--- Upcoming/Today Interviews (${upcoming.length}) ---`);
  for (const iv of upcoming) {
    console.log(`  ${iv.date} ${iv.time} | ${iv.stage} | ${iv.status}`);
  }

  console.log('\nDone!');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
