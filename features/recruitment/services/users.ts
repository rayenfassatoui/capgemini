import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/db/schema';

export async function listUsersByRole(role: string) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.role, role));
}
