import { useEffect, useState } from 'react';
import {
  DEFAULT_CLOUD,
  isHostedOnCloudApi,
  checkAdminPassword,
  loadBootstrap,
  probeProxyHealth,
  setAdminPassword,
  setServerUrl,
  getServerUrl,
  setUseLocalDatabase,
  useLocalDatabase,
} from '../lib/adminApi';

export default function LoginScreen({ onSuccess }) {
  const [pw, setPw] = useState('');
  const [server, setServer] = useState(DEFAULT_CLOUD);
  const [localDb, setLocalDb] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadBootstrap().then(() => {
      setLocalDb(useLocalDatabase());
      if (isHostedOnCloudApi()) {
        setServer(window.location.origin);
      } else if (!useLocalDatabase()) {
        setServer(getServerUrl());
      }
    });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setUseLocalDatabase(localDb);
    const cloud = server.trim() || DEFAULT_CLOUD;
    if (!localDb) setServerUrl(cloud);

    if (!localDb && !isHostedOnCloudApi()) {
      const health = await probeProxyHealth(cloud);
      if (health && health.cloud_admin_api === false) {
        setErr(health.hint || 'Админ-API на Render не найден. Проверьте NEXUS_REMOTE_ADMIN на сервере.');
        setBusy(false);
        return;
      }
    }

    const ok = await checkAdminPassword(pw.trim());
    if (ok) {
      setAdminPassword(pw.trim());
      onSuccess(cloud);
    } else {
      setErr('Неверный пароль или админка отключена на сервере');
    }
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Nexus Admin</h1>
        <p>Панель управления пользователями, подписками и поддержкой.</p>
        <label className="muted" style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>
          Облачный API (Render / Vercel proxy)
        </label>
        <input
          type="url"
          placeholder={DEFAULT_CLOUD}
          value={server}
          onChange={(e) => setServer(e.target.value)}
          autoComplete="off"
          disabled={localDb}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', marginTop: 4 }}>
          <input
            type="checkbox"
            checked={localDb}
            onChange={(e) => setLocalDb(e.target.checked)}
          />
          Только локальная БД (dev, без прод-пользователей)
        </label>
        <input
          type="password"
          placeholder="Пароль администратора"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
        />
        {err ? <p style={{ color: 'var(--danger)', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{err}</p> : null}
        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Проверка…' : 'Войти'}
        </button>
        <p className="muted" style={{ fontSize: '0.75rem', marginTop: 8 }}>
          Для продакшн-пользователей укажите URL облака. Локальная БД (127.0.0.1) — только для dev.
        </p>
      </form>
    </div>
  );
}
