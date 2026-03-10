import { sql } from 'drizzle-orm';
import { db } from '../lib/db';

async function fix() {
  try {
    // Delete jobs created by non-TA users (the wrong ones)
    const result = await db.execute(sql`
      DELETE FROM jobs 
      WHERE created_by != (SELECT id FROM users WHERE role = 'ta' LIMIT 1)
      RETURNING id, title, created_by
    `);
    
    console.log(`🗑️  Deleted ${result.rows.length} jobs from other users:`);
    for (const j of result.rows) {
      console.log(`  - ${j.title}`);
    }

    // Show remaining jobs
    const remaining = await db.execute(sql`SELECT id, title, created_by FROM jobs`);
    console.log(`\n✅ Remaining jobs (${remaining.rows.length}):`);
    for (const j of remaining.rows) {
      console.log(`  - ${j.title}`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

fix();
