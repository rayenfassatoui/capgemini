import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChatInput } from '../components/chat/chat-input';

function ChatInputHarness() {
  const [input, setInput] = useState('');

  return (
    <ChatInput
      input={input}
      isStreaming={false}
      attachedFile={null}
      onInputChange={setInput}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onAttachFile={vi.fn()}
      onRemoveFile={vi.fn()}
    />
  );
}

describe('ChatInput', () => {
  it('grows the composer for long drafts before falling back to internal scroll', () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 600,
    });

    render(<ChatInputHarness />);

    const textarea = screen.getByPlaceholderText('Send a message...') as HTMLTextAreaElement;

    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      value: 260,
    });
    fireEvent.change(textarea, {
      target: { value: 'First long paragraph\nSecond long paragraph\nThird long paragraph' },
    });

    expect(textarea.style.height).toBe('260px');
    expect(textarea.style.overflowY).toBe('hidden');

    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      value: 900,
    });
    fireEvent.change(textarea, {
      target: {
        value:
          'First long paragraph\nSecond long paragraph\nThird long paragraph\nFourth long paragraph\nFifth long paragraph',
      },
    });

    expect(textarea.style.height).toBe('432px');
    expect(textarea.style.overflowY).toBe('auto');
  });
});
