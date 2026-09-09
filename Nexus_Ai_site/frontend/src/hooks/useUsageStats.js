import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';

export function useUsageStats({ enabled = true } = {}) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/billing/usage-stats');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setStats(await res.json());
    } catch (e) {
      setError(e.message || 'Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refresh: fetchStats };
}
