import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Star, Image, Lock, Brain, Camera, CameraOff, Sparkles, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  groupModelsByProvider,
  groupModelsBySegment,
  findModelById,
  formatModelShortName,
} from '../../lib/chatApi';
import {
  getFavoriteModelIds,
  toggleFavoriteModel,
  isFavoriteModel,
} from '../../lib/modelFavorites';
import {
  resolveModelId,
  getModelLabel,
  loadThinkingPrefs,
  saveThinkingPref,
  isThinkingEnabled,
  findModelByAnyId,
} from '../../lib/modelSelection';
import { modelSupportsToolCalling } from '../../lib/modelToolCalling';

export default function ModelPicker({
  models = [],
  mediaModels = [],
  value,
  onChange,
  disabled = false,
  guest = false,
  onGuestRegister,
  className = '',
  variant = 'chat',
  compact = false,
  dropUp = false,
  unlockAll = false,
  visionGuide = null,
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('chat');
  const [guideOpen, setGuideOpen] = useState(false);
  const [favorites, setFavorites] = useState(() => {
    const ids = getFavoriteModelIds();
    return Array.isArray(ids) ? ids : [];
  });
  const [thinkingPrefs, setThinkingPrefs] = useState(() => loadThinkingPrefs());
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const syncFav = () => {
      const ids = getFavoriteModelIds();
      setFavorites(Array.isArray(ids) ? ids : []);
    };
    const syncThink = () => setThinkingPrefs(loadThinkingPrefs());
    const openPicker = () => setOpen(true);
    window.addEventListener('nexus-favorites-changed', syncFav);
    window.addEventListener('nexus-thinking-changed', syncThink);
    window.addEventListener('nexus-open-model-picker', openPicker);
    return () => {
      window.removeEventListener('nexus-favorites-changed', syncFav);
      window.removeEventListener('nexus-thinking-changed', syncThink);
      window.removeEventListener('nexus-open-model-picker', openPicker);
    };
  }, []);

  const pool = useMemo(() => {
    const list = tab === 'media' ? mediaModels : models;
    return Array.isArray(list) ? list : [];
  }, [tab, mediaModels, models]);
  const safeFavorites = Array.isArray(favorites) ? favorites : [];
  const favoriteModels = useMemo(
    () => safeFavorites.map((id) => findModelById(pool, id)).filter(Boolean),
    [safeFavorites, pool]
  );
  const latestModels = useMemo(
    () =>
      [...pool]
        .filter((model) => model.is_latest)
        .sort((a, b) => (b.created || 0) - (a.created || 0))
        .slice(0, 12),
    [pool]
  );
  const segmentGroups = useMemo(() => groupModelsBySegment(pool), [pool]);
  const providerGroups = useMemo(() => groupModelsByProvider(pool), [pool]);

  const allModels = [...models, ...mediaModels];
  const selected = findModelByAnyId(allModels, value);
  const selectedThinking = selected ? isThinkingEnabled(selected, thinkingPrefs) : false;
  const label = compact
    ? getModelLabel(selected, selectedThinking) || formatModelShortName(selected, selectedThinking) || 'Модель'
    : selected
      ? getModelLabel(selected, selectedThinking)
      : 'Выберите модель';

  const updatePosition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(360, window.innerWidth - margin * 2);
    // Всегда якорим по left: при dropUp + right кнопка в левой панели уводила меню за экран.
    let left = r.left;
    if (left + width > window.innerWidth - margin) {
      left = window.innerWidth - width - margin;
    }
    left = Math.max(margin, left);

    if (dropUp) {
      setMenuStyle({
        position: 'fixed',
        left,
        bottom: window.innerHeight - r.top + 8,
        width,
        zIndex: 10000,
      });
    } else {
      setMenuStyle({
        position: 'fixed',
        left,
        top: r.bottom + 8,
        width: Math.max(width, Math.min(r.width, window.innerWidth - margin * 2)),
        zIndex: 10000,
      });
    }
  }, [dropUp]);

  useEffect(() => {
    if (!open || !value) return;
    if (findModelByAnyId(mediaModels, value)) setTab('media');
    else if (variant === 'research' && findModelByAnyId(models, value)) setTab('chat');
    else if (findModelByAnyId(models, value)) setTab('chat');
  }, [open, value, mediaModels, models, variant]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      const t = e.target;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isUnlocked = (m) => unlockAll || !m.locked;

  const pickModel = (m, thinking) => {
    if (!isUnlocked(m)) return;
    const id = resolveModelId(m, thinking);
    if (m.family_id) saveThinkingPref(m.family_id, thinking);
    setThinkingPrefs(loadThinkingPrefs());
    onChange(id);
    setOpen(false);
  };

  const toggleThinking = (m, e) => {
    e.stopPropagation();
    const next = !isThinkingEnabled(m, thinkingPrefs);
    saveThinkingPref(m.family_id, next);
    setThinkingPrefs(loadThinkingPrefs());
    const selectedFam = selected?.family_id === m.family_id;
    if (selectedFam || value === m.model_id_standard || value === m.model_id_thinking) {
      onChange(resolveModelId(m, next));
    }
  };

  const lockHint = (m) =>
    m.lock_message ||
    (m.required_tier_label
      ? `Нужна подписка ${m.required_tier_label}`
      : m.required_tier
        ? `Нужен тариф ${m.required_tier}`
        : 'Недоступно на вашем тарифе');

  const visionBadge = (m) => {
    const tier = m.vision_tier;
    if (tier === 'image_gen' || m.category === 'media') {
      return (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300" title="Генерация изображений">
          Генерация
        </span>
      );
    }
    if (tier === 'excellent' || tier === 'good') {
      return (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300" title={m.vision_note || 'Принимает фото'}>
          <Camera size={10} className="inline mr-0.5" />
          Фото
        </span>
      );
    }
    if (tier === 'none' || (!m.supports_vision && !m.multimodal)) {
      return (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-600/30 text-zinc-500" title="Не принимает изображения">
          <CameraOff size={10} className="inline mr-0.5" />
          Текст
        </span>
      );
    }
    return null;
  };

  const renderModelRow = (m) => {
    const rowKey = m.family_id || m.id;
    const thinkingOn = isThinkingEnabled(m, thinkingPrefs);
    const resolvedId = resolveModelId(m, thinkingOn);
    const isOn = !m.locked && (value === resolvedId || value === m.model_id_standard || value === m.model_id_thinking);
    const fav = isFavoriteModel(m.model_id_standard || m.id);
    const displayName = m.display_name || m.name;
    const locked = !isUnlocked(m);

    return (
      <li key={rowKey}>
        <div
          className={`flex flex-col w-full px-2 py-1.5 rounded-lg ${
            locked
              ? 'opacity-55 cursor-not-allowed'
              : isOn
                ? 'bg-cyan-500/20 ring-1 ring-cyan-500/30'
                : 'hover:bg-white/10'
          }`}
        >
          <div className="flex items-start gap-1">
            <button
              type="button"
              disabled={locked}
              onClick={(e) => {
                e.stopPropagation();
                if (!locked) toggleFavoriteModel(m.model_id_standard || m.id);
              }}
              className={`p-1 shrink-0 ${
                locked
                  ? 'text-zinc-700 cursor-not-allowed'
                  : fav
                    ? 'text-amber-400'
                    : 'text-zinc-600 hover:text-amber-400'
              }`}
            >
              <Star size={14} fill={fav && !locked ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              role="option"
              aria-disabled={locked}
              onClick={() => pickModel(m, thinkingOn)}
              className={`flex-1 text-left text-[13px] min-w-0 ${
                locked ? 'text-zinc-500 cursor-not-allowed' : 'text-zinc-200'
              }`}
            >
              <span className="font-medium inline-flex items-center gap-1 flex-wrap">
                {displayName}
                {m.is_latest && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300"
                    title="Недавно добавлена в каталог Polza"
                  >
                    Новинка
                  </span>
                )}
                {!locked && visionBadge(m)}
                {!locked && modelSupportsToolCalling(m) && (
                  <span
                    className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded border border-teal-500/40 text-teal-300/90"
                    title="Поддержка tool calling для коннекторов"
                  >
                    Tools
                  </span>
                )}
                {locked && <Lock size={12} className="text-amber-500/80 shrink-0" />}
              </span>
              {locked && (
                <span className="block text-[10px] text-amber-500/90 mt-0.5 font-medium">
                  {lockHint(m)}
                </span>
              )}
              {!locked && m.usage_hint === 'premium_drain' && (
                <span className="ml-1 text-[10px] text-amber-500/90">· высокий расход</span>
              )}
              {m.research_note && (
                <span className="ml-1 text-[10px] text-violet-400">· {m.research_note}</span>
              )}
              {m.price_hint && (
                <span className="block text-[10px] text-zinc-500 mt-0.5">{m.price_hint}</span>
              )}
            </button>
            {isOn && <Check size={14} className="text-cyan-400 shrink-0 mt-1" />}
          </div>

          {!locked && m.supports_thinking && m.model_id_thinking && (
            <button
              type="button"
              onClick={(e) => toggleThinking(m, e)}
              className={`ml-7 mt-1.5 flex items-center gap-2 text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                thinkingOn
                  ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                  : 'border-white/10 text-zinc-500 hover:border-violet-500/30'
              }`}
            >
              <Brain size={12} className={thinkingOn ? 'text-violet-300' : ''} />
              <span>Режим мышления</span>
              <span className="text-[10px] opacity-70 truncate max-w-[140px]">
                {thinkingOn ? m.thinking_hint || 'Pro / Thinking' : 'обычный'}
              </span>
            </button>
          )}
        </div>
      </li>
    );
  };

  const menuPanel = menuStyle ? (
    <motion.div
      ref={menuRef}
      key="model-picker-menu"
      style={menuStyle}
      initial={{ opacity: 0, y: dropUp ? 8 : -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: dropUp ? 8 : -8, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="nx-model-menu nx-model-menu-anchor rounded-2xl overflow-hidden nx-menu-pop"
    >
      <div className="flex border-b border-white/10 text-[11px]">
        <button
          type="button"
          onClick={() => setTab('chat')}
          className={`flex-1 py-2.5 ${tab === 'chat' ? 'text-cyan-300 bg-white/5' : 'text-zinc-500'}`}
        >
          Текст
        </button>
        {mediaModels.length > 0 && (
          <button
            type="button"
            onClick={() => setTab('media')}
            className={`flex-1 py-2.5 flex items-center justify-center gap-1 ${
              tab === 'media' ? 'text-pink-300 bg-white/5' : 'text-zinc-500'
            }`}
          >
            <Image size={12} /> Медиа
          </button>
        )}
      </div>

      <div className="max-h-[min(400px,60vh)] overflow-y-auto custom-scrollbar p-1.5">
        {pool.length === 0 ? (
          <p className="px-3 py-6 text-sm text-zinc-500 text-center leading-relaxed">
            {guest ? (
              <>
                Чтобы модели работали,{' '}
                {onGuestRegister ? (
                  <button
                    type="button"
                    onClick={() => {
                      onGuestRegister();
                      setOpen(false);
                    }}
                    className="text-teal-400 hover:underline font-medium"
                  >
                    зарегистрируйтесь
                  </button>
                ) : (
                  <span className="text-teal-400 font-medium">зарегистрируйтесь</span>
                )}
                !
              </>
            ) : disabled ? (
              'Войдите, чтобы смотреть каталог моделей'
            ) : (
              'Модели загружаются…'
            )}
          </p>
        ) : (
          <>
            {!unlockAll && pool.some((m) => m.locked) && (
              <p className="px-2 pb-2 text-[10px] text-zinc-500 leading-snug">
                Замок — модель недоступна на вашем тарифе. Облачный чат — с подпиской Hobby и выше.
              </p>
            )}
            {favoriteModels.length > 0 && tab === 'chat' && (
              <div className="mb-2">
                <p className="px-2 py-1 text-[10px] font-bold uppercase text-amber-400/90">Избранное</p>
                <ul>{favoriteModels.map((m) => renderModelRow(m))}</ul>
              </div>
            )}

            {latestModels.length > 0 && tab === 'chat' && (
              <div className="mb-2 border border-violet-500/20 rounded-xl p-1">
                <p className="px-2 py-1 text-[10px] font-bold uppercase text-violet-300/90 flex items-center gap-1">
                  <Sparkles size={11} /> Новинки Polza
                </p>
                <ul>{latestModels.map((m) => renderModelRow(m))}</ul>
              </div>
            )}

            {tab === 'chat' && visionGuide && (
              <div className="mb-2 border border-white/10 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setGuideOpen((o) => !o)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-cyan-300/90 hover:bg-white/5"
                >
                  <Sparkles size={12} />
                  Кто хорошо работает с фотографиями
                  <ChevronRight
                    size={12}
                    className={`ml-auto transition-transform ${guideOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {guideOpen && (
                  <div className="px-3 pb-3 text-[10px] text-zinc-400 space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                    {visionGuide?.excellent?.length > 0 && (
                      <div>
                        <p className="text-emerald-400/90 font-semibold mb-0.5">Отлично с фото</p>
                        <p>{visionGuide.excellent.map((x) => x.display_name).join(', ')}</p>
                      </div>
                    )}
                    {visionGuide?.good?.length > 0 && (
                      <div>
                        <p className="text-cyan-400/90 font-semibold mb-0.5">Подходит</p>
                        <p>{visionGuide.good.map((x) => x.display_name).join(', ')}</p>
                      </div>
                    )}
                    {visionGuide?.text_only?.length > 0 && (
                      <div>
                        <p className="text-zinc-500 font-semibold mb-0.5">Только текст</p>
                        <p>{visionGuide.text_only.slice(0, 8).map((x) => x.display_name).join(', ')}
                          {visionGuide.text_only.length > 8 ? '…' : ''}
                        </p>
                      </div>
                    )}
                    {visionGuide?.image_generation?.length > 0 && (
                      <div>
                        <p className="text-pink-400/90 font-semibold mb-0.5">Генерация (вкладка Медиа)</p>
                        <p>{visionGuide.image_generation.map((x) => x.display_name).join(', ')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'media' ? (
              segmentGroups.map(({ label: segLabel, models: list }) => (
                <div key={segLabel} className="mb-2">
                  <p className="sticky top-0 px-2 py-1 text-[10px] font-bold uppercase text-pink-400/80 bg-[#14141a]/95 backdrop-blur-sm z-10 border-b border-white/5">
                    {segLabel}
                  </p>
                  <ul>{list.map((m) => renderModelRow(m))}</ul>
                </div>
              ))
            ) : variant === 'research' ? (
              providerGroups.map(({ provider, models: list }) => (
                <div key={provider} className="mb-2">
                  <p className="sticky top-0 px-2 py-1 text-[10px] font-bold uppercase text-violet-400/90 bg-[#14141a]/95 backdrop-blur-sm z-10">
                    {provider}
                  </p>
                  <ul>{list.map((m) => renderModelRow(m))}</ul>
                </div>
              ))
            ) : (
              segmentGroups.map(({ label: segLabel, models: list }) => (
                <div key={segLabel} className="mb-2">
                  <p className="sticky top-0 px-2 py-1 text-[10px] font-bold uppercase text-cyan-400/80 bg-[#14141a]/95 backdrop-blur-sm z-10 border-b border-white/5">
                    {segLabel}
                  </p>
                  <ul>{list.map((m) => renderModelRow(m))}</ul>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </motion.div>
  ) : null;

  const btnClass = compact
    ? `w-full flex items-center justify-between gap-2 px-3 md:px-4 py-2 md:py-2.5 min-h-[44px] md:min-h-[52px] rounded-full text-sm md:text-base font-medium hover:bg-[var(--nx-surface-hover)] ${
        disabled ? 'opacity-50' : ''
      } ${open ? 'bg-[var(--nx-surface-hover)]' : ''}`
    : `w-full flex items-center justify-between gap-2 text-left text-xs rounded-lg border px-2.5 py-2 ${
        disabled
          ? 'opacity-50 border-white/10 bg-white/[0.04]'
          : open
            ? 'border-cyan-500/50 bg-[#1c1c24] text-white'
            : 'border-white/15 bg-[#1c1c24] text-zinc-100 hover:border-white/25'
      }`;

  return (
    <div
      ref={rootRef}
      className={`relative z-[60] ${compact ? 'min-w-0' : 'min-w-[140px] max-w-md flex-1'} ${className}`}
    >
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={btnClass}
      >
        <span className="truncate font-medium max-w-[min(200px,45vw)]">{label}</span>
        <ChevronDown size={18} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {typeof document !== 'undefined' &&
        createPortal(<AnimatePresence>{open && menuPanel}</AnimatePresence>, document.body)}
    </div>
  );
}
