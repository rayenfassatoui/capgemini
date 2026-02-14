import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidates, cvPool } from '@/db/schema';
import { getJob } from './jobs';
import { getInterviewReportsByCandidate } from './interview-reports';
import { zipSync } from 'fflate';

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
