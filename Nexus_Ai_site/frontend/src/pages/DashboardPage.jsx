import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/** /profile открывает модалку настроек и возвращает на главную */
export default function DashboardPage() {
  const { loading, authStatus, openSettingsModal } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (authStatus.authorized) {
      openSettingsModal('account');
      navigate('/', { replace: true });
    }
  }, [loading, authStatus.authorized, openSettingsModal, navigate]);

  if (loading) {
    return (
      <div className="nx-dvh-screen bg-[#07070a] flex items-center justify-center text-cyan-400">
        <RefreshCw className="animate-spin" />
      </div>
    );
  }

  if (!authStatus.authorized) {
    return <Navigate to="/?panel=auth" replace />;
  }

  return null;
}
