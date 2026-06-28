import { spawnSync } from 'node:child_process';

const SEED_STEPS = [
  {
    label: 'role accounts',
    script: 'db/seed-users.ts',
  },
  {
    label: 'baseline job records',
    script: 'db/seed-jobs.ts',
  },
] as const;

function assertSeedAllowed() {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.ALLOW_PRODUCTION_SEED === 'true') return;

  throw new Error(
    'Refusing to seed while NODE_ENV=production. Set ALLOW_PRODUCTION_SEED=true only for an intentional controlled bootstrap.',
  );
}

function runSeedStep(step: (typeof SEED_STEPS)[number]) {
  console.log(`\nRunning ${step.label}: ${step.script}`);

  const result = spawnSync(process.execPath, ['run', step.script], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${step.script} exited with status ${result.status ?? 'unknown'}`);
  }
}

function main() {
  assertSeedAllowed();

  for (const step of SEED_STEPS) {
    runSeedStep(step);
  }

  console.log('\nBase seed complete. Run bun run db:seed-interviews after CVs exist if pipeline fixture records are needed.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Seed failed.');
  process.exit(1);
}
