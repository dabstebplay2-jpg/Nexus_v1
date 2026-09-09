import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { UserMemoryProvider } from './context/UserMemoryContext';
import { ArtifactProvider } from './context/ArtifactContext';
import ChatPage from './pages/ChatPage';

const AuthModal = lazy(() => import('./components/auth/AuthModal'));
const SettingsModal = lazy(() => import('./components/settings/SettingsModal'));
const SpacesPage = lazy(() => import('./pages/SpacesPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const RequisitesPage = lazy(() => import('./pages/RequisitesPage'));
const OfferPage = lazy(() => import('./pages/OfferPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const IdeDownloadPage = lazy(() => import('./pages/IdeDownloadPage'));
const BrowserDownloadPage = lazy(() => import('./pages/BrowserDownloadPage'));
const IdeExtensionDownloadPage = lazy(() => import('./pages/IdeExtensionDownloadPage'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));
const IdeAuthBridgePage = lazy(() => import('./pages/IdeAuthBridgePage'));
const BrowserAuthBridgePage = lazy(() => import('./pages/BrowserAuthBridgePage'));
const UpdatesPage = lazy(() => import('./pages/UpdatesPage'));
const ArtifactsPage = lazy(() => import('./pages/ArtifactsPage'));
const IdeLitePage = lazy(() => import('./pages/IdeLitePage'));
const ConnectorsPage = lazy(() => import('./pages/ConnectorsPage'));
const ConnectorsCallbackPage = lazy(() => import('./pages/ConnectorsCallbackPage'));

function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-sm text-zinc-500">
      Загрузка…
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <UserMemoryProvider>
        <ArtifactProvider>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/chat" element={<Navigate to="/" replace />} />
          <Route path="/spaces" element={<SpacesPage />} />
          <Route path="/artifacts" element={<ArtifactsPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/requisites" element={<RequisitesPage />} />
          <Route path="/offer" element={<OfferPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/updates" element={<UpdatesPage />} />
          <Route path="/connectors" element={<ConnectorsPage />} />
          <Route path="/connectors/callback" element={<ConnectorsCallbackPage />} />
          <Route path="/profile" element={<DashboardPage />} />
          <Route path="/dashboard" element={<Navigate to="/profile" replace />} />
          <Route path="/browser" element={<BrowserDownloadPage />} />
          <Route path="/ide" element={<IdeDownloadPage />} />
          <Route path="/ide/extension/nexus-ai" element={<IdeExtensionDownloadPage />} />
          <Route path="/ide/lite" element={<IdeLitePage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/auth/ide-login" element={<IdeAuthBridgePage />} />
          <Route path="/auth/browser-login" element={<BrowserAuthBridgePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        <Suspense fallback={null}>
          <AuthModal />
          <SettingsModal />
        </Suspense>
        </ArtifactProvider>
        </UserMemoryProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
