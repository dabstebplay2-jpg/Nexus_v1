import { motion } from 'framer-motion';
import { FileCode2 } from 'lucide-react';
import { parseMessageContent } from '../../lib/parseMessageContent';
import { imageDisplaySrc } from '../../lib/imagePersistence';
import ThinkingBlock from './ThinkingBlock';
import MarkdownBody from './MarkdownBody';
import ImageGeneratingPlaceholder from './ImageGeneratingPlaceholder';

function renderPlainText(text) {
  if (!text) return null;
  return text.split('\n').map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {line}
    </span>
  ));
}

export default function ChatMessageContent({
  content,
  thinking,
  message,
  isStreaming,
  isUser,
  onOpenCodeFile,
  activeCodeFileId,
  codePanelOpen,
}) {
  const parsed = parseMessageContent(content || '');
  const codeFiles =
    !isUser && message?.codeFiles?.length ? message.codeFiles : parsed.codeFiles;
  const prose = parsed.prose;

  const userAttachments = isUser
    ? Array.isArray(message?.attachments)
      ? message.attachments
      : []
    : [];
  const generatedImages =
    !isUser && Array.isArray(message?.images) ? message.images : [];
  const showImagePlaceholder =
    !isUser && Boolean(message?.imageGenerating) && generatedImages.length === 0;
  const modelStatusText =
    content?.trim() && content !== '🎨 Генерирую изображение…' ? content.trim() : '';
  const showDefaultImageStatus = showImagePlaceholder && !modelStatusText;

  if (isUser) {
    return (
      <div className="nx-message-body text-[1.0625rem] md:text-lg leading-relaxed text-zinc-200 select-text">
        {userAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 not-prose">
            {userAttachments.map((a, i) =>
              a.kind === 'image' && a.previewUrl ? (
                <img
                  key={a.id || i}
                  src={a.previewUrl}
                  alt={a.name}
                  className="max-h-48 max-w-full rounded-xl border border-white/10 object-contain"
                />
              ) : (
                <span
                  key={a.id || i}
                  className="text-xs px-2 py-1 rounded-lg bg-white/10 text-zinc-400"
                >
                  📎 {a.name}
                </span>
              )
            )}
          </div>
        )}
        <div className="whitespace-pre-wrap">{renderPlainText(content)}</div>
      </div>
    );
  }

  const showThinking =
    !isUser &&
    (thinking ||
      message?.preSearchThinking ||
      message?.searchActivity?.steps?.length ||
      message?.searchActivity?.status ||
      (isStreaming && message?.searchActivity));

  return (
    <div className="nx-message-body text-[1.0625rem] md:text-lg leading-relaxed text-zinc-200 select-text">
      {showThinking ? (
        <ThinkingBlock
          preSearchThinking={message?.preSearchThinking}
          thinking={thinking}
          searchActivity={message?.searchActivity}
          isStreaming={isStreaming}
        />
      ) : null}
      {prose ? (
        <div className="mb-3 not-prose">
          <MarkdownBody content={prose} />
        </div>
      ) : null}

      {codeFiles.length > 0 && (
        <div className="space-y-2 not-prose">
          <p className="text-[11px] font-medium text-zinc-500">
            {codeFiles.length === 1 ? 'Файл в этом ответе' : `Файлов в ответе: ${codeFiles.length}`}
          </p>
          <div className="flex flex-col gap-2">
            {codeFiles.map((f) => {
              const active = codePanelOpen && activeCodeFileId === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onOpenCodeFile?.(f.id)}
                  className={`group flex items-start gap-3 w-full max-w-md text-left rounded-xl border px-3 py-2.5 transition-colors ${
                    active
                      ? 'border-teal-500/50 bg-teal-500/10'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15'
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg bg-teal-500/15 flex items-center justify-center shrink-0 text-teal-400">
                    <FileCode2 size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wide text-teal-400">
                      {f.languageLabel}
                    </p>
                    <p className="text-sm font-mono text-zinc-300 mt-0.5 truncate">
                      файл · {f.filename}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-1 line-clamp-1 font-mono">
                      {(f.content || '').split('\n')[0]?.slice(0, 72) || '…'}
                      {!f.complete && ' · пишет…'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!prose && !codeFiles.length && content && !showImagePlaceholder ? (
        <div className="not-prose">
          <MarkdownBody content={content} />
        </div>
      ) : null}

      {showImagePlaceholder ? (
        <div className="mt-3 not-prose space-y-2.5">
          {modelStatusText ? (
            <div className="text-sm text-zinc-500 leading-relaxed image-gen-status-line">
              <MarkdownBody content={modelStatusText} />
            </div>
          ) : null}
          {showDefaultImageStatus ? (
            <p className="text-sm text-zinc-500 image-gen-status-line m-0">Создаю изображение…</p>
          ) : null}
          <ImageGeneratingPlaceholder label={false} />
        </div>
      ) : null}

      {generatedImages.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-3 not-prose">
          {generatedImages.map((img, i) => {
            const src = imageDisplaySrc(img);
            if (!src) return null;
            return (
              <motion.a
                key={img.artifactId || i}
                href={src}
                target="_blank"
                rel="noreferrer"
                className="block w-full max-w-[min(100%,28rem)] rounded-[1.25rem] overflow-hidden border border-[var(--nx-border)] shadow-lg"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <img
                  src={src}
                  alt="Сгенерированное изображение"
                  className="w-full max-h-[420px] object-contain bg-black/20"
                />
              </motion.a>
            );
          })}
        </div>
      )}

      {isStreaming && !showImagePlaceholder && (prose || content || thinking) ? (
        <span className="nx-stream-cursor" aria-hidden />
      ) : null}
    </div>
  );
}
