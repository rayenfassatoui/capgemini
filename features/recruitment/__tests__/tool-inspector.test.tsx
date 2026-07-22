import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  I18nProvider,
  type Locale,
} from '@/components/shared/i18n-provider';


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

function renderToolInspector(locale: Locale = 'en') {
  return render(
    <I18nProvider defaultLocale={locale}>
      <ToolInspector events={events} />
    </I18nProvider>,
  );
}

describe('ToolInspector', () => {
  it('renders grouped phase timeline instead of a flat tool list', () => {
    renderToolInspector();

    const traceDisclosure = screen.getByRole('button', {
      name: /3 phases \/ 3 tools/i,
    });
    expect(traceDisclosure).toHaveAttribute('aria-expanded', 'false');
    const tracePanelId = traceDisclosure.getAttribute('aria-controls');
    expect(tracePanelId).toBeTruthy();

    fireEvent.click(traceDisclosure);
    expect(traceDisclosure).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(tracePanelId ?? '')).toBeInTheDocument();

    expect(screen.getByRole('region', { name: /retrieval phase/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /analysis phase/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /verification phase/i })).toBeInTheDocument();
    expect(screen.getByText('Live recruitment records were fetched from role-scoped tools.')).toBeInTheDocument();
    expect(screen.getByText('Fetched records were matched, compared, scored, or summarized.')).toBeInTheDocument();
    expect(screen.getByText('Audit, export, duplicate, or governance evidence was checked.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /completed\s+list_jobs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /completed\s+match_cvs_to_job/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /completed\s+get_activity_log_enriched/i })).toBeInTheDocument();
    const toolDisclosure = screen.getByRole('button', {
      name: /completed\s+list_jobs/i,
    });
    expect(toolDisclosure).toHaveAttribute('aria-expanded', 'false');
    const toolDetailsId = toolDisclosure.getAttribute('aria-controls');
    expect(toolDetailsId).toBeTruthy();

    fireEvent.click(toolDisclosure);
    expect(toolDisclosure).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(toolDetailsId ?? '')).toBeInTheDocument();
  });

  it('localizes phase labels and descriptions in French', () => {
    renderToolInspector('fr');

    fireEvent.click(
      screen.getByRole('button', {
        name: /3 phases \/ 3 outils/i,
      }),
    );

    expect(
      screen.getByRole('region', { name: /récupération phase/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /analyse phase/i })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /vérification phase/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Les données de recrutement autorisées pour ce rôle ont été récupérées.',
      ),
    ).toBeInTheDocument();
  });

});
