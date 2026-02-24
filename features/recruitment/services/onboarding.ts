import { eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { onboardingTasks } from '@/db/schema';

const DEFAULT_ONBOARDING_TASKS = [
  { title: 'Send Offer Letter', description: 'Send the official offer letter to the candidate', sortOrder: 1 },
  { title: 'Background Check', description: 'Initiate and complete the background check process', sortOrder: 2 },
  { title: 'Collect Documents', description: 'Collect ID, tax forms, educational certificates', sortOrder: 3 },
  { title: 'Setup Workstation', description: 'Prepare laptop, monitor, peripherals and access cards', sortOrder: 4 },
  { title: 'Create Email & Accounts', description: 'Create corporate email and tool accounts', sortOrder: 5 },
  { title: 'Assign Buddy/Mentor', description: 'Assign an onboarding buddy or mentor from the team', sortOrder: 6 },
  { title: 'Schedule Orientation', description: 'Schedule first-day orientation session', sortOrder: 7 },
  { title: 'Notify Team', description: 'Inform the team about the new hire and start date', sortOrder: 8 },
];

export async function createOnboardingChecklist(candidateId: string) {
  const existing = await db
    .select({ id: onboardingTasks.id })
    .from(onboardingTasks)
    .where(eq(onboardingTasks.candidateId, candidateId))
    .limit(1);

  if (existing.length > 0) return getOnboardingChecklist(candidateId);

  const rows = DEFAULT_ONBOARDING_TASKS.map((t) => ({
    candidateId,
    title: t.title,
    description: t.description,
    sortOrder: t.sortOrder,
  }));

  await db.insert(onboardingTasks).values(rows);
  return getOnboardingChecklist(candidateId);
}

export async function getOnboardingChecklist(candidateId: string) {
  return db
    .select()
    .from(onboardingTasks)
    .where(eq(onboardingTasks.candidateId, candidateId))
    .orderBy(asc(onboardingTasks.sortOrder));
}

export async function toggleOnboardingTask(
  taskId: string,
  completed: boolean,
  userId: string
) {
  const [updated] = await db
    .update(onboardingTasks)
    .set({
      completed,
      completedBy: completed ? userId : null,
      completedAt: completed ? new Date() : null,
    })
    .where(eq(onboardingTasks.id, taskId))
    .returning();
  return updated;
}

export async function addOnboardingTask(
  candidateId: string,
  title: string,
  description?: string
) {
  const existing = await db
    .select({ sortOrder: onboardingTasks.sortOrder })
    .from(onboardingTasks)
    .where(eq(onboardingTasks.candidateId, candidateId))
    .orderBy(asc(onboardingTasks.sortOrder));

  const nextOrder = existing.length > 0 ? existing[existing.length - 1].sortOrder + 1 : 1;

  const [task] = await db
    .insert(onboardingTasks)
    .values({ candidateId, title, description, sortOrder: nextOrder })
    .returning();
  return task;
}
