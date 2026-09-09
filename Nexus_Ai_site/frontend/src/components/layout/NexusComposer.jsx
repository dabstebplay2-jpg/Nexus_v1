import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  MessageCircle,
  ArrowUp,
  Square,
  FolderOpen,
  ChevronDown,
  Image as ImageIcon,
  FileUp,
  LifeBuoy,
  Microscope,
  Info,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import ModelPicker from '../chat/ModelPicker';
import AttachmentBar from '../chat/AttachmentBar';
import WebSearchDepthPicker from '../chat/WebSearchDepthPicker';
import { useVisualViewportPadding } from '../../hooks/useVisualViewportPadding';

const WEB_SEARCH_HINT =
  'Nexus сам решит, нужен ли поиск, генератор изображения или подключённый сервис. Обычные вопросы отвечаются без лишних вызовов.';

export default function NexusComposer({
  value,
  onChange,
  onSend,
  onStop,
  loading = false,
  disabled = false,
  mode = 'chat',
  onModeChange,
  models = [],
  mediaModels = [],
  selectedModel,
  onModelChange,
  unlockAll = false,
  guest = false,
  onGuestRegister,
  modelVariant = 'chat',
  placeholder,
  centered = false,
  showAttachMenu = true,
  attachments = [],
  onAttachmentsChange,
  onPickFiles,
  selectedModelMeta = null,
  visionGuide = null,
  onOpenSupport,
  webSearch = false,
  onWebSearchChange,
  webSearchHighlight = false,
}) {
  const [attachOpen, setAttachOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const keyboardPad = useVisualViewportPadding();
  const attachRef = useRef(null);
  const inputRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (attachRef.current && !attachRef.current.contains(e.target)) setAttachOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const submit = () => {
    const canSend = value.trim() || attachments.length > 0;
    if (!loading && canSend && !disabled) onSend?.();
  };

  const isMedia =
    selectedModelMeta?.category === 'media' || selectedModelMeta?.vision_tier === 'image_gen';

  const webSearchActive = mode === 'chat' && webSearch;

  const defaultPlaceholder =
    mode === 'research'
      ? 'Глубокое исследование: подробный отчёт с источниками…'
      : webSearchActive
        ? 'Задайте вопрос — Nexus сам выберет нужный инструмент…'
        : isMedia
          ? 'Опишите картинку, которую нужно сгенерировать…'
          : 'Задайте любой вопрос…';

  return (
    <motion.div
      layout
      className={`w-full max-w-[var(--nx-content-max)] mx-auto ${centered ? 'px-0' : 'px-4 sm:px-6'}`}
      style={{
        paddingBottom: centered
          ? `max(0.5rem, calc(env(safe-area-inset-bottom) + ${keyboardPad}px))`
          : `max(1.25rem, calc(env(safe-area-inset-bottom) + ${keyboardPad}px))`,
      }}
    >
      <div
        className={`nx-composer rounded-3xl overflow-x-clip overflow-y-visible ${
          loading ? 'nx-composer--loading' : ''
        }`}
      >
        <div className="nx-composer-inner overflow-hidden rounded-3xl">
          <AttachmentBar
            attachments={attachments}
            onRemove={(id) =>
              onAttachmentsChange?.(attachments.filter((a) => a.id !== id))
            }
          />
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={centered ? 3 : 2}
            disabled={disabled}
            placeholder={placeholder || defaultPlaceholder}
            className="w-full resize-none bg-transparent px-4 pt-4 pb-3 md:px-6 md:pt-5 text-[var(--nx-text)] placeholder:text-[var(--nx-muted)] outline-none min-h-[64px] md:min-h-[72px]"
          />
        </div>

        <div
          className={`relative z-[50] flex flex-col gap-2 px-4 w-full min-w-0 ${
            webSearchActive ? 'pb-3.5 pt-1' : 'pb-4 pt-1'
          }`}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-wrap w-full sm:w-auto">
              {showAttachMenu && (
                <div ref={attachRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setAttachOpen((o) => !o)}
                    className="p-2 md:p-3 min-h-[44px] min-w-[44px] md:min-h-[52px] md:min-w-[52px] flex items-center justify-center rounded-2xl hover:bg-[var(--nx-surface-hover)] text-[var(--nx-muted)]"
                    title="Вложения"
                  >
                    <Plus size={22} />
                  </button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      onPickFiles?.(e.target.files, 'image');
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.json,.csv,.log,.xml,.yaml,.yml,.html,.css,.js,.ts,.tsx,.jsx,.py,.sql,text/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      onPickFiles?.(e.target.files, 'file');
                      e.target.value = '';
                    }}
                  />
                  <AnimatePresence>
                  {attachOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.98 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute left-0 bottom-full mb-2 w-64 nx-glass rounded-xl py-1 shadow-xl z-[100] nx-menu-pop"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setAttachOpen(false);
                          imageInputRef.current?.click();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--nx-surface-hover)]"
                      >
                        <ImageIcon size={18} />
                        Фото
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachOpen(false);
                          fileInputRef.current?.click();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--nx-surface-hover)]"
                      >
                        <FileUp size={18} />
                        Текстовый файл
                      </button>
                      <Link
                        to="/spaces"
                        onClick={() => setAttachOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--nx-surface-hover)]"
                      >
                        <FolderOpen size={18} />
                        Пространства
                      </Link>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </div>
              )}

              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setSearchOpen((o) => !o)}
                  aria-label={mode === 'research' ? 'Режим: глубокое исследование' : 'Режим: обычный чат'}
                  aria-expanded={searchOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-3 min-h-[44px] md:min-h-[52px] rounded-full bg-[var(--nx-surface-hover)] text-sm md:text-base font-medium"
                >
                  {mode === 'research' ? (
                    <>
                      <Microscope size={20} />
                      <span className="hidden sm:inline">Глубокое исследование</span>
                      <span className="sm:hidden">Research</span>
                    </>
                  ) : (
                    <>
                      <MessageCircle size={20} />
                      <span className="hidden sm:inline">Чат</span>
                    </>
                  )}
                  <ChevronDown size={18} className={searchOpen ? 'rotate-180' : ''} />
                </button>
                <AnimatePresence>
                {searchOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute left-0 bottom-full mb-2 w-48 nx-glass rounded-xl py-1 shadow-xl z-[100] nx-menu-pop"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onModeChange?.('chat');
                        setSearchOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[var(--nx-surface-hover)] ${
                        mode === 'chat' ? 'text-teal-400' : ''
                      }`}
                    >
                      <MessageCircle size={16} /> Обычный чат
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onModeChange?.('research');
                        setSearchOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[var(--nx-surface-hover)] ${
                        mode === 'research' ? 'text-teal-400' : ''
                      }`}
                    >
                      <Search size={16} /> Глубокое исследование
                    </button>
                    <p className="px-4 py-2 text-[11px] text-[var(--nx-muted)] border-t border-[var(--nx-border)] leading-snug">
                      Много источников и развёрнутый отчёт. Быстрый поиск — кнопка «Поиск в сети» в
                      режиме чата.
                    </p>
                  </motion.div>
                )}
                </AnimatePresence>
              </div>

              {mode === 'chat' && (
                <WebSearchDepthPicker
                  enabled={webSearch}
                  disabled={disabled || loading}
                  onEnabledChange={onWebSearchChange}
                  highlight={webSearchHighlight}
                />
              )}
            </div>

            <div className="flex items-center flex-wrap gap-1.5 md:gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
              {onOpenSupport && (
                <button
                  type="button"
                  onClick={onOpenSupport}
                  className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border border-[var(--nx-border)] text-[var(--nx-muted)] hover:text-teal-400 hover:border-teal-500/40 shrink-0"
                  title="Поддержка"
                >
                  <LifeBuoy size={18} />
                </button>
              )}
              <ModelPicker
                models={models}
                mediaModels={mediaModels}
                value={selectedModel}
                onChange={onModelChange}
                variant={modelVariant}
                disabled={disabled && !guest}
                guest={guest}
                onGuestRegister={onGuestRegister}
                compact
                dropUp
                unlockAll={unlockAll}
                visionGuide={visionGuide}
                className="shrink min-w-0 max-w-[min(10rem,38vw)] sm:max-w-[14rem]"
              />
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={loading ? onStop : submit}
                disabled={
                  loading
                    ? !onStop
                    : (!value.trim() && !attachments.length) || disabled
                }
                title={loading ? 'Остановить' : 'Отправить'}
                aria-label={loading ? 'Остановить генерацию' : 'Отправить'}
                className={`nx-send-btn ${
                  loading ? 'nx-send-btn--stop' : 'nx-send-btn--send'
                }`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {loading ? (
                    <motion.span
                      key="stop"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center justify-center"
                    >
                      <Square size={20} fill="currentColor" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="send"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center justify-center"
                    >
                      <ArrowUp size={22} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>

          {webSearchActive && (
            <p className="flex items-start gap-1.5 text-[10px] sm:text-[11px] text-[var(--nx-muted)] leading-snug w-full px-0.5">
              <Info size={12} className="shrink-0 mt-0.5 opacity-70" />
              <span>{WEB_SEARCH_HINT}</span>
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
