import { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';
import { useArtifactSync } from '../hooks/useArtifactSync';

const ArtifactContext = createContext(null);

export function ArtifactProvider({ children }) {
  const { authStatus } = useAuth();
  const sync = useArtifactSync({
    authorized: authStatus.authorized,
    userEmail: authStatus.profile?.email,
  });
  return <ArtifactContext.Provider value={sync}>{children}</ArtifactContext.Provider>;
}

export function useArtifacts() {
  const ctx = useContext(ArtifactContext);
  if (!ctx) {
    throw new Error('useArtifacts must be used within ArtifactProvider');
  }
  return ctx;
}

export function useArtifactsOptional() {
  return useContext(ArtifactContext);
}
