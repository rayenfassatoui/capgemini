import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ToolEvent } from '../components/chat/chat-types';
import { ToolInspector } from '../components/chat/tool-inspector';

const events: ToolEvent[] = [
  {
    id: 'tool-1',
    tool: 'list_jobs',
    status: 'success',
    summary: 'Returned jobs',
    durationMs: 120,
  },
  {
    id: 'tool-2',
    tool: 'match_cvs_to_job',
    status: 'success',
    summary: 'Scored candidates',
    durationMs: 840,
  },
  {
    id: 'tool-3',
    tool: 'get_activity_log_enriched',
    status: 'success',
    summary: 'Checked audit rows',
    durationMs: 90,
  },
];

describe('ToolInspector', () => {
  it('renders grouped phase timeline instead of a flat tool list', () => {
    render(<ToolInspector events={events} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: /3 phases \/ 3 tools/i,
      }),
    );

    expect(screen.getByRole('region', { name: /retrieval phase/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /analysis phase/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /verification phase/i })).toBeInTheDocument();
    expect(screen.getByText('Live recruitment records were fetched from role-scoped tools.')).toBeInTheDocument();
    expect(screen.getByText('Fetched records were matched, compared, scored, or summarized.')).toBeInTheDocument();
    expect(screen.getByText('Audit, export, duplicate, or governance evidence was checked.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /completed\s+list_jobs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /completed\s+match_cvs_to_job/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /completed\s+get_activity_log_enriched/i })).toBeInTheDocument();
  });
});
