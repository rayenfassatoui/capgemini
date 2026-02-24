import { desc, eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidateNotes, users } from '@/db/schema';

export async function addCandidateNote(
  candidateId: string,
  userId: string,
  content: string
) {
  const [note] = await db
    .insert(candidateNotes)
    .values({ candidateId, userId, content })
    .returning();
  return note;
}

export async function getCandidateNotes(candidateId: string) {
  return db
    .select({
      id: candidateNotes.id,
      candidateId: candidateNotes.candidateId,
      userId: candidateNotes.userId,
      content: candidateNotes.content,
      createdAt: candidateNotes.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(candidateNotes)
    .innerJoin(users, eq(candidateNotes.userId, users.id))
    .where(eq(candidateNotes.candidateId, candidateId))
    .orderBy(desc(candidateNotes.createdAt));
}

export async function deleteCandidateNote(noteId: string, userId: string) {
  const [deleted] = await db
    .delete(candidateNotes)
    .where(and(eq(candidateNotes.id, noteId), eq(candidateNotes.userId, userId)))
    .returning();
  return deleted;
}
