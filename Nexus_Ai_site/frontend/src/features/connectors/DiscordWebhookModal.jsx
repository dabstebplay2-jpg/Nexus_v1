import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

export default function DiscordWebhookModal({ open, busy, onClose, onSubmit }) {
  const [webhookUrl, setWebhookUrl] = useState('https://discord.com/api/webhooks/');
  const [channelLabel, setChannelLabel] = useState('');

  useEffect(() => {
    if (open) {
      setWebhookUrl('https://discord.com/api/webhooks/');
      setChannelLabel('');
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const url = webhookUrl.trim();
    if (!url.startsWith('https://discord.com/api/webhooks/')) return;
    onSubmit?.(url, channelLabel.trim() || undefined);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="discord-webhook-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 id="discord-webhook-title" className="text-base font-semibold text-white">
              Подключить Discord
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              Создайте вебхук: Настройки канала → Интеграции → Вебхуки.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white p-1"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-xs text-zinc-400">URL вебхука</span>
            <input
              type="url"
              required
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              placeholder="https://discord.com/api/webhooks/..."
            />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400">Название канала (необязательно)</span>
            <input
              type="text"
              value={channelLabel}
              onChange={(e) => setChannelLabel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              placeholder="#signal"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-xs text-zinc-400 hover:text-white"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              Подключить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
