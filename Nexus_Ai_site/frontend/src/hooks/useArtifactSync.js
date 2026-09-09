import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listArtifacts,
  loadLocalArtifacts,
  mergeArtifactLists,
  removeLocalArtifact,
  setArtifactUserKey,
  subscribeArtifacts,
  upsertLocalArtifact,
} from '../lib/artifactStore';
import { fetchCloudArtifacts, syncCloudArtifacts, deleteCloudArtifact } from '../lib/artifactCloudApi';

export function useArtifactSync({ authorized, userEmail }) {
  const [artifacts, setArtifacts] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const saveTimer = useRef(null);
  const hydrated = useRef(false);

  const refreshLocal = useCallback(() => {
    setArtifacts(listArtifacts());
  }, []);

  useEffect(() => {
    setArtifactUserKey(authorized ? userEmail : 'guest');
    return subscribeArtifacts(() => refreshLocal());
  }, [authorized, userEmail, refreshLocal]);

  useEffect(() => {
    if (!authorized || !userEmail) {
      hydrated.current = false;
      setError('');
      setArtifacts(listArtifacts());
      setReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      setError('');
      try {
        const remote = await fetchCloudArtifacts();
        if (cancelled) return;
        const local = loadLocalArtifacts();
        const merged = mergeArtifactLists(remote, local);
        for (const a of merged) upsertLocalArtifact(a);
        setArtifacts(listArtifacts());
        hydrated.current = true;
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        if (e.message === 'UNAUTHORIZED') return;
        setError(e.message || 'Ошибка загрузки артефактов');
        setArtifacts(listArtifacts());
        hydrated.current = true;
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authorized, userEmail]);

  const scheduleCloudSync = useCallback(() => {
    if (!authorized || !hydrated.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await syncCloudArtifacts(listArtifacts());
      } catch (e) {
        console.warn('artifact cloud sync:', e.message);
      }
    }, 1200);
  }, [authorized]);

  const registerArtifact = useCallback(
    (artifact) => {
      const saved = upsertLocalArtifact(artifact);
      refreshLocal();
      scheduleCloudSync();
      return saved;
    },
    [refreshLocal, scheduleCloudSync]
  );

  const removeArtifact = useCallback(
    async (id) => {
      removeLocalArtifact(id);
      refreshLocal();
      if (authorized) {
        try {
          await deleteCloudArtifact(id);
        } catch (e) {
          console.warn('artifact delete:', e.message);
        }
      }
      scheduleCloudSync();
    },
    [authorized, refreshLocal, scheduleCloudSync]
  );

  return {
    artifacts,
    artifactsReady: ready,
    artifactsError: error,
    registerArtifact,
    removeArtifact,
    scheduleCloudSync,
  };
}
