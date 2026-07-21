import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emailLogs, interviews } from '@/db/schema';
import { sendInterviewEmailSchema } from '../schemas';
import type { InterviewStage, SendInterviewEmailInput, UserRole } from '../types';
import { callOpenRouter, cleanJsonResponse } from './ai';
import { getCandidate, getCandidateForActor } from './candidates';
import { getJob } from './jobs';
import { getInterview } from './interviews';

export async function sendInterviewEmail(
  input: SendInterviewEmailInput,
  userId: string,
  actorRole: UserRole
) {
  const validated = sendInterviewEmailSchema.parse(input);
  const interview = await getInterview(validated.interviewId);
  if (!interview) {
    throw new Error('Interview not found');
  }
  if (actorRole !== 'admin' && actorRole !== interview.stage) {
    throw new Error('Interview stage is outside your role');
  }
  if (validated.stage !== interview.stage) {
    throw new Error('Interview stage does not match the email');
  }

  const candidate = await getCandidateForActor(interview.candidateId, {
    userId,
    role: actorRole,
  });
  if (!candidate) {
    throw new Error('Candidate not found or not accessible');
  }
  const job = await getJob(interview.jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  const stageLabels: Record<InterviewStage, string> = {
    ta: 'Talent Acquisition',
    manager: 'Hiring Manager',
    hr: 'HR',
  };

  const subject = `Interview Invitation - ${job.title} (${stageLabels[interview.stage]})`;
  const body = `Dear ${candidate.fullName},

We are pleased to invite you for an interview for the position of ${job.title}.

Interview Details:
- Stage: ${stageLabels[interview.stage]} Interview
- Date: ${interview.scheduledDate}
- Time: ${interview.scheduledTime}
- Interviewer: ${validated.interviewerName}

Please join the interview using the following Google Meet link:
${interview.meetLink}

Please confirm your availability by replying to this email.

Best regards,
${validated.interviewerName}
Capgemini Recruitment Team`;

  let emailStatus = 'sent';
  try {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASSWORD;

    if (emailUser && emailPass) {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      });

      await transporter.sendMail({
        from: emailUser,
        to: candidate.email,
        subject,
        text: body,
      });
    } else {
      emailStatus = 'pending';
    }
  } catch {
    emailStatus = 'failed';
  }

  const [emailLog] = await db
    .insert(emailLogs)
    .values({
      toEmail: candidate.email,
      toName: candidate.fullName,
      subject,
      body,
      sentBy: userId,
      interviewId: validated.interviewId,
      status: emailStatus,
    })
    .returning();

  await db
    .update(interviews)
    .set({ emailSent: true, emailSentAt: new Date() })
    .where(eq(interviews.id, validated.interviewId));

  return emailLog;
}

export async function generateHRDecisionEmailWithAI(
  candidateId: string,
  jobId: string,
  decision: 'accepted' | 'rejected'
): Promise<{ subject: string; body: string }> {
  const candidate = await getCandidate(candidateId);
  if (!candidate) throw new Error('Candidate not found');

  const job = await getJob(jobId);
  if (!job) throw new Error('Job not found');

  const systemPrompt =
    'You are a professional HR email writer at Capgemini. Write formal but warm emails. Respond ONLY with valid JSON containing "subject" and "body" fields. No markdown, no code fences.';

  let userPrompt: string;

  if (decision === 'accepted') {
    userPrompt = `Write a professional acceptance email for a candidate who has been selected for the position.

Candidate: ${candidate.fullName}
Position: ${job.title}
Company: Capgemini

The email should:
1. Congratulate the candidate warmly
2. Confirm the position title
3. List the required documents they need to prepare:
   - Copy of national ID card (recto/verso)
   - Copy of diplomas and certificates
   - Bank account details (RIB)
   - 2 passport-sized photos
   - Medical certificate of fitness for work
   - Previous employment certificates (if applicable)
   - Social security number
4. Inform them they will be contacted by the onboarding team for next steps
5. Include a warm welcome message

Return JSON with "subject" and "body" fields.`;
  } else {
    userPrompt = `Write a professional and respectful rejection email for a candidate.

Candidate: ${candidate.fullName}
Position: ${job.title}
Company: Capgemini

The email should:
1. Thank the candidate for their time and interest in Capgemini
2. Politely inform them that they were not selected for this particular position
3. Encourage them to apply for future opportunities at Capgemini
4. Be warm, empathetic, and professional

Return JSON with "subject" and "body" fields.`;
  }

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = JSON.parse(cleanJsonResponse(content)) as {
    subject: string;
    body: string;
  };

  return {
    subject: parsed.subject ?? `Application Update - ${job.title}`,
    body: parsed.body ?? 'Email content could not be generated.',
  };
}

export async function sendHRDecisionEmail(
  input: { toEmail: string; toName: string; subject: string; body: string },
  userId: string
) {
  let emailStatus = 'sent';
  try {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASSWORD;

    if (emailUser && emailPass) {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      });

      await transporter.sendMail({
        from: emailUser,
        to: input.toEmail,
        subject: input.subject,
        text: input.body,
      });
    } else {
      emailStatus = 'pending';
    }
  } catch {
    emailStatus = 'failed';
  }

  const [emailLog] = await db
    .insert(emailLogs)
    .values({
      toEmail: input.toEmail,
      toName: input.toName,
      subject: input.subject,
      body: input.body,
      sentBy: userId,
      status: emailStatus,
    })
    .returning();

  return emailLog;
}
