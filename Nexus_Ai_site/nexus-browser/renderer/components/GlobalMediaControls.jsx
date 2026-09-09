import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, SkipBack, SkipForward, Music2 } from 'lucide-react';

export default function GlobalMediaControls({ onActivateTab }) {
  const [session, setSession] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    window.nexusBrowser.media?.getActive?.().then(setSession);
    const unsub = window.nexusBrowser.media?.onActiveSession?.((data) => setSession(data));
    return () => unsub?.();
  }, []);

  if (!session || (session.playbackState === 'none' && !session.audible)) return null;

  const run = (action) => {
    window.nexusBrowser.media.action(session.tabId, action);
  };

  return (
    <div className="global-media-controls">
      <button
        type="button"
        className="global-media-toggle btn btn-sm btn-icon"
        onClick={() => setExpanded((v) => !v)}
        title={session.title || 'Медиа'}
      >
        {session.artwork ? (
          <img src={session.artwork} alt="" className="global-media-art" />
        ) : (
          <Music2 size={14} />
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="global-media-panel glass-panel"
            initial={reducedMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
          >
            <button
              type="button"
              className="global-media-meta"
              onClick={() => onActivateTab?.(session.tabId)}
            >
              {session.artwork && <img src={session.artwork} alt="" className="global-media-cover" />}
              <span className="global-media-text">
                <strong>{session.title || 'Воспроизведение'}</strong>
                {session.artist && <span className="muted">{session.artist}</span>}
              </span>
            </button>
            <div className="global-media-actions">
              <button type="button" className="btn btn-sm btn-icon" onClick={() => run('previous')} title="Назад">
                <SkipBack size={14} />
              </button>
              <button
                type="button"
                className="btn btn-sm btn-icon"
                onClick={() => run(session.playbackState === 'playing' ? 'pause' : 'play')}
                title={session.playbackState === 'playing' ? 'Пауза' : 'Воспроизведение'}
              >
                {session.playbackState === 'playing' ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button type="button" className="btn btn-sm btn-icon" onClick={() => run('next')} title="Далее">
                <SkipForward size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
