/**
 * AI INTERVIEW CO-PILOT — Auto-Detect API Route
 * 
 * Given a Google Meet link (or Teams/Zoom URL), this endpoint:
 * 1. Searches the interviews table for a scheduled interview matching that link
 * 2. Returns the job details, candidate details, and interviewer role
 * 
 * This allows the Chrome Extension to auto-populate all fields
 * without the interviewer needing to manually enter IDs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { interviews, candidates, jobs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const meetLink = request.nextUrl.searchParams.get('meetLink');

    if (!meetLink) {
      return NextResponse.json(
        { error: 'Missing meetLink query parameter' },
        { status: 400 }
      );
    }

    // Normalize the meet link (remove trailing slashes, query params)
    const normalizedLink = meetLink.split('?')[0].replace(/\/+$/, '');

    // Search for a scheduled interview with this meet link
    const results = await db
      .select({
        interviewId: interviews.id,
        candidateId: interviews.candidateId,
        jobId: interviews.jobId,
        stage: interviews.stage,
        status: interviews.status,
        scheduledDate: interviews.scheduledDate,
        scheduledTime: interviews.scheduledTime,
        meetLink: interviews.meetLink,
        candidateName: candidates.fullName,
        candidateEmail: candidates.email,
        jobTitle: jobs.title,
        jobSeniority: jobs.seniority,
        jobBusinessUnit: jobs.businessUnit,
        jobMustHave: jobs.mustHave,
        jobNiceToHave: jobs.niceToHave,
      })
      .from(interviews)
      .innerJoin(candidates, eq(interviews.candidateId, candidates.id))
      .innerJoin(jobs, eq(interviews.jobId, jobs.id))
      .where(
        and(
          eq(interviews.status, 'scheduled')
        )
      )
      .limit(20);

    // Find the best match by comparing meet links
    const match = results.find((r) => {
      const dbLink = (r.meetLink || '').split('?')[0].replace(/\/+$/, '');
      return dbLink === normalizedLink;
    });

    if (!match) {
      return NextResponse.json(
        { 
          found: false, 
          message: 'No scheduled interview found for this meeting link.' 
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      found: true,
      interview: {
        interviewId: match.interviewId,
        candidateId: match.candidateId,
        candidateName: match.candidateName,
        candidateEmail: match.candidateEmail,
        jobId: match.jobId,
        jobTitle: match.jobTitle,
        jobSeniority: match.jobSeniority,
        jobBusinessUnit: match.jobBusinessUnit,
        jobMustHave: match.jobMustHave,
        jobNiceToHave: match.jobNiceToHave,
        stage: match.stage,
        scheduledDate: match.scheduledDate,
        scheduledTime: match.scheduledTime,
      },
    });
  } catch (err) {
    console.error('[CoPilot Auto-Detect] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
