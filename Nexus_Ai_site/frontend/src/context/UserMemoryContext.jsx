import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchUserMemory, saveUserMemory, synthesizeUserMemory } from '../lib/userMemoryApi';
import { clearGuestMemory, loadGuestMemory, saveGuestMemory } from '../lib/userMemoryLocal';

const UserMemoryContext = createContext(null);

export function UserMemoryProvider({ children }) {
  const { authStatus } = useAuth();
  const authorized = authStatus.authorized;
  const [content, setContent] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [autoLearn, setAutoLearn] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [error, setError] = useState('');
  const loadedRef = useRef(false);

  const applyPayload = useCallback((data) => {
    setContent(data?.content || '');
    setEnabled(data?.enabled !== false);
    setAutoLearn(data?.auto_learn !== false);
    setUpdatedAt(data?.updated_at || null);
  }, []);

  const refresh = useCallback(async () => {
    if (!authorized) {
      applyPayload(loadGuestMemory());
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchUserMemory();
      applyPayload(data);
      loadedRef.current = true;
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [authorized, applyPayload]);

  useEffect(() => {
    loadedRef.current = false;
    if (!authorized) {
      applyPayload(loadGuestMemory());
      loadedRef.current = true;
      return;
    }
    refresh();
  }, [authorized, applyPayload, refresh]);

  const persist = useCallback(
    async (nextContent, nextEnabled, nextAutoLearn) => {
      const c = nextContent !== undefined ? nextContent : content;
      const en = nextEnabled !== undefined ? nextEnabled : enabled;
      const al = nextAutoLearn !== undefined ? nextAutoLearn : autoLearn;
      if (!authorized) {
        saveGuestMemory({ content: c, enabled: en, auto_learn: al });
        setContent(c);
        setEnabled(en);
        setAutoLearn(al);
        return { content: c, enabled: en, auto_learn: al };
      }
      setSaving(true);
      setError('');
      try {
        const data = await saveUserMemory({ content: c, enabled: en, auto_learn: al });
        applyPayload(data);
        return data;
      } catch (e) {
        setError(e.message || String(e));
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [authorized, content, enabled, autoLearn, applyPayload]
  );

  const synthesize = useCallback(async () => {
    if (!authorized) {
      throw new Error('Войдите в аккаунт, чтобы обновить память из чатов Nexus.');
    }
    setSynthesizing(true);
    setError('');
    try {
      const data = await synthesizeUserMemory();
      return data?.suggested_content || '';
    } catch (e) {
      setError(e.message || String(e));
      throw e;
    } finally {
      setSynthesizing(false);
    }
  }, [authorized]);

  /** После «запомни…» в чате — фоновое обновление на сервере, подтягиваем с задержкой. */
  const refreshAfterLearn = useCallback(() => {
    window.setTimeout(() => refresh(), 2500);
    window.setTimeout(() => refresh(), 6000);
  }, [refresh]);

  useEffect(() => {
    if (authorized) {
      clearGuestMemory();
    }
  }, [authorized]);

  return (
    <UserMemoryContext.Provider
      value={{
        content,
        setContent,
        enabled,
        setEnabled,
        autoLearn,
        setAutoLearn,
        updatedAt,
        loading,
        saving,
        synthesizing,
        error,
        refresh,
        refreshAfterLearn,
        persist,
        synthesize,
        loaded: loadedRef.current,
      }}
    >
      {children}
    </UserMemoryContext.Provider>
  );
}

export function useUserMemory() {
  const ctx = useContext(UserMemoryContext);
  if (!ctx) throw new Error('useUserMemory requires UserMemoryProvider');
  return ctx;
}

export function useUserMemoryOptional() {
  return useContext(UserMemoryContext);
}
