import { useEffect, useState } from 'react';
import { ensureCloudTarget, getAdminPassword, loadBootstrap } from './lib/adminApi';

ensureCloudTarget();
import LoginScreen from './components/LoginScreen';
import Layout from './components/Layout';
import CommandPalette from './components/CommandPalette';
import { ToastProvider } from './context/ToastContext';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import TransactionsPage from './pages/TransactionsPage';
import InvoicesPage from './pages/InvoicesPage';
import SupportPage from './pages/SupportPage';
import RouterAiPage from './pages/RouterAiPage';
import AuditPage from './pages/AuditPage';
import LogsPage from './pages/LogsPage';

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getAdminPassword()));
  const [tab, setTab] = useState('dashboard');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [userPickId, setUserPickId] = useState(null);

  useEffect(() => {
    loadBootstrap();
    ensureCloudTarget();
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onCmdUser = (id) => {
    setTab('users');
    setUserPickId(id);
  };

  if (!authed) {
    return (
      <ToastProvider>
        <LoginScreen onSuccess={() => setAuthed(true)} />
      </ToastProvider>
    );
  }

  let page = null;
  if (tab === 'dashboard') page = <DashboardPage />;
  else if (tab === 'users') page = <UsersPage openUserId={userPickId} onOpenUser={setUserPickId} />;
  else if (tab === 'transactions') page = <TransactionsPage />;
  else if (tab === 'invoices') page = <InvoicesPage />;
  else if (tab === 'support') page = <SupportPage />;
  else if (tab === 'routerai') page = <RouterAiPage />;
  else if (tab === 'audit') page = <AuditPage />;
  else if (tab === 'logs') page = <LogsPage />;

  return (
    <ToastProvider>
      <Layout tab={tab} setTab={setTab} onLogout={() => setAuthed(false)}>
        {page}
      </Layout>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onSelectUser={onCmdUser} />
    </ToastProvider>
  );
}
