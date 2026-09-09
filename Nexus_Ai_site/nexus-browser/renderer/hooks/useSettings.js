import { useCallback, useEffect, useState } from 'react';

export function useSettings() {
  const [settings, setSettings] = useState(null);
  const [searchEngines, setSearchEngines] = useState([]);

  const refresh = useCallback(async () => {
    const [s, engines] = await Promise.all([
      window.nexusBrowser.storage.settings(),
      window.nexusBrowser.storage.searchEngines(),
    ]);
    setSettings(s);
    setSearchEngines(engines);
    return s;
  }, []);

  const update = useCallback(async (partial) => {
    const next = await window.nexusBrowser.storage.updateSettings(partial);
    setSettings(next);
    return next;
  }, []);

  useEffect(() => {
    refresh();
    const unsub = window.nexusBrowser.storage.onSettingsChanged((next) => setSettings(next));
    return unsub;
  }, [refresh]);

  return { settings, searchEngines, refresh, update };
}
