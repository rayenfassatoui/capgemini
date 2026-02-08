import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import * as schema from '@/db/schema';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    usePlural: true,
    schema: {
      ...schema,
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'ta',
      },
    },
  },
  plugins: [
    admin({
      defaultRole: 'ta',
    }),
  ],
});

export type AuthSession = Awaited<ReturnType<typeof getSession>>;

export async function getSession() {
  const headersList = await headers();
  return auth.api.getSession({ headers: headersList });
}

export async function requireAuth() {
  const session = await getSession();

  if (!session) {
    redirect('/sign-in');
  }

  return session;
}

const ROLE_HOME: Record<string, string> = {
  ta: '/ta/dashboard',
  manager: '/manager/dashboard',
  hr: '/hr/dashboard',
  admin: '/admin',
};

export function getRoleHome(role: string): string {
  return ROLE_HOME[role] ?? '/ta/dashboard';
}

export async function requireRole(roles: string[]) {
  const session = await requireAuth();
  const role = session.user.role ?? 'ta';

  if (!roles.includes(role)) {
    redirect(getRoleHome(role));
  }

  return session;
}
