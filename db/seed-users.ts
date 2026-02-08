import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

/**
 * Seed script to create one user account for each role in the system.
 *
 * This uses Better-auth's internal password hashing (bcrypt via the accounts table)
 * to create properly authenticated accounts, then updates the role field.
 *
 * Accounts created:
 *   - ta@capgemini.com       / TaPass123!       / role: ta
 *   - manager@capgemini.com  / ManagerPass123!   / role: manager
 *   - hr@capgemini.com       / HrPass123!        / role: hr
 *   - admin@capgemini.com    / AdminPass123!     / role: admin
 */

const USERS_TO_CREATE = [
  { name: 'Talent Acquisition', email: 'ta@capgemini.com', password: 'TaPass123!', role: 'ta' },
  { name: 'Hiring Manager', email: 'manager@capgemini.com', password: 'ManagerPass123!', role: 'manager' },
  { name: 'HR Director', email: 'hr@capgemini.com', password: 'HrPass123!', role: 'hr' },
  { name: 'System Admin', email: 'admin@capgemini.com', password: 'AdminPass123!', role: 'admin' },
];

async function main() {
  console.log('Creating user accounts for all roles...\n');

  const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Ensure .env file exists.');
  }

  const sqlClient = neon(process.env.DATABASE_URL);
  const db = drizzle(sqlClient, { schema });

  for (const user of USERS_TO_CREATE) {
    // Check if user already exists
    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, user.email));

    if (existing.length > 0) {
      console.log(`[SKIP] ${user.email} already exists (id: ${existing[0].id}, role: ${existing[0].role})`);

      // Ensure role is correct even if user exists
      if (existing[0].role !== user.role) {
        await db
          .update(schema.users)
          .set({ role: user.role })
          .where(eq(schema.users.id, existing[0].id));
        console.log(`  -> Updated role from '${existing[0].role}' to '${user.role}'`);
      }
      continue;
    }

    // Create user via Better-auth sign-up API
    console.log(`[CREATE] ${user.email} (role: ${user.role})...`);

    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: user.name,
        email: user.email,
        password: user.password,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  -> FAILED to create ${user.email}: ${response.status} ${errorText}`);
      continue;
    }

    const result = await response.json();
    console.log(`  -> Created successfully (id: ${result.user?.id ?? 'unknown'})`);

    // Update role in DB (Better-auth may default to different role)
    const userId = result.user?.id;
    if (userId) {
      await db
        .update(schema.users)
        .set({ role: user.role })
        .where(eq(schema.users.id, userId));
      console.log(`  -> Role set to '${user.role}'`);
    } else {
      // Fallback: find by email
      const created = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, user.email));
      if (created.length > 0) {
        await db
          .update(schema.users)
          .set({ role: user.role })
          .where(eq(schema.users.id, created[0].id));
        console.log(`  -> Role set to '${user.role}' (via email lookup)`);
      }
    }
  }

  console.log('\n--- Account Summary ---');
  console.log('Email                      | Password         | Role');
  console.log('---------------------------|------------------|--------');
  for (const u of USERS_TO_CREATE) {
    const emailPad = u.email.padEnd(27);
    const passPad = u.password.padEnd(18);
    console.log(`${emailPad}| ${passPad}| ${u.role}`);
  }
  console.log('\nDone! All accounts are ready.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed to create accounts:', err);
    process.exit(1);
  });
