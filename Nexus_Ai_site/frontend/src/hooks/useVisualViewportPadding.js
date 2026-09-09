import { useEffect, useState } from 'react';

/** Extra bottom padding when the on-screen keyboard is open (iOS/Android). */
export function useVisualViewportPadding(enabled = true) {
  const [paddingBottom, setPaddingBottom] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.visualViewport) return undefined;

    const vv = window.visualViewport;
    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setPaddingBottom(offset > 50 ? offset : 0);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return paddingBottom;
}
