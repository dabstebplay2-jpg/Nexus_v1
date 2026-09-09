import { motion } from 'framer-motion';

/**
 * Плейсхолдер генерации изображения в стиле Nexus: glass, teal glow, сетка точек.
 */
export default function ImageGeneratingPlaceholder({ className = '', label = true }) {
  return (
    <div className={`image-gen-placeholder-wrap ${className}`.trim()}>
      <div
        className="image-gen-placeholder"
        role="status"
        aria-label="Генерация изображения"
        aria-busy="true"
      >
        <div className="image-gen-placeholder__base" aria-hidden />
        <div className="image-gen-placeholder__mesh" aria-hidden />
        <div className="image-gen-placeholder__glow" aria-hidden>
          <motion.div
            className="image-gen-placeholder__orb image-gen-placeholder__orb--a"
            animate={{
              x: [0, 18, -12, 0],
              y: [0, -14, 10, 0],
              scale: [1, 1.12, 0.92, 1],
            }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="image-gen-placeholder__orb image-gen-placeholder__orb--b"
            animate={{
              x: [0, -20, 14, 0],
              y: [0, 16, -8, 0],
              scale: [1, 0.9, 1.08, 1],
            }}
            transition={{ duration: 6.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
          />
        </div>
        <div className="image-gen-placeholder__dots" aria-hidden />
        <div className="image-gen-placeholder__shimmer" aria-hidden />
        <div className="image-gen-placeholder__vignette" aria-hidden />
      </div>
      {label ? (
        <p className="image-gen-placeholder__label" aria-hidden>
          Создаю изображение…
        </p>
      ) : null}
    </div>
  );
}
