import { useCallback, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { brandAssetCandidates } from '../config/brandAssets';

/**
 * @param {{
 *   variant?: 'icon' | 'full' | 'wordmark';
 *   className?: string;
 *   imgClassName?: string;
 *   alt?: string;
 *   fallback?: 'icon' | 'text' | 'none';
 *   fallbackText?: string;
 * }} props
 */
export default function BrandLogo({
  variant = 'icon',
  className = '',
  imgClassName = '',
  alt = 'Nexus',
  fallback = 'icon',
  fallbackText = 'NX',
}) {
  const candidates = useMemo(() => brandAssetCandidates(variant), [variant]);
  const [index, setIndex] = useState(0);
  const src = index < candidates.length ? candidates[index] : null;

  const onError = useCallback(() => {
    setIndex((i) => i + 1);
  }, []);

  if (src) {
    return (
      <span className={`brand-logo ${className}`.trim()}>
        <img
          src={src}
          alt={alt}
          className={`brand-logo__img ${imgClassName}`.trim()}
          onError={onError}
          decoding="async"
          draggable={false}
        />
      </span>
    );
  }

  if (fallback === 'none') return null;

  if (fallback === 'text') {
    return (
      <span className={`brand-logo brand-logo--text ${className}`.trim()}>
        {fallbackText}
      </span>
    );
  }

  return (
    <span className={`brand-logo brand-logo--fallback ${className}`.trim()}>
      <Sparkles size={18} className="shrink-0" />
    </span>
  );
}
