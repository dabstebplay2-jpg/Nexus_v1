/** Батчит patchConv через requestAnimationFrame (~30fps). */
export function createRafPatcher(patchConv, convId) {
  let rafId = 0;
  let pendingUpdater = null;

  const schedule = (updater) => {
    if (typeof updater !== 'function') return;
    // Захватываем prev в замыкании — нельзя читать pendingUpdater внутри fn после RAF (там null).
    const prev = pendingUpdater;
    pendingUpdater = prev ? (c) => updater(prev(c)) : updater;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      const fn = pendingUpdater;
      pendingUpdater = null;
      if (typeof fn !== 'function') return;
      patchConv(convId, fn);
    });
  };

  const flush = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (pendingUpdater) {
      const fn = pendingUpdater;
      pendingUpdater = null;
      if (typeof fn !== 'function') return;
      patchConv(convId, fn);
    }
  };

  return { schedule, flush };
}
