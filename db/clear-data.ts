import { sql } from "drizzle-orm";
import { db } from "../lib/db";

async function main() {
  try {
    console.log("🚮 Deleting business data (keeping users and sessions)...");
    
    await db.execute(sql`
      TRUNCATE TABLE 
        jobs, 
        cv_pool, 
        candidates, 
        screenings, 
        interview_guides, 
        interviews, 
        interview_reports, 
        chat_conversations, 
        chat_messages, 
        email_logs, 
        notifications, 
        candidate_notes, 
        activity_logs, 
        onboarding_tasks 
      CASCADE;
    `);
    
    console.log("✅ All business data has been successfully deleted! You can start fresh now.");
  } catch (error) {
    console.error("❌ Error deleting data:", error);
  } finally {
    process.exit(0);
  }
}

main();
