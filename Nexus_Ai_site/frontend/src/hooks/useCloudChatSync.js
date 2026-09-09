import { useEffect, useRef, useCallback, useState } from 'react';
import { loadChatState } from '../lib/chatStore';
import {
  deleteCloudChat,
  fetchCloudChats,
  importCloudChats,
  loadActiveChatId,
  saveActiveChatId,
  upsertCloudChat,
} from '../lib/chatCloudApi';
import { clearStoredTokens } from '../lib/authStorage';
import { sanitizeConversationForCloud } from '../lib/chatSyncAttachments';

/**
 * Синхронизация истории чата с облаком (по аккаунту).
 */
export function useCloudChatSync({ authorized, userEmail, chatState, setChatState }) {
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const saveTimers = useRef(new Map());
  const hydratedRef = useRef(false);

  const upsertToCloud = useCallback(async (conv) => {
    await upsertCloudChat(
      sanitizeConversationForCloud({
        ...conv,
        updatedAt: conv.updatedAt || Date.now(),
      })
    );
  }, []);

  const persistConversation = useCallback(
    (conv) => {
      if (!authorized || !hydratedRef.current || !conv?.id) return;
      const prev = saveTimers.current.get(conv.id);
      if (prev) clearTimeout(prev);
      saveTimers.current.set(
        conv.id,
        setTimeout(async () => {
          try {
            await upsertToCloud(conv);
          } catch (e) {
            console.warn('cloud chat save:', e.message);
          }
        }, 900)
      );
    },
    [authorized, upsertToCloud]
  );

  /** Немедленное сохранение (после генерации изображения). */
  const persistConversationNow = useCallback(
    async (conv) => {
      if (!authorized || !hydratedRef.current || !conv?.id) return;
      const prev = saveTimers.current.get(conv.id);
      if (prev) clearTimeout(prev);
      saveTimers.current.delete(conv.id);
      try {
        await upsertToCloud(conv);
      } catch (e) {
        console.warn('cloud chat save (immediate):', e.message);
      }
    },
    [authorized, upsertToCloud]
  );

  const deleteConversation = useCallback(
    async (chatId) => {
      if (!authorized || !chatId) return;
      const t = saveTimers.current.get(chatId);
      if (t) clearTimeout(t);
      saveTimers.current.delete(chatId);
      try {
        await deleteCloudChat(chatId);
      } catch (e) {
        console.warn('cloud chat delete:', e.message);
      }
    },
    [authorized]
  );

  useEffect(() => {
    if (!authorized || !userEmail) {
      hydratedRef.current = false;
      setCloudReady(false);
      setCloudError('');
      for (const t of saveTimers.current.values()) clearTimeout(t);
      saveTimers.current.clear();
      setChatState((s) =>
        s.conversations.length || s.activeConversationId
          ? { ...s, conversations: [], activeConversationId: null }
          : s
      );
      return;
    }

    let cancelled = false;

    (async () => {
      setCloudError('');
      try {
        let conversations = await fetchCloudChats();

        if (cancelled) return;

        if (!conversations.length) {
          const local = loadChatState();
          const localChats = (local.conversations || []).filter((c) => !c.workspaceId);
          if (localChats.length) {
            const imported = await importCloudChats(localChats);
            if (imported?.length) conversations = imported;
          }
        }

        if (cancelled) return;

        const savedActive = loadActiveChatId(userEmail);
        const activeConversationId =
          savedActive && conversations.some((c) => c.id === savedActive)
            ? savedActive
            : conversations[0]?.id ?? null;

        setChatState((s) => ({
          ...s,
          conversations,
          activeConversationId,
        }));
        hydratedRef.current = true;
        setCloudReady(true);
      } catch (e) {
        if (cancelled) return;
        if (e.message === 'UNAUTHORIZED') {
          clearStoredTokens();
          setCloudError('Сессия истекла. Войдите снова.');
          hydratedRef.current = true;
          setCloudReady(true);
          return;
        }
        setCloudError(e.message || 'Ошибка загрузки истории');
        hydratedRef.current = true;
        setCloudReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authorized, userEmail, setChatState]);

  useEffect(() => {
    if (!authorized || !userEmail || !cloudReady) return;
    saveActiveChatId(userEmail, chatState.activeConversationId);
  }, [authorized, userEmail, cloudReady, chatState.activeConversationId]);

  return {
    cloudReady,
    cloudError,
    persistConversation,
    persistConversationNow,
    deleteConversation,
    isCloudMode: authorized && cloudReady,
  };
}
