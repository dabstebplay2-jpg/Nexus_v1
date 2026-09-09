import { useEffect, useRef, useState } from 'react';
import { fetchCloudSpaces, syncCloudSpaces } from '../lib/spaceCloudApi';

export function useCloudSpaceSync({ authorized, userEmail, state, setState }) {
  const [cloudReady, setCloudReady] = useState(!authorized);
  const [cloudError, setCloudError] = useState('');
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    if (!authorized || !userEmail) {
      hydratedRef.current = false;
      setCloudReady(true);
      setCloudError('');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      return undefined;
    }

    let cancelled = false;
    setCloudReady(false);
    setCloudError('');
    (async () => {
      try {
        let remote = await fetchCloudSpaces();
        if (cancelled) return;
        if (!remote.workspaces.length && state.workspaces.length) {
          remote = await syncCloudSpaces(state);
        }
        if (cancelled) return;
        if (remote.workspaces.length) {
          setState((current) => {
            const activeWorkspaceId = remote.workspaces.some(
              (workspace) => workspace.id === current.activeWorkspaceId
            )
              ? current.activeWorkspaceId
              : remote.workspaces[0].id;
            const activeConversationId = remote.conversations.some(
              (conversation) => conversation.id === current.activeConversationId
            )
              ? current.activeConversationId
              : null;
            return {
              ...current,
              workspaces: remote.workspaces,
              conversations: remote.conversations,
              activeWorkspaceId,
              activeConversationId,
            };
          });
        }
        hydratedRef.current = true;
        setCloudReady(true);
      } catch (error) {
        if (cancelled) return;
        hydratedRef.current = false;
        setCloudReady(true);
        setCloudError(
          error.message === 'UNAUTHORIZED'
            ? 'Сессия истекла. Войдите снова, чтобы синхронизировать пространства.'
            : error.message || 'Пространства доступны только на этом устройстве.'
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authorized, userEmail, setState]);

  useEffect(() => {
    if (!authorized || !cloudReady || !hydratedRef.current) return undefined;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await syncCloudSpaces(state);
        setCloudError('');
      } catch (error) {
        setCloudError(error.message || 'Не удалось сохранить изменения в облаке.');
      }
    }, 900);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [authorized, cloudReady, state]);

  return { cloudReady, cloudError, cloudEnabled: authorized && cloudReady && !cloudError };
}
