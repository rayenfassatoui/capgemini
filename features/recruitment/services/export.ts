import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidates, cvPool } from '@/db/schema';
import { getJob } from './jobs';
import { getInterviewReportsByCandidate } from './interview-reports';
import { zipSync } from 'fflate';
import { getEmailLogs } from './admin';
import { getActivityLogEnriched } from './activity-log';
import { getHiredCandidatesOnboardingDetailed } from './admin';

export async function exportAcceptedCandidatesToExcel(): Promise<Buffer> {
  const acceptedCandidates = await db
    .select()
    .from(candidates)
    .where(inArray(candidates.stage, ['hr_accepted', 'hired']));

  const rows: Array<Record<string, string>> = [];
  for (const candidate of acceptedCandidates) {
    const [cv] = await db.select().from(cvPool).where(eq(cvPool.id, candidate.cvId));
    const job = await getJob(candidate.jobId);
    const reports = await getInterviewReportsByCandidate(candidate.id);

    rows.push({
      'Candidate Name': candidate.fullName,
      Email: candidate.email,
      Phone: candidate.phone ?? '',
      'Job Title': job?.title ?? '',
      Stage: candidate.stage,
      Skills: (cv?.extractedSkills ?? []).join(', '),
      Languages: (cv?.extractedLanguages ?? []).join(', '),
      Summary: cv?.extractedSummary ?? '',
      'TA Score': reports.find((r) => r.stage === 'ta')?.score?.toString() ?? '',
      'Manager Score': reports.find((r) => r.stage === 'manager')?.score?.toString() ?? '',
      'HR Score': reports.find((r) => r.stage === 'hr')?.score?.toString() ?? '',
    });
  }

  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Accepted Candidates');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(buffer);
}

export async function exportCvPoolToExcel(userId: string): Promise<Buffer> {
  const cvs = await db
    .select()
    .from(cvPool)
    .where(eq(cvPool.uploadedBy, userId))
    .orderBy(desc(cvPool.createdAt));

  const rows = cvs.map((cv) => ({
    'Name': cv.extractedName ?? 'Unknown',
    'Email': cv.extractedEmail ?? '',
    'Phone': cv.extractedPhone ?? '',
    'Skills': (cv.extractedSkills ?? []).join(', '),
    'Languages': (cv.extractedLanguages ?? []).join(', '),
    'Education': (cv.extractedEducation ?? [])
      .map((e) => Object.values(e).join(' - '))
      .join('; '),
    'Experience': (cv.extractedExperiences ?? [])
      .map((e) => Object.values(e).join(' - '))
      .join('; '),
    'Summary': cv.extractedSummary ?? '',
    'Filename': cv.filename,
    'Uploaded': cv.createdAt?.toISOString().split('T')[0] ?? '',
  }));

  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'CV Pool');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(buffer);
}

export async function exportSingleCvToExcel(cvId: string): Promise<Buffer> {
  const [cv] = await db.select().from(cvPool).where(eq(cvPool.id, cvId));
  if (!cv) throw new Error('CV not found');

  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const rows: string[][] = [];

  rows.push(['CURRICULUM VITAE']);
  rows.push([]);
  rows.push(['Name', cv.extractedName ?? 'Unknown']);
  rows.push(['Email', cv.extractedEmail ?? '']);
  rows.push(['Phone', cv.extractedPhone ?? '']);
  rows.push([]);

  if (cv.extractedSummary) {
    rows.push(['PROFESSIONAL SUMMARY']);
    rows.push([cv.extractedSummary]);
    rows.push([]);
  }

  const skills = cv.extractedSkills ?? [];
  if (skills.length > 0) {
    rows.push(['SKILLS']);
    for (let i = 0; i < skills.length; i += 4) {
      rows.push(skills.slice(i, i + 4));
    }
    rows.push([]);
  }

  const experiences = cv.extractedExperiences ?? [];
  if (experiences.length > 0) {
    rows.push(['PROFESSIONAL EXPERIENCE']);
    for (const exp of experiences) {
      const title = exp.title ?? exp.Title ?? exp.role ?? exp.Role ?? '';
      const company = exp.company ?? exp.Company ?? exp.organization ?? '';
      const duration = exp.duration ?? exp.Duration ?? exp.period ?? exp.dates ?? '';
      rows.push([title, company, duration]);
    }
    rows.push([]);
  }

  const education = cv.extractedEducation ?? [];
  if (education.length > 0) {
    rows.push(['EDUCATION']);
    for (const edu of education) {
      const degree = edu.degree ?? edu.Degree ?? edu.diploma ?? '';
      const school = edu.school ?? edu.School ?? edu.institution ?? edu.university ?? '';
      const year = edu.year ?? edu.Year ?? edu.date ?? '';
      rows.push([degree, school, year]);
    }
    rows.push([]);
  }

  const languages = cv.extractedLanguages ?? [];
  if (languages.length > 0) {
    rows.push(['LANGUAGES']);
    rows.push(languages);
    rows.push([]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 30 },
    { wch: 30 },
    { wch: 20 },
    { wch: 20 },
  ];
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
  ];

  const candidateName = cv.extractedName ?? 'candidate';
  const safeName = candidateName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  XLSX.utils.book_append_sheet(workbook, worksheet, safeName);

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(buffer);
}

export async function exportMultipleCvsAsZip(cvIds: string[]): Promise<Buffer> {
  const cvs = await db
    .select()
    .from(cvPool)
    .where(inArray(cvPool.id, cvIds));

  const files: Record<string, Uint8Array> = {};
  const usedNames = new Set<string>();

  for (const cv of cvs) {
    const excelBuffer = await exportSingleCvToExcel(cv.id);
    const candidateName = cv.extractedName ?? cv.filename.replace(/\.[^.]+$/, '');
    let safeName = candidateName.replace(/[^a-zA-Z0-9 _-]/g, '_').trim();
    if (!safeName) safeName = 'candidate';

    let fileName = `${safeName}.xlsx`;
    let counter = 1;
    while (usedNames.has(fileName.toLowerCase())) {
      fileName = `${safeName}_${counter}.xlsx`;
      counter++;
    }
    usedNames.add(fileName.toLowerCase());

    files[fileName] = new Uint8Array(excelBuffer);
  }

  if (Object.keys(files).length === 0) {
    throw new Error('No CVs found for the given IDs');
  }

  const zipped = zipSync(files, { level: 6 });
  return Buffer.from(zipped);
}

// ---------- Email Logs Excel Export ----------

export async function exportEmailLogsToExcel(): Promise<Buffer> {
  const logs = await getEmailLogs(5000);

  const rows = logs.map((log) => ({
    'Recipient Email': log.toEmail,
    'Recipient Name': log.toName ?? '',
    'Subject': log.subject,
    'Status': log.status,
    'Candidate Phase': log.candidateStage ?? 'N/A',
    'Sent By': log.sentByName,
    'Sent By Email': log.sentByEmail,
    'Date': log.createdAt.toISOString().split('T')[0],
    'Time': log.createdAt.toISOString().split('T')[1]?.split('.')[0] ?? '',
  }));

  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Email Logs');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(buffer);
}

// ---------- Activity Log Excel Export ----------

export async function exportActivityLogToExcel(): Promise<Buffer> {
  const entries = await getActivityLogEnriched(5000);

  const rows = entries.map((entry) => ({
    'User': entry.userName,
    'User Email': entry.userEmail,
    'Action': entry.action,
    'Entity Type': entry.entityType,
    'Entity ID': entry.entityId ?? '',
    'Candidate Phase': entry.candidateStage ?? 'N/A',
    'Details': entry.details ?? '',
    'Date': entry.createdAt ? entry.createdAt.toISOString().split('T')[0] : '',
    'Time': entry.createdAt ? (entry.createdAt.toISOString().split('T')[1]?.split('.')[0] ?? '') : '',
  }));

  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Activity Log');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(buffer);
}

// ---------- Onboarding Excel Export (with CV + education + stage) ----------

export async function exportOnboardingToExcel(): Promise<Buffer> {
  const entries = await getHiredCandidatesOnboardingDetailed();

  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Overview
  const overviewRows = entries.map((c) => ({
    'Candidate Name': c.candidateName,
    'Email': c.candidateEmail,
    'Phone': c.candidatePhone ?? '',
    'Stage': c.candidateStage,
    'Job Title': c.jobTitle,
    'Total Tasks': c.totalTasks,
    'Completed Tasks': c.completedTasks,
    'Progress': c.totalTasks > 0 ? `${Math.round((c.completedTasks / c.totalTasks) * 100)}%` : '0%',
    'Hired Date': c.hiredAt.toISOString().split('T')[0],
  }));
  const overviewSheet = XLSX.utils.json_to_sheet(overviewRows);
  XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');

  // Sheet 2: CV Education & Skills
  const cvRows = entries.map((c) => ({
    'Candidate Name': c.candidateName,
    'Skills': c.cvSkills.join(', '),
    'Languages': c.cvLanguages.join(', '),
    'Education': c.cvEducation
      .map((e) => Object.values(e).join(' - '))
      .join('; '),
    'Experience': c.cvExperiences
      .map((e) => Object.values(e).join(' - '))
      .join('; '),
    'Summary': c.cvSummary ?? '',
  }));
  const cvSheet = XLSX.utils.json_to_sheet(cvRows);
  XLSX.utils.book_append_sheet(workbook, cvSheet, 'CV Data');

  // Sheet 3: Onboarding Tasks
  const taskRows: Array<Record<string, string>> = [];
  for (const c of entries) {
    for (const task of c.tasks) {
      taskRows.push({
        'Candidate Name': c.candidateName,
        'Task': task.title,
        'Description': task.description ?? '',
        'Completed': task.completed ? 'Yes' : 'No',
        'Completed At': task.completedAt ? task.completedAt.toISOString().split('T')[0] : '',
      });
    }
  }
  const taskSheet = XLSX.utils.json_to_sheet(taskRows);
  XLSX.utils.book_append_sheet(workbook, taskSheet, 'Onboarding Tasks');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(buffer);
}

// ---------- Accept Workflow Excel (multi-sheet: candidate + CV + reports) ----------

export async function generateCandidateAcceptExcel(
  candidateId: string,
  stage: 'ta' | 'manager' | 'hr'
): Promise<Buffer> {
  // Fetch candidate with job
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId));
  if (!candidate) throw new Error('Candidate not found');

  const job = await getJob(candidate.jobId);
  const [cv] = await db.select().from(cvPool).where(eq(cvPool.id, candidate.cvId));
  const reports = await getInterviewReportsByCandidate(candidateId);

  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Candidate Info
  const infoRows = [
    ['CANDIDATE INFORMATION'],
    [],
    ['Name', candidate.fullName],
    ['Email', candidate.email],
    ['Phone', candidate.phone ?? ''],
    ['Current Stage', candidate.stage],
    ['Accepted At Stage', stage.toUpperCase()],
    ['Job Title', job?.title ?? ''],
    ['Job Seniority', job?.seniority ?? ''],
    [],
  ];
  const infoSheet = XLSX.utils.aoa_to_sheet(infoRows);
  infoSheet['!cols'] = [{ wch: 20 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, infoSheet, 'Candidate');

  // Sheet 2: CV / Formation Data
  const cvRows: string[][] = [
    ['CV / FORMATION DATA'],
    [],
    ['Summary', cv?.extractedSummary ?? ''],
    [],
    ['SKILLS'],
    ...(cv?.extractedSkills ?? []).reduce<string[][]>((acc, s, i) => {
      if (i % 4 === 0) acc.push([]);
      acc[acc.length - 1].push(s);
      return acc;
    }, []),
    [],
    ['EDUCATION / FORMATION'],
    ...((cv?.extractedEducation ?? []) as Array<Record<string, string>>).map((e) => [
      e.degree ?? e.Degree ?? e.diploma ?? '',
      e.school ?? e.School ?? e.institution ?? e.university ?? '',
      e.year ?? e.Year ?? e.date ?? '',
    ]),
    [],
    ['EXPERIENCE'],
    ...((cv?.extractedExperiences ?? []) as Array<Record<string, string>>).map((e) => [
      e.title ?? e.Title ?? e.role ?? e.Role ?? '',
      e.company ?? e.Company ?? e.organization ?? '',
      e.duration ?? e.Duration ?? e.period ?? e.dates ?? '',
    ]),
    [],
    ['LANGUAGES'],
    (cv?.extractedLanguages ?? []) as string[],
  ];
  const cvSheet = XLSX.utils.aoa_to_sheet(cvRows);
  cvSheet['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, cvSheet, 'CV - Formation');

  // Sheet 3: Interview Reports
  if (reports.length > 0) {
    const reportRows = reports.map((r) => ({
      'Stage': r.stage,
      'Score': r.score?.toString() ?? '',
      'Decision': r.decision,
      'Overall Evaluation': r.overallEvaluation ?? '',
      'Notes': r.notes ?? '',
      'Date': r.createdAt.toISOString().split('T')[0],
    }));
    const reportSheet = XLSX.utils.json_to_sheet(reportRows);
    XLSX.utils.book_append_sheet(workbook, reportSheet, 'Interview Reports');

    // Sheet 4: Detailed Q&A per report
    const qaRows: Array<Record<string, string>> = [];
    for (const r of reports) {
      const answers = (r.candidateAnswers ?? []) as Array<{ question: string; answer: string }>;
      for (const qa of answers) {
        qaRows.push({
          'Stage': r.stage,
          'Question': qa.question,
          'Answer': qa.answer,
        });
      }
    }
    if (qaRows.length > 0) {
      const qaSheet = XLSX.utils.json_to_sheet(qaRows);
      XLSX.utils.book_append_sheet(workbook, qaSheet, 'Q&A Details');
    }
  }

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(buffer);
}
