import { useState, useEffect, useCallback } from 'react';
import { collectConversationCodeFiles } from '../lib/conversationCodeFiles';
import { parseMessageContent } from '../lib/parseMessageContent';

function filesForMessage(message, messages) {
  if (!message) return [];
  if (message.codeFiles?.length) return message.codeFiles;
  return parseMessageContent(message.content || '').codeFiles;
}

export function useChatCodePanel(messages, { autoOpenWhileStreaming = false, streaming = false } = {}) {
  const [panel, setPanel] = useState({
    open: false,
    files: [],
    activeFileId: null,
    messageId: null,
  });

  const openFromMessage = useCallback(
    (message, fileId) => {
      if (!message) return;
      const projectFiles = collectConversationCodeFiles(messages || [], {
        includeMessageId: message.id,
      });
      const turnFiles = filesForMessage(message, messages);
      const files = projectFiles.length ? projectFiles : turnFiles;
      if (!files.length) return;
      const activeFileId =
        fileId && files.some((f) => f.id === fileId)
          ? fileId
          : turnFiles.length
            ? turnFiles[turnFiles.length - 1].id
            : files[files.length - 1].id;
      setPanel({
        open: true,
        files,
        activeFileId,
        messageId: message.id ?? null,
      });
    },
    [messages]
  );

  const closePanel = useCallback(() => {
    setPanel((p) => ({ ...p, open: false }));
  }, []);

  const selectFile = useCallback((fileId) => {
    setPanel((p) => ({ ...p, activeFileId: fileId, open: true }));
  }, []);

  useEffect(() => {
    if (!messages?.length) return;
    const last = messages[messages.length - 1];
    if (last?.role !== 'assistant') return;

    const projectFiles = collectConversationCodeFiles(messages);
    const turnFiles = filesForMessage(last, messages);
    const files = projectFiles.length ? projectFiles : turnFiles;
    if (!files.length && !last.content) return;

    setPanel((prev) => {
      const sameMessage = prev.messageId != null && prev.messageId === last.id;
      const shouldOpen = prev.open || (autoOpenWhileStreaming && streaming);
      if (!shouldOpen && !sameMessage) return prev;
      if (!files.length) return prev;

      const activeFileId =
        prev.activeFileId && files.some((f) => f.id === prev.activeFileId)
          ? prev.activeFileId
          : files[files.length - 1].id;

      return {
        open: shouldOpen || prev.open,
        files,
        activeFileId,
        messageId: last.id ?? null,
      };
    });
  }, [messages, streaming, autoOpenWhileStreaming]);

  return {
    codePanel: panel,
    openFromMessage,
    closePanel,
    selectFile,
    setPanel,
  };
}
