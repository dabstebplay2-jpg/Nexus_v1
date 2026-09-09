import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { getApiBase } from '../lib/api';

/** Google OAuth bridge for Nexus Browser desktop app. */
export default function BrowserAuthBridgePage() {
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        sessionStorage.setItem('nexus_oauth_for_browser', '1');
        const base = await getApiBase();
        const returnTo = typeof window !== 'undefined' ? window.location.origin : '';
        const url = `${base}/auth/google/start?${new URLSearchParams({ return_to: returnTo }).toString()}`;
        if (!cancelled) window.location.href = url;
      } catch (e) {
        if (!cancelled) setError(e.message || 'Не удалось открыть Google');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="nx-dvh-screen bg-[#07070a] flex flex-col items-center justify-center gap-4 px-6 text-center max-w-lg">
        <p className="text-red-400 text-sm leading-relaxed">{error}</p>
        <Link to="/" className="text-cyan-400 hover:underline">
          На главную
        </Link>
      </div>
    );
  }

  return (
    <div className="nx-dvh-screen bg-[#07070a] flex flex-col items-center justify-center gap-3 text-cyan-400 px-6 text-center">
      <RefreshCw className="animate-spin" size={28} />
      <p className="text-sm">Перенаправляем в Google…</p>
      <p className="text-zinc-500 text-xs">После входа откроется Nexus Browser.</p>
    </div>
  );
}
