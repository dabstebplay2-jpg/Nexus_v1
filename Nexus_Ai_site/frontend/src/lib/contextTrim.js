/** Обрезка истории для API — без перегруза контекста (пространства). */
const DEFAULT_MAX_MESSAGES = 24;

export function trimMessagesForContext(messages, maxMessages = DEFAULT_MAX_MESSAGES) {
  if (!messages?.length) return [];
  const clean = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content || '' }));
  if (clean.length <= maxMessages) return clean;
  const dropped = clean.length - maxMessages;
  const trimmed = clean.slice(-maxMessages);
  return [
    {
      role: 'system',
      content: `[Контекст сокращён: скрыто ${dropped} более ранних сообщений. Ответь с учётом последних реплик.]`,
    },
    ...trimmed,
  ];
}
