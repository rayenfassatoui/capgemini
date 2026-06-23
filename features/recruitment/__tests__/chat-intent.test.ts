import { describe, expect, it } from 'vitest';

import { classifyChatIntent } from '../services/chat-intent';

describe('chat intent classification', () => {
  it('does not misclassify broad reliability prompts with ranking language as direct candidate comparison', () => {
    const result = classifyChatIntent(
      [
        'You are testing your own reliability.',
        '1) Give me a source-backed overview of the current recruitment pipeline.',
        '2) Then identify the best accessible candidate for the strongest open job and explain why, using only current tool results.',
        '3) If a write action is needed, do not execute it immediately.',
      ].join(' '),
    );

    expect(result).toEqual({ intent: 'agent' });
  });

  it('keeps explicit compare prompts on the dedicated compare path', () => {
    const result = classifyChatIntent('Compare Ahmed vs Sarah');

    expect(result.intent).toBe('compare');
    expect(result.candidateRefs).toEqual(['ahmed', 'sarah']);
  });

  it('keeps exact-name lookup on the named search path', () => {
    const result = classifyChatIntent('Find candidate name is Amina Trabelsi');

    expect(result.intent).toBe('named_search');
    expect(result.requestedName).toBe('Amina Trabelsi');
  });
});
