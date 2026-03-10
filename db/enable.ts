import { sql } from "drizzle-orm";
import { db } from "../lib/db";

async function main() {
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);
    console.log("pgvector extension enabled successfully.");
  } catch (error) {
    console.error("Error enabling pgvector:", error);
  } finally {
    process.exit(0);
  }
}

main();
