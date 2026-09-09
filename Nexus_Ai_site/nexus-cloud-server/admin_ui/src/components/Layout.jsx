import {
  Activity,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Receipt,
  ScrollText,
  Server,
  Users,
  Zap,
} from 'lucide-react';
import { getServerUrl, setAdminPassword, useCloudProxy, useLocalDatabase } from '../lib/adminApi';

const NAV = [
  { id: 'dashboard', label: 'Обзор', icon: LayoutDashboard },
  { id: 'users', label: 'Пользователи', icon: Users },
  { id: 'transactions', label: 'Транзакции', icon: Receipt },
  { id: 'invoices', label: 'Счета', icon: FileText },
  { id: 'support', label: 'Поддержка', icon: MessageSquare },
  { id: 'routerai', label: 'ИИ-провайдеры', icon: Zap },
  { id: 'audit', label: 'Аудит', icon: ScrollText },
  { id: 'logs', label: 'Логи', icon: Server },
];

export default function Layout({ tab, setTab, onLogout, children }) {
  const server = getServerUrl();
  const viaProxy = useCloudProxy();
  const localOnly = useLocalDatabase();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>NEXUS ADMIN</h1>
        <p
          className="muted"
          style={{
            fontSize: '0.65rem',
            margin: '0 0.5rem 0.75rem',
            lineHeight: 1.3,
            wordBreak: 'break-all',
            color: localOnly ? 'var(--warn, #e6a700)' : undefined,
          }}
        >
          {localOnly ? '⚠ Локальная БД' : viaProxy ? 'Облако' : 'Локальный API'}:{' '}
          {server.replace(/^https?:\/\//, '')}
        </p>
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`nav-btn ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="nav-btn"
          onClick={() => {
            setAdminPassword('');
            onLogout();
          }}
        >
          <LogOut size={16} />
          Выйти
        </button>
        <p className="muted" style={{ fontSize: '0.7rem', margin: '0.5rem', opacity: 0.7 }}>
          <Activity size={12} style={{ verticalAlign: 'middle' }} /> Ctrl+K — поиск
        </p>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
