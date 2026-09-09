import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy, FileText, Pencil, RotateCcw } from 'lucide-react';
import { textOf, type Message } from '@axiom/shared';
import type { ComponentPropsWithoutRef } from 'react';
function CodeBlock({ children, ...props }: ComponentPropsWithoutRef<'pre'>) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>Код</span>
        <button
          onClick={() => {
            void navigator.clipboard
              .writeText(ref.current?.textContent ?? '')
              .then(() => {
                setCopied(true);
                setError(false);
                setTimeout(() => setCopied(false), 1800);
              })
              .catch(() => setError(true));
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}{' '}
          {error ? 'Не удалось скопировать' : copied ? 'Скопировано' : 'Копировать код'}
        </button>
      </div>
      <pre {...props} ref={ref}>
        {children}
      </pre>
    </div>
  );
}
export function MessageView({
  message,
  busy,
  canRegenerate,
  onEdit,
  onRegenerate,
}: {
  message: Message;
  busy: boolean;
  canRegenerate: boolean;
  onEdit: (message: Message) => void;
  onRegenerate: () => void;
}) {
  const isUser = message.role === 'user';
  const text = textOf(message);
  const [copied, setCopied] = useState(false);
  return (
    <article
      className={`message ${isUser ? 'user-message' : 'assistant-message'}`}
      data-testid={`message-${message.role}`}
    >
      {!isUser && (
        <div className="assistant-mark" aria-hidden="true">
          A<span>·</span>
        </div>
      )}
      <div className="message-body">
        {!isUser && (
          <div className="message-author">
            Axiom <span>{message.model}</span>
          </div>
        )}
        {message.parts.map((part, index) =>
          part.type === 'image' ? (
            <img
              className="attachment-image"
              key={index}
              src={part.dataUrl}
              alt={part.attachment.name}
            />
          ) : part.type === 'file' ? (
            <div className="file-chip" key={index}>
              <FileText size={16} />
              {part.attachment.name}
            </div>
          ) : null,
        )}
        <div className="markdown">
          {isUser ? (
            <p className="user-text">{text}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{ pre: CodeBlock }}
            >
              {text}
            </ReactMarkdown>
          )}
          {message.status === 'generating' && (
            <span className="stream-cursor" aria-label="Генерация ответа" />
          )}
        </div>
        {message.status === 'aborted' && <div className="message-status">Ответ остановлен</div>}
        {message.error && <div className="message-error">{message.error}</div>}
        <div className="message-actions">
          <button
            className="icon-button"
            title={copied ? 'Скопировано' : 'Копировать сообщение'}
            aria-label="Копировать сообщение"
            onClick={() => {
              void navigator.clipboard
                .writeText(text)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                })
                .catch(() => setCopied(false));
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          {isUser ? (
            <button
              disabled={busy}
              className="icon-button"
              aria-label="Редактировать сообщение"
              title="Редактировать сообщение"
              onClick={() => onEdit(message)}
            >
              <Pencil size={14} />
            </button>
          ) : (
            canRegenerate && (
              <button
                disabled={busy}
                className="icon-button"
                aria-label="Повторить ответ"
                title="Повторить ответ"
                onClick={onRegenerate}
              >
                <RotateCcw size={14} />
              </button>
            )
          )}
        </div>
      </div>
    </article>
  );
}
