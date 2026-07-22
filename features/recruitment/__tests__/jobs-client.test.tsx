import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobsStats } from '../types';
import JobsClient from '../components/jobs-client';

const mocks = vi.hoisted(() => ({
  createJobAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/features/recruitment/actions', () => ({
  createJobAction: mocks.createJobAction,
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

const stats: JobsStats = {
  totalJobs: 0,
  bySeniority: [{ seniority: 'Senior', count: 0 }],
  byStatus: [{ status: 'open', count: 0 }],
  byBusinessUnit: [],
  topSkillsDemand: [{ skill: 'AWS', count: 0 }],
};

function renderCreateJobDialog(): void {
  render(<JobsClient initialJobs={[]} stats={stats} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create New Job' }));
}

function fillRequiredFields(description: string): void {
  fireEvent.change(screen.getByLabelText('Job Title *'), {
    target: { value: 'Cloud Architect' },
  });
  fireEvent.change(screen.getByLabelText('Seniority *'), {
    target: { value: 'Senior' },
  });
  fireEvent.change(screen.getByLabelText(/Description \*/), {
    target: { value: description },
  });
  fireEvent.change(screen.getByLabelText(/Must-Have Skills \*/), {
    target: {
      value: 'Hands-on experience working with AWS cloud architecture',
    },
  });
}

beforeEach(() => {
  mocks.createJobAction.mockReset();
  mocks.createJobAction.mockResolvedValue(undefined);
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
});

describe('JobsClient create-job validation', () => {
  it('reports a short description before calling the server action', () => {
    renderCreateJobDialog();
    fillRequiredFields('Cloud role');

    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }));

    expect(mocks.toastError).toHaveBeenCalledWith(
      'Job description must contain at least 20 characters',
    );
    expect(mocks.createJobAction).not.toHaveBeenCalled();
  });

  it('passes normalized concise skill labels to the server action', async () => {
    renderCreateJobDialog();
    fillRequiredFields('Design and operate secure AWS cloud platforms.');

    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }));

    await waitFor(() => {
      expect(mocks.createJobAction).toHaveBeenCalledWith({
        title: 'Cloud Architect',
        description: 'Design and operate secure AWS cloud platforms.',
        mustHave: ['AWS cloud architecture'],
        niceToHave: [],
        seniority: 'Senior',
        businessUnit: null,
      });
    });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
