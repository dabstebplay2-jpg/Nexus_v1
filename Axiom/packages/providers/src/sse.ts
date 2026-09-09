import { AxiomError } from '@axiom/shared';
/** Incremental SSE parser: handles UTF-8, CRLF, comments and multi-line data. */
export async function* readSSE(
  body: ReadableStream<Uint8Array>,
  onActivity: () => void = () => {},
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lines: string[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value?.length) onActivity();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 2_000_000)
        throw new AxiomError('Слишком большой фрагмент ответа провайдера.');
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (!line) {
          if (lines.length) yield lines.join('\n');
          lines = [];
        } else if (line.startsWith('data:')) lines.push(line.slice(5).replace(/^ /, ''));
      }
      if (done) break;
    }
    if (buffer.startsWith('data:')) lines.push(buffer.slice(5).trimStart());
    if (lines.length) yield lines.join('\n');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
