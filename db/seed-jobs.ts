import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

/**
 * Seed script to populate the database with diverse job postings.
 * Creates 20+ jobs across various domains, tech stacks, and seniority levels.
 */

const JOBS = [
  {
    title: 'Senior React Native Developer (Node.js, Prisma, TRPC, Typescript)',
    description: `We are seeking a Senior React Native Developer to lead mobile application development projects. You will work on cross-platform mobile apps using React Native, with a strong backend integration layer built on Node.js, Prisma ORM, and TRPC for type-safe APIs.

Key Responsibilities:
- Architect and develop React Native applications for iOS and Android
- Build robust backend APIs using Node.js, Prisma, and TRPC
- Implement TypeScript across the full stack
- Mentor junior developers and conduct code reviews
- Collaborate with product teams to deliver high-quality mobile experiences`,
    mustHave: ['React Native', 'Node.js', 'TypeScript', 'Prisma', 'TRPC'],
    niceToHave: ['React', 'PostgreSQL', 'Jest', 'GraphQL'],
    seniority: 'Senior',
    businessUnit: 'Digital Services',
  },
  {
    title: 'Full Stack Engineer - React & Python',
    description: `Join our team as a Full Stack Engineer working on enterprise web applications. You will develop modern frontends with React and scalable backends with Python.

Requirements:
- Build responsive web UIs with React and Material-UI
- Develop RESTful APIs and microservices with Python (FastAPI/Django)
- Work with SQL and NoSQL databases
- Implement CI/CD pipelines
- Participate in agile ceremonies`,
    mustHave: ['React', 'Python', 'FastAPI', 'SQL', 'REST API'],
    niceToHave: ['Django', 'Docker', 'AWS', 'Redis', 'Celery'],
    seniority: 'Mid-level',
    businessUnit: 'Cloud & Infrastructure',
  },
  {
    title: 'Senior Java Backend Developer - Spring Boot',
    description: `We need an experienced Java Backend Developer to work on mission-critical enterprise systems. You will design and implement microservices using Spring Boot and modern cloud technologies.

Your Mission:
- Design microservices architectures with Spring Boot
- Implement event-driven systems with Kafka
- Optimize database performance (PostgreSQL, MongoDB)
- Deploy and manage services on Kubernetes
- Ensure high availability and scalability`,
    mustHave: ['Java', 'Spring Boot', 'Microservices', 'Kafka', 'SQL'],
    niceToHave: ['Kubernetes', 'Docker', 'MongoDB', 'Redis', 'Spring Cloud'],
    seniority: 'Senior',
    businessUnit: 'Financial Services',
  },
  {
    title: 'DevOps Engineer - AWS & Terraform',
    description: `Looking for a DevOps Engineer to manage and automate our cloud infrastructure. You will work extensively with AWS services and Infrastructure as Code using Terraform.

Responsibilities:
- Design and maintain AWS infrastructure
- Automate deployments with Terraform and Ansible
- Build CI/CD pipelines (Jenkins, GitLab CI)
- Monitor systems with Prometheus and Grafana
- Implement security best practices`,
    mustHave: ['AWS', 'Terraform', 'Docker', 'Kubernetes', 'Linux'],
    niceToHave: ['Ansible', 'Jenkins', 'Prometheus', 'Grafana', 'Python'],
    seniority: 'Mid-level',
    businessUnit: 'Cloud & Infrastructure',
  },
  {
    title: 'Frontend Developer - Vue.js & TypeScript',
    description: `We are hiring a Frontend Developer specializing in Vue.js to build modern, reactive web applications for our clients in the energy sector.

What you'll do:
- Develop SPAs with Vue 3 and Composition API
- Implement state management with Pinia
- Create reusable components with TypeScript
- Integrate with REST and GraphQL APIs
- Ensure accessibility and performance`,
    mustHave: ['Vue.js', 'TypeScript', 'HTML', 'CSS', 'JavaScript'],
    niceToHave: ['Pinia', 'Nuxt.js', 'Tailwind CSS', 'GraphQL', 'Vite'],
    seniority: 'Mid-level',
    businessUnit: 'Energy & Utilities',
  },
  {
    title: 'Data Engineer - Python & Spark',
    description: `Join our Data Platform team as a Data Engineer. You will build ETL pipelines, design data warehouses, and work with big data technologies.

Key Tasks:
- Design and implement ETL pipelines with Apache Spark
- Build data lakes on AWS S3 and Databricks
- Develop workflows with Apache Airflow
- Optimize SQL queries and data models
- Collaborate with data scientists and analysts`,
    mustHave: ['Python', 'Apache Spark', 'SQL', 'ETL', 'AWS'],
    niceToHave: ['Airflow', 'Databricks', 'Snowflake', 'Kafka', 'Scala'],
    seniority: 'Mid-level',
    businessUnit: 'Data & Analytics',
  },
  {
    title: 'Machine Learning Engineer - NLP',
    description: `We are seeking an ML Engineer specialized in Natural Language Processing to develop AI-powered solutions for our clients.

Your Role:
- Develop NLP models for text classification, NER, and sentiment analysis
- Fine-tune large language models (BERT, GPT, Llama)
- Build ML pipelines with MLflow and Kubeflow
- Deploy models as APIs with FastAPI
- Collaborate with data engineers and product teams`,
    mustHave: ['Python', 'NLP', 'PyTorch', 'Transformers', 'Machine Learning'],
    niceToHave: ['TensorFlow', 'Hugging Face', 'MLflow', 'FastAPI', 'Docker'],
    seniority: 'Senior',
    businessUnit: 'AI & Innovation',
  },
  {
    title: 'Mobile Developer - iOS Swift',
    description: `Looking for an iOS Developer to create native applications for iPhone and iPad using Swift and SwiftUI.

Responsibilities:
- Develop iOS apps with Swift and SwiftUI
- Implement MVVM architecture
- Integrate with REST and GraphQL APIs
- Optimize performance and memory usage
- Publish apps to the App Store`,
    mustHave: ['Swift', 'iOS', 'SwiftUI', 'UIKit', 'Xcode'],
    niceToHave: ['Combine', 'CoreData', 'Firebase', 'GraphQL', 'CI/CD'],
    seniority: 'Mid-level',
    businessUnit: 'Digital Services',
  },
  {
    title: 'Mobile Developer - Android Kotlin',
    description: `We need an Android Developer to build native Android applications using Kotlin and Jetpack Compose.

Your Mission:
- Develop Android apps with Kotlin and Jetpack Compose
- Implement MVVM with architecture components
- Work with Room, Retrofit, and Coroutines
- Ensure material design guidelines
- Deploy to Google Play Store`,
    mustHave: ['Kotlin', 'Android', 'Jetpack Compose', 'MVVM', 'Android Studio'],
    niceToHave: ['Room', 'Retrofit', 'Coroutines', 'Firebase', 'Gradle'],
    seniority: 'Mid-level',
    businessUnit: 'Digital Services',
  },
  {
    title: 'Senior .NET Developer - C# & Azure',
    description: `Join our enterprise applications team as a Senior .NET Developer. You will work on large-scale systems using C#, .NET Core, and Azure cloud services.

Key Responsibilities:
- Develop backend services with .NET 8 and C#
- Build microservices and Web APIs
- Deploy applications on Azure (App Service, Functions, AKS)
- Implement security with Azure AD
- Mentor junior developers`,
    mustHave: ['C#', '.NET Core', 'Azure', 'SQL Server', 'REST API'],
    niceToHave: ['ASP.NET', 'Entity Framework', 'Azure DevOps', 'Docker', 'Redis'],
    seniority: 'Senior',
    businessUnit: 'Cloud & Infrastructure',
  },
  {
    title: 'Frontend Developer - Angular & RxJS',
    description: `We are hiring an Angular Developer to build enterprise web applications with reactive programming patterns.

What you'll do:
- Develop SPAs with Angular 17+
- Implement reactive patterns with RxJS
- Create reusable components and services
- Integrate with backend APIs
- Write unit and E2E tests`,
    mustHave: ['Angular', 'TypeScript', 'RxJS', 'HTML', 'CSS'],
    niceToHave: ['NgRx', 'Jasmine', 'Karma', 'Protractor', 'Material Design'],
    seniority: 'Mid-level',
    businessUnit: 'Financial Services',
  },
  {
    title: 'Cloud Architect - Multi-Cloud Strategy',
    description: `Seeking a Cloud Architect to design and implement multi-cloud solutions across AWS, Azure, and GCP for enterprise clients.

Responsibilities:
- Design cloud-native architectures
- Lead cloud migration projects
- Implement security and compliance frameworks
- Optimize cloud costs
- Mentor DevOps teams`,
    mustHave: ['AWS', 'Azure', 'Cloud Architecture', 'Kubernetes', 'Terraform'],
    niceToHave: ['GCP', 'Security', 'FinOps', 'Service Mesh', 'ArgoCD'],
    seniority: 'Architect',
    businessUnit: 'Cloud & Infrastructure',
  },
  {
    title: 'Cybersecurity Engineer - SOC',
    description: `Join our Security Operations Center as a Cybersecurity Engineer. You will monitor, detect, and respond to security incidents.

Your Role:
- Monitor security events with SIEM tools
- Investigate and respond to incidents
- Implement security controls and policies
- Conduct vulnerability assessments
- Collaborate with infrastructure teams`,
    mustHave: ['Cybersecurity', 'SIEM', 'Network Security', 'Linux', 'Security'],
    niceToHave: ['Splunk', 'ELK Stack', 'Firewalls', 'IDS/IPS', 'Python'],
    seniority: 'Mid-level',
    businessUnit: 'Cybersecurity',
  },
  {
    title: 'QA Automation Engineer - Selenium & Cypress',
    description: `We need a QA Automation Engineer to build and maintain automated testing frameworks for web and mobile applications.

Key Tasks:
- Develop automated tests with Selenium and Cypress
- Build CI/CD test pipelines
- Perform API testing with Postman/REST Assured
- Create performance tests with JMeter
- Track bugs and work with developers`,
    mustHave: ['Selenium', 'Test Automation', 'Java', 'JavaScript', 'CI/CD'],
    niceToHave: ['Cypress', 'JMeter', 'Postman', 'TestNG', 'Docker'],
    seniority: 'Mid-level',
    businessUnit: 'Quality Assurance',
  },
  {
    title: 'Blockchain Developer - Solidity & Web3',
    description: `Looking for a Blockchain Developer to work on decentralized applications and smart contracts for financial services clients.

Your Mission:
- Develop smart contracts with Solidity
- Build dApps with Web3.js and Ethers.js
- Implement ERC-20 and ERC-721 tokens
- Test contracts with Hardhat and Truffle
- Integrate with MetaMask and wallets`,
    mustHave: ['Solidity', 'Ethereum', 'Web3', 'Blockchain', 'Smart Contracts'],
    niceToHave: ['Hardhat', 'Truffle', 'React', 'IPFS', 'The Graph'],
    seniority: 'Senior',
    businessUnit: 'Blockchain & Web3',
  },
  {
    title: 'SAP Consultant - FICO Module',
    description: `We are hiring an SAP FICO Consultant to implement and support SAP financial modules for multinational corporations.

Responsibilities:
- Configure SAP FICO modules
- Implement financial processes
- Provide user training and support
- Conduct system upgrades
- Write functional specifications`,
    mustHave: ['SAP', 'SAP FICO', 'ERP', 'Finance', 'Accounting'],
    niceToHave: ['SAP S/4HANA', 'ABAP', 'BW', 'Project Management', 'ITIL'],
    seniority: 'Consultant',
    businessUnit: 'ERP Solutions',
  },
  {
    title: 'Salesforce Developer - APEX & Lightning',
    description: `Join our CRM team as a Salesforce Developer. You will customize and extend Salesforce functionalities using APEX, Lightning Web Components, and Flow.

What you'll do:
- Develop custom solutions with APEX and Lightning
- Build integrations with REST and SOAP APIs
- Create automation with Process Builder and Flow
- Customize Salesforce UI
- Support sales and service teams`,
    mustHave: ['Salesforce', 'APEX', 'Lightning Web Components', 'CRM', 'JavaScript'],
    niceToHave: ['Visualforce', 'SOQL', 'REST API', 'Salesforce Admin', 'Flow'],
    seniority: 'Mid-level',
    businessUnit: 'CRM & Customer Experience',
  },
  {
    title: 'UI/UX Designer - Figma & Design Systems',
    description: `We need a UI/UX Designer to create intuitive and beautiful user interfaces for digital products.

Your Role:
- Design user interfaces with Figma
- Create and maintain design systems
- Conduct user research and usability testing
- Build prototypes and wireframes
- Collaborate with developers`,
    mustHave: ['Figma', 'UI Design', 'UX Design', 'Prototyping', 'Design Systems'],
    niceToHave: ['Adobe XD', 'Sketch', 'User Research', 'Accessibility', 'CSS'],
    seniority: 'Mid-level',
    businessUnit: 'Design & User Experience',
  },
  {
    title: 'Business Analyst - Digital Transformation',
    description: `Looking for a Business Analyst to drive digital transformation initiatives and bridge the gap between business and IT.

Responsibilities:
- Analyze business processes and requirements
- Write user stories and functional specifications
- Facilitate workshops with stakeholders
- Define KPIs and success metrics
- Support agile teams`,
    mustHave: ['Business Analysis', 'Requirements Gathering', 'Agile', 'Stakeholder Management', 'Documentation'],
    niceToHave: ['JIRA', 'Confluence', 'SQL', 'Power BI', 'Process Modeling'],
    seniority: 'Mid-level',
    businessUnit: 'Digital Transformation',
  },
  {
    title: 'Junior Full Stack Developer - JavaScript',
    description: `We are hiring a Junior Full Stack Developer to join our development team. You will work on both frontend and backend with JavaScript technologies.

What you'll learn:
- Build UIs with React or Vue.js
- Develop APIs with Node.js and Express
- Work with databases (MongoDB, PostgreSQL)
- Use Git and agile methodologies
- Grow your skills with mentorship`,
    mustHave: ['JavaScript', 'HTML', 'CSS', 'Node.js', 'Git'],
    niceToHave: ['React', 'Express', 'MongoDB', 'REST API', 'TypeScript'],
    seniority: 'Junior',
    businessUnit: 'Digital Services',
  },
  {
    title: 'Site Reliability Engineer (SRE)',
    description: `Join our SRE team to ensure the reliability, performance, and scalability of production systems.

Your Mission:
- Implement monitoring and alerting systems
- Automate operational tasks
- Conduct incident management and post-mortems
- Optimize system performance
- Build chaos engineering practices`,
    mustHave: ['Linux', 'Kubernetes', 'Monitoring', 'Scripting', 'Troubleshooting'],
    niceToHave: ['Prometheus', 'Grafana', 'Terraform', 'Python', 'Go'],
    seniority: 'Mid-level',
    businessUnit: 'Cloud & Infrastructure',
  },
  {
    title: 'Tech Lead - Microservices Architecture',
    description: `We are seeking a Tech Lead to guide a team of developers building microservices-based enterprise platforms.

Key Responsibilities:
- Lead technical design and architecture decisions
- Mentor and coach team members
- Ensure code quality and best practices
- Collaborate with product and stakeholders
- Drive innovation and technical excellence`,
    mustHave: ['Microservices', 'System Design', 'Leadership', 'Cloud', 'API Design'],
    niceToHave: ['Event-Driven', 'CQRS', 'DDD', 'Agile', 'Communication'],
    seniority: 'Lead',
    businessUnit: 'Technology Office',
  },
  {
    title: 'Product Owner - Scrum',
    description: `Looking for a Product Owner to define product vision, manage backlog, and maximize business value in an agile environment.

Your Role:
- Define product roadmap and vision
- Write and prioritize user stories
- Conduct sprint planning and reviews
- Collaborate with stakeholders and teams
- Track metrics and KPIs`,
    mustHave: ['Product Management', 'Scrum', 'Agile', 'User Stories', 'Stakeholder Management'],
    niceToHave: ['JIRA', 'Roadmapping', 'UX', 'Data Analysis', 'CSPO'],
    seniority: 'Mid-level',
    businessUnit: 'Product Management',
  },
];

async function main() {
  console.log('Seeding jobs database...\n');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Ensure .env file exists.');
  }

  const sqlClient = neon(process.env.DATABASE_URL);
  const db = drizzle(sqlClient, { schema });

  // Get the TA user (creator of jobs)
  const taUser = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.role, 'ta'))
    .limit(1);

  if (taUser.length === 0) {
    console.error('ERROR: No TA user found. Please run seed-users.ts first.');
    process.exit(1);
  }

  const creatorId = taUser[0].id;
  console.log(`Using TA user (${taUser[0].email}) as job creator\n`);

  let created = 0;
  let skipped = 0;

  for (const job of JOBS) {
    // Check if job already exists by title
    const existing = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.title, job.title))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[SKIP] "${job.title}" already exists`);
      skipped++;
      continue;
    }

    // Create job
    await db.insert(schema.jobs).values({
      title: job.title,
      description: job.description,
      mustHave: job.mustHave,
      niceToHave: job.niceToHave,
      seniority: job.seniority,
      businessUnit: job.businessUnit,
      status: 'open',
      createdBy: creatorId,
    });

    console.log(`[CREATE] "${job.title}" (${job.seniority} - ${job.businessUnit})`);
    created++;
  }

  console.log(`\n--- Summary ---`);
  console.log(`Total jobs in seed: ${JOBS.length}`);
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`\nDone! Jobs are ready.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed to seed jobs:', err);
    process.exit(1);
  });
