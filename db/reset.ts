import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

const sql = neon(DATABASE_URL);

async function reset() {
  console.log('Dropping all existing tables and types...');

  await sql`DROP TABLE IF EXISTS preboarding CASCADE`;
  await sql`DROP TABLE IF EXISTS reports CASCADE`;
  await sql`DROP TABLE IF EXISTS evaluations CASCADE`;
  await sql`DROP TABLE IF EXISTS reference_questions CASCADE`;
  await sql`DROP TABLE IF EXISTS email_logs CASCADE`;
  await sql`DROP TABLE IF EXISTS interview_reports CASCADE`;
  await sql`DROP TABLE IF EXISTS interviews CASCADE`;
  await sql`DROP TABLE IF EXISTS interview_guides CASCADE`;
  await sql`DROP TABLE IF EXISTS screenings CASCADE`;
  await sql`DROP TABLE IF EXISTS candidate_documents CASCADE`;
  await sql`DROP TABLE IF EXISTS candidates CASCADE`;
  await sql`DROP TABLE IF EXISTS cv_pool CASCADE`;
  await sql`DROP TABLE IF EXISTS jobs CASCADE`;
  await sql`DROP TABLE IF EXISTS projects CASCADE`;
  await sql`DROP TABLE IF EXISTS verifications CASCADE`;
  await sql`DROP TABLE IF EXISTS accounts CASCADE`;
  await sql`DROP TABLE IF EXISTS sessions CASCADE`;
  await sql`DROP TABLE IF EXISTS users CASCADE`;

  await sql`DROP TYPE IF EXISTS candidate_status CASCADE`;
  await sql`DROP TYPE IF EXISTS interview_type CASCADE`;
  await sql`DROP TYPE IF EXISTS guide_type CASCADE`;
  await sql`DROP TYPE IF EXISTS project_status CASCADE`;
  await sql`DROP TYPE IF EXISTS candidate_stage CASCADE`;
  await sql`DROP TYPE IF EXISTS interview_stage CASCADE`;
  await sql`DROP TYPE IF EXISTS interview_status CASCADE`;

  console.log('All tables and types dropped.');
  console.log('Now run: bun run db:push');
}

reset().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
