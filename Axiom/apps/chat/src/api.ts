import type { ChatEvent } from '@axiom/shared';
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Axiom-Client': 'chat' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Нет связи с Axiom. Убедитесь, что сервер запущен.');
  }
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'Не удалось выполнить запрос.');
  return data;
}
export async function stream(
  path: string,
  body: unknown,
  signal: AbortSignal,
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Axiom-Client': 'chat' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const error = (await response.json()) as { error: string };
    throw new Error(error.error);
  }
  if (!response.body) throw new Error('Сервер вернул пустой ответ.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let index: number;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (line.trim()) {
          const event = JSON.parse(line) as ChatEvent;
          completed ||= event.type === 'done';
          onEvent(event);
        }
      }
      if (done) break;
    }
    if (!completed)
      throw new Error(
        'Соединение прервано. Обновите диалог, чтобы восстановить сохранённый ответ.',
      );
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
