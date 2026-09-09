import { useCallback, useEffect, useState } from 'react';
import {
  connectDiscordWebhook,
  disconnectConnector,
  fetchConnectors,
  patchConnector,
  startConnectorOAuth,
} from './connectorsApi';

export function useConnectors({ enabled = true } = {}) {
  const [data, setData] = useState({
    categories: [],
    connectors: [],
    tier_blocks_connectors: false,
    oauth_status: null,
    user_tier: 'FREE',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [discordModalOpen, setDiscordModalOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const json = await fetchConnectors();
      setData(json);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError('');
      setData({
        categories: [],
        connectors: [],
        tier_blocks_connectors: false,
        oauth_status: null,
        user_tier: 'FREE',
      });
      return;
    }
    reload();
  }, [enabled, reload]);

  const connect = useCallback(
    async (connectorId) => {
      setBusyId(connectorId);
      setError('');
      try {
        if (connectorId === 'discord') {
          setDiscordModalOpen(true);
          return;
        }
        const res = await startConnectorOAuth(connectorId, window.location.origin);
        if (res.url) {
          window.location.href = res.url;
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setBusyId('');
      }
    },
    []
  );

  const submitDiscordWebhook = useCallback(
    async (webhookUrl, channelLabel) => {
      setBusyId('discord');
      setError('');
      try {
        await connectDiscordWebhook(webhookUrl, channelLabel);
        setDiscordModalOpen(false);
        await reload();
      } catch (e) {
        setError(e.message);
      } finally {
        setBusyId('');
      }
    },
    [reload]
  );

  const disconnect = useCallback(
    async (connectorId) => {
      setBusyId(connectorId);
      try {
        await disconnectConnector(connectorId);
        await reload();
      } catch (e) {
        setError(e.message);
      } finally {
        setBusyId('');
      }
    },
    [reload]
  );

  const toggleChat = useCallback(
    async (connectorId, enabled) => {
      try {
        await patchConnector(connectorId, enabled);
        await reload();
      } catch (e) {
        setError(e.message);
      }
    },
    [reload]
  );

  return {
    categories: data.categories || [],
    connectors: data.connectors || [],
    tierBlocksConnectors: Boolean(data.tier_blocks_connectors),
    oauthStatus: data.oauth_status,
    userTier: data.user_tier || 'FREE',
    loading,
    error,
    busyId,
    reload,
    connect,
    disconnect,
    toggleChat,
    discordModalOpen,
    setDiscordModalOpen,
    submitDiscordWebhook,
  };
}
