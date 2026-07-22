import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '@/components/shared/i18n-provider';
import { AgentChatSurface } from '../components/chat/agent-chat-surface';
import type { ChatView } from '../components/chat/chat-types';
import type { StatisticsChatController } from '../components/chat/use-statistics-chat-controller';

function AgentSurfaceHarness() {
  const [view, setView] = useState<ChatView>('chat');
  const controller: StatisticsChatController = {
    view,
    setView,
    conversations: [],
    activeConversationId: null,
    messages: [],
    input: '',
    isStreaming: false,
    isLoadingHistory: false,
    attachedFile: null,
    references: [],
    addReference: () => {},
    setInput: () => {},
    switchConversation: async () => {},
    createNewChat: async () => {},
    deleteConversation: async () => {},
    handleStop: () => {},
    sendMessage: async () => {},
    attachFile: () => {},
    removeFile: () => {},
    removeReference: () => {},
    clearReferences: () => {},
    confirmAction: async () => {},
  };

  return <AgentChatSurface controller={controller} variant="workspace" />;
}
    Object.defineProperty(Element.prototype, 'scrollTo', {
      configurable: true,
      value: () => {},
    });


describe('AgentChatSurface history keyboard flow', () => {
  it('moves focus into history and restores it after Escape', async () => {
    render(
      <I18nProvider defaultLocale="en">
        <AgentSurfaceHarness />
      </I18nProvider>,
    );

    const historyTrigger = screen.getByRole('button', {
      name: 'Chat History',
    });
    historyTrigger.focus();
    fireEvent.click(historyTrigger);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Back to chat' }),
      ).toHaveFocus();
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Chat History' }),
      ).toHaveFocus();
    });
  });
});
