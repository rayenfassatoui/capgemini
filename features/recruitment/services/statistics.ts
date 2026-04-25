import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidates, cvPool, jobs } from '@/db/schema';
import type { CvPoolStats, JobsStats, SmartInsights } from '../types';

export async function getCvPoolStats(userId: string): Promise<CvPoolStats> {
  // Explicit columns — excludes the 1024-dim embedding vector to avoid transferring
  // megabytes of float data on every dashboard render.
  const cvs = await db
    .select({
      id: cvPool.id,
      extractedSkills: cvPool.extractedSkills,
      extractedLanguages: cvPool.extractedLanguages,
      createdAt: cvPool.createdAt,
    })
    .from(cvPool)
    .where(eq(cvPool.uploadedBy, userId));

  const skillCounts: Record<string, number> = {};
  for (const cv of cvs) {
    for (const skill of cv.extractedSkills ?? []) {
      const normalized = skill.trim();
      if (normalized) {
        skillCounts[normalized] = (skillCounts[normalized] ?? 0) + 1;
      }
    }
  }
  const topSkills = Object.entries(skillCounts)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const langCounts: Record<string, number> = {};
  for (const cv of cvs) {
    for (const lang of cv.extractedLanguages ?? []) {
      const normalized = lang.trim();
      if (normalized) {
        langCounts[normalized] = (langCounts[normalized] ?? 0) + 1;
      }
    }
  }
  const languageDistribution = Object.entries(langCounts)
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count);

  const now = new Date();
  const uploadTrend: Array<{ date: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayCount = cvs.filter((cv) => {
      const cvDate = cv.createdAt?.toISOString().split('T')[0];
      return cvDate === dateStr;
    }).length;
    uploadTrend.push({ date: dateStr, count: dayCount });
  }

  return {
    totalCvs: cvs.length,
    topSkills,
    languageDistribution,
    uploadTrend,
  };
}

export async function getJobsStats(userId: string): Promise<JobsStats> {
  const allJobs = await db
    .select({
      seniority: jobs.seniority,
      status: jobs.status,
      businessUnit: jobs.businessUnit,
      mustHave: jobs.mustHave,
      niceToHave: jobs.niceToHave,
    })
    .from(jobs)
    .where(eq(jobs.createdBy, userId));

  const senCounts: Record<string, number> = {};
  for (const j of allJobs) {
    senCounts[j.seniority] = (senCounts[j.seniority] ?? 0) + 1;
  }
  const bySeniority = Object.entries(senCounts)
    .map(([seniority, count]) => ({ seniority, count }))
    .sort((a, b) => b.count - a.count);

  const statusCounts: Record<string, number> = {};
  for (const j of allJobs) {
    statusCounts[j.status] = (statusCounts[j.status] ?? 0) + 1;
  }
  const byStatus = Object.entries(statusCounts)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const buCounts: Record<string, number> = {};
  for (const j of allJobs) {
    const unit = j.businessUnit ?? 'Unspecified';
    buCounts[unit] = (buCounts[unit] ?? 0) + 1;
  }
  const byBusinessUnit = Object.entries(buCounts)
    .map(([unit, count]) => ({ unit, count }))
    .sort((a, b) => b.count - a.count);

  const skillDemand: Record<string, number> = {};
  for (const j of allJobs) {
    for (const skill of [...j.mustHave, ...j.niceToHave]) {
      const normalized = skill.trim();
      if (normalized) {
        skillDemand[normalized] = (skillDemand[normalized] ?? 0) + 1;
      }
    }
  }
  const topSkillsDemand = Object.entries(skillDemand)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalJobs: allJobs.length,
    bySeniority,
    byStatus,
    byBusinessUnit,
    topSkillsDemand,
  };
}

export async function getSmartInsights(userId: string): Promise<SmartInsights> {
  // Run all three queries in parallel — no sequential dependency between them.
  const [allJobs, allCvs, allCandidates] = await Promise.all([
    db
      .select({
        title: jobs.title,
        mustHave: jobs.mustHave,
      })
      .from(jobs)
      .where(eq(jobs.createdBy, userId)),
    db
      .select({
        extractedSkills: cvPool.extractedSkills,
      })
      .from(cvPool)
      .where(eq(cvPool.uploadedBy, userId)),
    db.select({ stage: candidates.stage }).from(candidates),
  ]);

  const titleCounts: Record<string, number> = {};
  for (const j of allJobs) {
    const base = j.title.replace(/^(senior|junior|lead|principal|staff)\s+/i, '').trim();
    titleCounts[base] = (titleCounts[base] ?? 0) + 1;
  }
  const mostDemandedJobProfiles = Object.entries(titleCounts)
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const cvSkillCounts: Record<string, number> = {};
  for (const cv of allCvs) {
    for (const skill of cv.extractedSkills ?? []) {
      const normalized = skill.trim();
      if (normalized) {
        cvSkillCounts[normalized] = (cvSkillCounts[normalized] ?? 0) + 1;
      }
    }
  }
  const mostCommonCvSkills = Object.entries(cvSkillCounts)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const jobSkillCounts: Record<string, number> = {};
  for (const j of allJobs) {
    for (const skill of j.mustHave) {
      const normalized = skill.trim().toLowerCase();
      if (normalized) {
        jobSkillCounts[normalized] = (jobSkillCounts[normalized] ?? 0) + 1;
      }
    }
  }
  const cvSkillCountsLower: Record<string, number> = {};
  for (const cv of allCvs) {
    for (const skill of cv.extractedSkills ?? []) {
      const normalized = skill.trim().toLowerCase();
      if (normalized) {
        cvSkillCountsLower[normalized] = (cvSkillCountsLower[normalized] ?? 0) + 1;
      }
    }
  }
  const allSkillKeys = new Set([...Object.keys(jobSkillCounts), ...Object.keys(cvSkillCountsLower)]);
  const skillGapAnalysis = Array.from(allSkillKeys)
    .map((skill) => ({
      skill,
      demand: jobSkillCounts[skill] ?? 0,
      supply: cvSkillCountsLower[skill] ?? 0,
    }))
    .sort((a, b) => (b.demand - b.supply) - (a.demand - a.supply))
    .slice(0, 10);

  const pipelineFunnel: Record<string, number> = {
    new: 0,
    ta_screening: 0,
    ta_interview: 0,
    ta_accepted: 0,
    ta_rejected: 0,
    manager_interview: 0,
    manager_accepted: 0,
    manager_rejected: 0,
    hr_interview: 0,
    hr_accepted: 0,
    hr_rejected: 0,
    hired: 0,
  };
  for (const c of allCandidates) {
    if (c.stage in pipelineFunnel) {
      pipelineFunnel[c.stage]++;
    }
  }

  return {
    mostDemandedJobProfiles,
    mostCommonCvSkills,
    skillGapAnalysis,
    pipelineFunnel: pipelineFunnel as SmartInsights['pipelineFunnel'],
  };
}
