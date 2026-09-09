import { useEffect, useState } from 'react';

const MD = 768;
const SM = 640;

function readWidth() {
  if (typeof window === 'undefined') return 1024;
  return window.innerWidth;
}

export function useBreakpoint() {
  const [width, setWidth] = useState(readWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    const mqMd = window.matchMedia(`(max-width: ${MD - 1}px)`);
    const mqSm = window.matchMedia(`(max-width: ${SM - 1}px)`);
    const onMq = () => onResize();
    mqMd.addEventListener('change', onMq);
    mqSm.addEventListener('change', onMq);
    return () => {
      window.removeEventListener('resize', onResize);
      mqMd.removeEventListener('change', onMq);
      mqSm.removeEventListener('change', onMq);
    };
  }, []);

  return {
    width,
    isMobile: width < MD,
    isNarrow: width < SM,
    isDesktop: width >= MD,
  };
}
