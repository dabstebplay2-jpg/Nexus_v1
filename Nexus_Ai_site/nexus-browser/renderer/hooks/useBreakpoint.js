import { useEffect, useState } from 'react';

export function useBreakpoint() {
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const compact = width < 768;
  const medium = width >= 768 && width < 1024;
  const wide = width >= 1024;
  const drawerSidebar = width < 1024;

  return { width, compact, medium, wide, drawerSidebar };
}
