/**
 * AI INTERVIEW CO-PILOT — WebSocket API Route
 * 
 * This route handles WebSocket connections from the Chrome Extension.
 * It acts as the bridge between the extension (audio capture) and the AI services.
 * 
 * Flow:
 * 1. Extension connects and sends INIT message with interview metadata
 * 2. Extension streams audio chunks (binary data)
 * 3. Backend transcribes audio via Groq Whisper
 * 4. Backend sends transcript to the AI hint engine
 * 5. AI hints are pushed back to the extension via WebSocket
 * 6. On END_INTERVIEW, backend generates the full report
 * 
 * NOTE: Next.js does not natively support WebSockets in API routes.
 *       This file provides the HTTP endpoint and the WebSocket upgrade logic.
 *       For local dev with Bun, the WebSocket is handled via Bun.serve() in a
 *       separate server file. For production, use a WebSocket-compatible platform
 *       (Vercel does NOT support WebSockets - use Railway, Render, or Fly.io).
 * 
 *       ALTERNATIVE: Use Server-Sent Events (SSE) for the hints and a regular
 *       POST endpoint for audio upload. This file provides both approaches.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createSession,
  getSession,
  appendTranscript,
  generateLiveHint,
  generateInterviewReport,
  removeSession,
} from '@/features/recruitment/services/copilot';

// ---------- POST: Receive audio chunk or control message ----------
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // --- JSON message (INIT, END_INTERVIEW, etc.) ---
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const { type, sessionId, role, jobId, candidateId } = body;

      if (type === 'INIT') {
        const id = sessionId || crypto.randomUUID();
        createSession(id, role, jobId, candidateId);
        return NextResponse.json({ 
          ok: true, 
          sessionId: id, 
          message: 'Co-Pilot session started' 
        });
      }

      if (type === 'TRANSCRIPT_LINE') {
        const { text } = body;
        if (!sessionId || !text) {
          return NextResponse.json({ error: 'Missing sessionId or text' }, { status: 400 });
        }

        const totalLines = appendTranscript(sessionId, text);

        // Try to generate a hint
        const hint = await generateLiveHint(sessionId);

        return NextResponse.json({
          ok: true,
          totalLines,
          hint: hint || null,
        });
      }

      if (type === 'END_INTERVIEW') {
        if (!sessionId) {
          return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
        }

        const report = await generateInterviewReport(sessionId);
        removeSession(sessionId);

        return NextResponse.json({
          ok: true,
          report,
        });
      }

      return NextResponse.json({ error: 'Unknown message type' }, { status: 400 });
    }

    // --- Binary audio data (for future Whisper transcription) ---
    if (contentType.includes('audio') || contentType.includes('octet-stream')) {
      const sessionId = request.headers.get('x-session-id');
      if (!sessionId) {
        return NextResponse.json({ error: 'Missing x-session-id header' }, { status: 400 });
      }

      const session = getSession(sessionId);
      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      // TODO: In production, send this audio buffer to Groq Whisper API
      // const audioBuffer = await request.arrayBuffer();
      // const transcript = await transcribeWithGroq(audioBuffer);
      // appendTranscript(sessionId, transcript);

      return NextResponse.json({ 
        ok: true, 
        message: 'Audio chunk received (transcription pending Groq API integration)' 
      });
    }

    return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 });
  } catch (err) {
    console.error('[CoPilot API] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---------- GET: Retrieve session status ----------
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId parameter' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({
    sessionId: session.sessionId,
    role: session.role,
    jobId: session.jobId,
    candidateId: session.candidateId,
    transcriptLines: session.transcript.length,
    hintsGiven: session.hintsGiven.length,
    startedAt: session.startedAt.toISOString(),
    durationMinutes: Math.round((Date.now() - session.startedAt.getTime()) / 60000),
  });
}
