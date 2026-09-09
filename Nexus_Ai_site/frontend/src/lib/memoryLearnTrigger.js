/** Совпадает с триггерами на сервере (memory_auto_learn.py). */
const LEARN_TRIGGER =
  /(?:запомни|не\s+забудь|сохрани\s+в\s+память|remember|don'?t\s+forget|save\s+to\s+memory)/i;

const FORGET_TRIGGER =
  /(?:удали\s+(?:из\s+)?памят|убери\s+(?:из\s+)?памят|больше\s+не\s+помни|не\s+помни\s+(?:что|про)|забыть\s+про|очисти\s+память|сотри\s+память|\bзабудь\b|\bforget\b|remove\s+from\s+memory|delete\s+from\s+memory|stop\s+remembering)/i;

function isForgetRequest(text) {
  const t = String(text);
  if (/не\s+забудь/i.test(t)) return false;
  return FORGET_TRIGGER.test(t);
}

export function hasMemoryLearnTrigger(text) {
  if (!text) return false;
  if (isForgetRequest(text)) return false;
  return LEARN_TRIGGER.test(String(text));
}

export function hasMemoryForgetTrigger(text) {
  return Boolean(text && isForgetRequest(text));
}

export function hasMemoryUpdateTrigger(text) {
  return hasMemoryLearnTrigger(text) || hasMemoryForgetTrigger(text);
}
