import 'server-only';

import { getSession } from '@/lib/auth';
import {
  cvMatchApiErrorResponseSchema,
  cvMatchEnrichmentRequestSchema,
  cvMatchEnrichmentResponseSchema,
} from '../schemas';
import { matchCvsToJobWithFilters } from './cv-matching';

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json(
      cvMatchApiErrorResponseSchema.parse({ error: 'Unauthorized' }),
      { status: 401 },
    );
  }

  const role = session.user.role ?? 'ta';
  if (role !== 'ta' && role !== 'admin') {
    return Response.json(
      cvMatchApiErrorResponseSchema.parse({ error: 'Forbidden' }),
      { status: 403 },
    );
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json(
      cvMatchApiErrorResponseSchema.parse({ error: 'Invalid JSON body' }),
      { status: 400 },
    );
  }

  const parsedInput = cvMatchEnrichmentRequestSchema.safeParse(input);
  if (!parsedInput.success) {
    return Response.json(
      cvMatchApiErrorResponseSchema.parse({
        error: parsedInput.error.issues[0]?.message ?? 'Invalid request',
      }),
      { status: 400 },
    );
  }

  try {
    const results = await matchCvsToJobWithFilters(
      parsedInput.data.jobId,
      parsedInput.data.filters,
      { userId: session.user.id, role },
      {
        includeAiRecommendations: true,
        aiRecommendationLimit: 5,
        aiTimeoutMs: 20_000,
        aiSignal: request.signal,
      },
    );
    const response = cvMatchEnrichmentResponseSchema.parse({ results });
    return Response.json(response);
  } catch (error) {
    const jobNotFound =
      error instanceof Error && error.message === 'Job not found';
    return Response.json(
      cvMatchApiErrorResponseSchema.parse({
        error: jobNotFound
          ? 'Job not found'
          : 'Unable to enrich CV match results',
      }),
      { status: jobNotFound ? 404 : 500 },
    );
  }
}
