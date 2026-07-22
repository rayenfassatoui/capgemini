import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider, type Locale } from '@/components/shared/i18n-provider';
import AppError from '@/app/error';

function renderAppError(locale: Locale, reset = vi.fn()) {
  const error = Object.assign(new Error('database unavailable'), {
    digest: 'AGT-42',
  });

  render(
    <I18nProvider defaultLocale={locale}>
      <AppError error={error} reset={reset} />
    </I18nProvider>,
  );

  return reset;
}

describe('AppError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('explains a transient failure without exposing the error and retries', () => {
    const reset = renderAppError('en');

    expect(
      screen.getByRole('alert', { name: 'This workspace could not load' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Reference: AGT-42')).toBeInTheDocument();
    expect(screen.queryByText('database unavailable')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('renders the recovery state in French', () => {
    renderAppError('fr');

    expect(
      screen.getByRole('alert', {
        name: "Cet espace n'a pas pu être chargé",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Référence: AGT-42')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
