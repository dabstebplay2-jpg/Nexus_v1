import { useNavigate } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import IdeApp from '../IdeApp';

export default function IdeLitePage() {
  const navigate = useNavigate();
  return (
    <AppShell
      hideHistory
      ambientFocus="center"
      compactChrome
      showMobileTabBar={false}
      onOpenPricing={() => navigate('/pricing')}
    >
      <IdeApp embedded />
    </AppShell>
  );
}
