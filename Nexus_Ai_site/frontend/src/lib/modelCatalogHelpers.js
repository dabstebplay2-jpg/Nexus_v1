import { findModelByAnyId } from './modelSelection';

/** Подпись для заблокированной модели (тариф). */
export function modelLockHint(m) {
  if (!m) return 'Недоступно на вашем тарифе';
  return (
    m.lock_message ||
    (m.required_tier_label
      ? `Нужна подписка ${m.required_tier_label}`
      : m.required_tier
        ? `Нужен тариф ${m.required_tier}`
        : 'Недоступно на вашем тарифе')
  );
}

/** Сначала доступные модели, затем с замком. */
export function sortModelsUnlockedFirst(models) {
  return [...(models || [])].sort((a, b) => {
    const lockA = a.locked ? 1 : 0;
    const lockB = b.locked ? 1 : 0;
    if (lockA !== lockB) return lockA - lockB;
    return (a.display_name || a.name || a.id || '').localeCompare(
      b.display_name || b.name || b.id || '',
      'ru',
      { sensitivity: 'base' }
    );
  });
}

export function pickDefaultMediaModel(models, preferredId) {
  if (!models?.length) return '';
  const unlocked = models.filter((m) => !m.locked);
  if (!unlocked.length) return '';
  if (preferredId) {
    const pref = findModelByAnyId(unlocked, preferredId);
    if (pref) return pref.id;
  }
  const byNewest = [...unlocked].sort((a, b) => (b.created || 0) - (a.created || 0));
  return byNewest[0]?.id || unlocked[0]?.id || '';
}
