import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LifeBuoy, Loader2, MessageCircleQuestion, Paperclip, Plus, RefreshCw, Send } from 'lucide-react';
import { useSupport } from '../../hooks/useSupport';
import { useVisualViewportPadding } from '../../hooks/useVisualViewportPadding';
import { processAttachmentFiles } from '../../lib/attachments';
import AttachmentBar from '../chat/AttachmentBar';

const CATEGORIES = [
  { id: 'question', label: 'Вопрос' },
  { id: 'complaint', label: 'Жалоба' },
  { id: 'bug', label: 'Баг' },
  { id: 'other', label: 'Другое' },
];

const STATUS_LABEL = {
  open: 'Открыто',
  answered: 'Есть ответ',
  closed: 'Закрыто',
};

function statusClass(status) {
  if (status === 'answered') return 'text-teal-400';
  if (status === 'closed') return 'text-[var(--nx-muted)]';
  return 'text-amber-400';
}

function SupportMessage({ message }) {
  const isAdmin = message.author === 'admin';
  return (
    <div
      className={`rounded-xl px-3 py-2 text-sm max-w-[92%] ${
        isAdmin
          ? 'ml-auto bg-teal-500/10 border border-teal-500/30'
          : 'mr-auto bg-[var(--nx-surface)] border border-[var(--nx-border)]'
      }`}
    >
      <p className="text-[10px] text-[var(--nx-muted)] mb-1">
        {isAdmin ? 'Поддержка' : 'Вы'} ·{' '}
        {message.created_at
          ? new Date(message.created_at).toLocaleString('ru-RU', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })
          : ''}
      </p>
      <p className="whitespace-pre-wrap leading-relaxed select-text">{message.body}</p>
      {(message.attachments || []).length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {message.attachments.map((a, i) =>
            a.kind === 'image' && a.preview_url ? (
              <a key={i} href={a.preview_url} target="_blank" rel="noopener noreferrer">
                <img
                  src={a.preview_url}
                  alt={a.name}
                  className="max-h-28 rounded-lg border border-[var(--nx-border)]"
                />
              </a>
            ) : a.text_preview ? (
              <pre
                key={i}
                className="text-[10px] max-h-24 overflow-auto p-2 rounded bg-black/20 border border-[var(--nx-border)]"
              >
                {a.text_preview}
              </pre>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

export default function SupportPanel({ open, onClose, onNeedAuth }) {
  const {
    tickets,
    detail,
    loading,
    error,
    setError,
    loadTickets,
    loadTicket,
    createTicket,
    sendMessage,
    clearTicket,
    maxAttachments,
  } = useSupport();

  const [view, setView] = useState('list');
  const [category, setCategory] = useState('question');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [replyAttachments, setReplyAttachments] = useState([]);
  const [attachErr, setAttachErr] = useState('');
  const fileRef = useRef(null);
  const replyFileRef = useRef(null);
  const threadRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setView('list');
    clearTicket();
    loadTickets().catch((e) => {
      setError(e?.message || 'Не удалось загрузить обращения');
    });
  }, [open, clearTicket, loadTickets, setError]);

  useEffect(() => {
    if (detail && threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [detail]);

  const pickFiles = async (fileList, existing, setter) => {
    setAttachErr('');
    try {
      const added = await processAttachmentFiles(fileList, existing.length);
      const merged = [...existing, ...added].slice(0, maxAttachments);
      setter(merged);
    } catch (e) {
      setAttachErr(e.message);
    }
  };

  const submitNew = async () => {
    const subj = subject.trim();
    const text = body.trim();
    if (!subj || !text) {
      setAttachErr('Укажите тему и текст обращения');
      return;
    }
    try {
      const ticket = await createTicket({
        category,
        subject: subj,
        body: text,
        attachments,
      });
      setSubject('');
      setBody('');
      setAttachments([]);
      setView('thread');
      await loadTicket(ticket.id);
    } catch {
      /* error in hook */
    }
  };

  const submitReply = async () => {
    if (!detail?.id) return;
    const text = reply.trim();
    if (!text && !replyAttachments.length) {
      setAttachErr('Введите сообщение или прикрепите файл');
      return;
    }
    try {
      await sendMessage(detail.id, {
        body: text || '—',
        attachments: replyAttachments,
      });
      setReply('');
      setReplyAttachments([]);
    } catch {
      /* hook */
    }
  };

  const keyboardPad = useVisualViewportPadding(open);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-black/55"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="w-full sm:max-w-2xl h-full sm:h-[min(86vh,660px)] flex flex-col bg-[var(--nx-surface-strong)] border border-[var(--nx-border-strong)] sm:rounded-3xl shadow-2xl overflow-hidden"
          style={{ paddingBottom: keyboardPad ? `${keyboardPad}px` : undefined }}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-[var(--nx-border)]">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-400/10 text-teal-300"><LifeBuoy size={18} /></span>
              <div><h2 className="font-semibold text-base">Поддержка</h2><p className="hidden sm:block text-[10px] text-[var(--nx-muted)]">Ответы и история обращений</p></div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-teal-400/10 px-3 text-xs font-semibold text-teal-200 hover:bg-teal-400/15"
                onClick={() => {
                  const next = view === 'new' ? 'list' : 'new';
                  setView(next);
                  if (next === 'list') clearTicket();
                  setError('');
                }}
              >
                {view === 'new' ? 'Мои обращения' : <><Plus size={14} /> Новое</>}
              </button>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-white/5 text-[var(--nx-muted)]"
                onClick={() => loadTickets()}
                title="Обновить"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
              <button type="button" className="p-2 rounded-lg hover:bg-white/5" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5">
            {(error || attachErr) && (
              <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-200 mb-4">{error || attachErr}</p>
            )}

            {view === 'new' && (
              <div className="space-y-4 max-w-xl mx-auto">
                <label className="block text-sm text-[var(--nx-muted)]">
                  Тип
                  <select
                    className="mt-1 w-full rounded-xl px-3 py-2 bg-[var(--nx-surface)] border border-[var(--nx-border)]"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-[var(--nx-muted)]">
                  Тема
                  <input
                    className="mt-1 w-full rounded-xl px-3 py-2 bg-[var(--nx-surface)] border border-[var(--nx-border)]"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={200}
                    placeholder="Кратко о проблеме"
                  />
                </label>
                <label className="block text-sm text-[var(--nx-muted)]">
                  Сообщение
                  <textarea
                    className="mt-1 w-full rounded-xl px-3 py-2 min-h-[120px] bg-[var(--nx-surface)] border border-[var(--nx-border)]"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Опишите ситуацию…"
                  />
                </label>
                <AttachmentBar attachments={attachments} onRemove={(id) => setAttachments((a) => a.filter((x) => x.id !== id))} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-sm text-[var(--nx-muted)] hover:text-teal-400"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Paperclip size={16} />
                    Фото / файл
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/jpeg,image/png,image/webp,image/gif,.txt,.md,.json,.js,.ts,.jsx,.tsx,.py,.css,.html,.xml,.yaml,.yml,.csv,.log"
                    onChange={(e) => pickFiles(e.target.files, attachments, setAttachments)}
                  />
                </div>
                <button
                  type="button"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-500 text-[#042f2e] font-medium disabled:opacity-50"
                  onClick={() => {
                    if (onNeedAuth) {
                      onNeedAuth();
                      return;
                    }
                    submitNew();
                  }}
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={16} />}
                  Отправить
                </button>
              </div>
            )}

            {view === 'list' && !detail && (
              <div className="space-y-2">
                {loading && tickets.length === 0 ? (
                  <div className="space-y-2" aria-label="Загрузка обращений">
                    {[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl border border-[var(--nx-border)] bg-white/[0.03]" />)}
                  </div>
                ) : null}
                {tickets.length === 0 && !loading && (
                  <div className="flex min-h-[360px] flex-col items-center justify-center px-4 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-teal-400/20 bg-teal-400/10 text-teal-300"><MessageCircleQuestion size={25} /></span>
                    <h3 className="mt-4 text-base font-semibold text-[var(--nx-text)]">Чем можем помочь?</h3>
                    <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--nx-muted)]">Опишите вопрос или ошибку. Можно приложить скриншот, файл и продолжить переписку здесь.</p>
                    <button type="button" onClick={() => setView('new')} className="nx-btn nx-btn--primary mt-5"><Plus size={16} /> Создать обращение</button>
                  </div>
                )}
                {tickets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="w-full text-left rounded-xl px-3 py-3 border border-[var(--nx-border)] hover:border-teal-500/40 bg-[var(--nx-surface)]/50"
                    onClick={() => {
                      setView('thread');
                      loadTicket(t.id);
                    }}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-medium truncate">{t.subject}</span>
                      <span className={`text-xs shrink-0 ${statusClass(t.status)}`}>
                        {STATUS_LABEL[t.status] || t.status}
                      </span>
                    </div>
                    {t.last_preview && (
                      <p className="text-xs text-[var(--nx-muted)] mt-1 line-clamp-2">{t.last_preview}</p>
                    )}
                    <p className="text-[10px] text-[var(--nx-muted)] mt-1">
                      {t.updated_at
                        ? new Date(t.updated_at).toLocaleString('ru-RU')
                        : ''}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {view === 'thread' && detail && (
              <div className="flex flex-col min-h-[320px]">
                <button
                  type="button"
                  className="text-xs text-teal-400 hover:underline mb-2 self-start"
                  onClick={() => {
                    setView('list');
                    clearTicket();
                    loadTickets();
                  }}
                >
                  ← К списку
                </button>
                <h3 className="font-medium mb-1">{detail.subject}</h3>
                <p className={`text-xs mb-3 ${statusClass(detail.status)}`}>
                  {STATUS_LABEL[detail.status] || detail.status}
                  {detail.status === 'closed' ? ' · новые сообщения недоступны' : ''}
                </p>
                <div ref={threadRef} className="flex-1 flex flex-col gap-2 overflow-y-auto max-h-[360px] mb-3">
                  {(detail.messages || []).map((m) => (
                    <SupportMessage key={m.id} message={m} />
                  ))}
                </div>
                {detail.status !== 'closed' && (
                  <>
                    <AttachmentBar
                      attachments={replyAttachments}
                      onRemove={(id) => setReplyAttachments((a) => a.filter((x) => x.id !== id))}
                    />
                    <textarea
                      className="w-full rounded-xl px-3 py-2 min-h-[72px] bg-[var(--nx-surface)] border border-[var(--nx-border)] text-sm"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Дополнительное сообщение…"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-sm text-[var(--nx-muted)]"
                        onClick={() => replyFileRef.current?.click()}
                      >
                        <Paperclip size={16} />
                        Вложение
                      </button>
                      <input
                        ref={replyFileRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) =>
                          pickFiles(e.target.files, replyAttachments, setReplyAttachments)
                        }
                      />
                      <button
                        type="button"
                        disabled={loading}
                        className="ml-auto flex items-center gap-1 px-4 py-2 rounded-xl bg-teal-500 text-[#042f2e] text-sm font-medium disabled:opacity-50"
                        onClick={submitReply}
                      >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={14} />}
                        Отправить
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
