import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {},
}));

import { requiresAgentActionConfirmation } from '../services/pending-agent-actions';

describe('agent action confirmation policy', () => {
  it('does not require confirmation for read-only tools', () => {
    expect(requiresAgentActionConfirmation('list_jobs', false)).toBe(false);
    expect(requiresAgentActionConfirmation('get_candidate', false)).toBe(false);
  });

  it('requires confirmation for mutating workflow tools', () => {
    expect(requiresAgentActionConfirmation('delete_cv', true)).toBe(true);
    expect(requiresAgentActionConfirmation('close_job', true)).toBe(true);
    expect(requiresAgentActionConfirmation('bulk_update_candidate_stage', true)).toBe(true);
    expect(requiresAgentActionConfirmation('send_rejection_email', true)).toBe(true);
  });

  it('does not queue raw attachment uploads for confirmation', () => {
    expect(requiresAgentActionConfirmation('upload_cv', true)).toBe(false);
  });
});
