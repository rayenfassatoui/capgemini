import { sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { jobs } from './schema';

async function seed() {
  try {
    // List ALL users so we can find the right one
    const result = await db.execute(sql`SELECT id, name, email, role FROM users`);
    const users = result.rows;
    
    console.log('📋 Users in database:');
    for (const u of users) {
      console.log(`  - ID: ${u.id} | Name: ${u.name} | Email: ${u.email} | Role: ${u.role}`);
    }

    if (users.length === 0) {
      console.log('No users found. Create an account first.');
      process.exit(0);
    }

    // Use the TA user (or the first user if only one exists)
    const taUser = users.find(u => u.role === 'ta') ?? users[0];
    const userId = taUser.id as string;
    console.log(`\n🎯 Using user: ${taUser.name} (${taUser.email}) [${taUser.role}]`);

    // Check if jobs already exist for this user
    const existingJobs = await db.execute(sql`SELECT id, title FROM jobs WHERE created_by = ${userId}`);
    if (existingJobs.rows.length > 0) {
      console.log(`\n⚠️  This user already has ${existingJobs.rows.length} jobs:`);
      for (const j of existingJobs.rows) {
        console.log(`  - ${j.title} (${j.id})`);
      }
      console.log('\nSkipping seed. Delete jobs first if you want to re-seed.');
      process.exit(0);
    }

    console.log('\n🌱 Seeding Jobs...');

    await db.insert(jobs).values([
      {
        title: 'Senior Backend Engineer',
        description: 'We are looking for a Senior Backend Engineer to join our core architecture team. You will be responsible for designing, building, and maintaining scalable and high-performance microservices. You will work closely with frontend engineers, product managers, and designers to deliver robust features. Strong experience with Node.js, PostgreSQL, and cloud infrastructure (AWS/Azure) is required.',
        seniority: 'Senior',
        businessUnit: 'Core Tech',
        mustHave: ['Node.js', 'PostgreSQL', 'Microservices', 'TypeScript'],
        niceToHave: ['AWS', 'Docker', 'Kubernetes'],
        status: 'open',
        createdBy: userId,
      },
      {
        title: 'Frontend React Developer',
        description: 'Join our customer-facing application team as a Frontend React Developer. Your primary focus will be on developing user interface components and implementing them following well-known React.js workflows (such as Next.js and Redux). You will ensure that these components and the overall application are robust and easy to maintain.',
        seniority: 'Mid-Level',
        businessUnit: 'Consumer UX',
        mustHave: ['React', 'Next.js', 'Tailwind CSS', 'TypeScript'],
        niceToHave: ['Framer Motion', 'Zod', 'React Query'],
        status: 'open',
        createdBy: userId,
      },
      {
        title: 'Cloud DevOps Engineer',
        description: 'Seeking a highly skilled Cloud DevOps Engineer to streamline our deployment processes and manage our cloud infrastructure. The ideal candidate will have extensive experience with CI/CD pipelines, Infrastructure as Code (Terraform), and monitoring tools. You will be instrumental in improving the reliability and scalability of our services.',
        seniority: 'Senior',
        businessUnit: 'Platform Engineering',
        mustHave: ['Terraform', 'CI/CD', 'AWS', 'Linux'],
        niceToHave: ['Golang', 'Ansible', 'Datadog'],
        status: 'open',
        createdBy: userId,
      },
    ]);

    console.log('✅ Successfully seeded 3 jobs!');
  } catch (err) {
    console.error('Failed to seed jobs:', err);
  } finally {
    process.exit(0);
  }
}

seed();
