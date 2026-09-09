import { useCallback, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { brandAssetCandidates } from '../../config/brandAssets';

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
      <span className={`inline-flex items-center justify-center ${className}`}>
        <img
          src={src}
          alt={alt}
          className={`object-contain object-left ${imgClassName || 'max-h-full max-w-full'}`}
          onError={onError}
          decoding="async"
        />
      </span>
    );
  }

  if (fallback === 'none') return null;

  if (fallback === 'text') {
    return (
      <span
        className={`inline-flex items-center justify-center font-black text-white ${className}`}
      >
        {fallbackText}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-800 text-white ${className}`}
    >
      <Sparkles size={18} className="shrink-0" />
    </span>
  );
}
