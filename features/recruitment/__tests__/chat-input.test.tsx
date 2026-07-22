import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  I18nProvider,
  type Locale,
} from '@/components/shared/i18n-provider';


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
      references={[]}
      onAddReference={vi.fn()}
      onRemoveReference={vi.fn()}
      onClearReferences={vi.fn()}
    />
  );
}

function renderChatInput(locale: Locale = 'en') {
  return render(
    <I18nProvider defaultLocale={locale}>
      <ChatInputHarness />
    </I18nProvider>,
  );
}

describe('ChatInput', () => {
  it('grows the composer for long drafts before falling back to internal scroll', () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 600,
    });

    renderChatInput();

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
  it('localizes slash command navigation and inserted prompts in French', () => {
    renderChatInput('fr');

    const textarea = screen.getByPlaceholderText(
      'Envoyer un message...',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '/' } });

    expect(
      screen.getByRole('listbox', {
        name: "Commandes slash de l'agent",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Commandes de l'agent")).toBeInTheDocument();
    expect(screen.getByText('Référencer un CV')).toBeInTheDocument();
    expect(screen.queryByText('Reference CV')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('option', {
        name: /\/analyse Modèles d'analyse/,
      }),
    );
    expect(
      screen.getByRole('option', { name: /Forces et risques du CV/ }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('option', { name: /Forces et risques du CV/ }),
    );
    expect(textarea.value).toBe(
      'Résume ce CV : forces, risques, preuves manquantes et types de postes adaptés. Propose ensuite la prochaine action TA.',
    );
  });
  it('exposes slash command focus state to assistive technology', () => {
    renderChatInput();

    const textarea = screen.getByRole('combobox', {
      name: 'Message to recruitment agent',
    });
    fireEvent.change(textarea, { target: { value: '/' } });

    const listbox = screen.getByRole('listbox', {
      name: 'Agent slash commands',
    });
    const selectedOption = screen
      .getAllByRole('option')
      .find((option) => option.getAttribute('aria-selected') === 'true');
    expect(selectedOption).toBeDefined();
    expect(textarea).toHaveAttribute('aria-expanded', 'true');
    expect(textarea).toHaveAttribute('aria-controls', listbox.id);
    expect(textarea).toHaveAttribute(
      'aria-activedescendant',
      selectedOption?.id,
    );

    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    const nextSelectedOption = screen
      .getAllByRole('option')
      .find((option) => option.getAttribute('aria-selected') === 'true');
    expect(nextSelectedOption?.id).not.toBe(selectedOption?.id);
    expect(textarea).toHaveAttribute(
      'aria-activedescendant',
      nextSelectedOption?.id,
    );

    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(textarea).toHaveAttribute('aria-expanded', 'false');
    expect(textarea).not.toHaveAttribute('aria-controls');
    expect(textarea).not.toHaveAttribute('aria-activedescendant');
  });


});
