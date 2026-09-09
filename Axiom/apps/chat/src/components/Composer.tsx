import { useRef, useState } from 'react';
import { ArrowUp, FileText, Paperclip, Square, X } from 'lucide-react';
import type { MessagePart, Model, Provider } from '@axiom/shared';
import { ModelSelector } from './ModelSelector';
interface Props {
  value: string;
  onChange: (value: string) => void;
  parts: MessagePart[];
  onParts: (parts: MessagePart[]) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  aborting: boolean;
  editing: boolean;
  onCancelEdit: () => void;
  models: Model[];
  providers: Provider[];
  selected?: Model;
  favorites: string[];
  onSelect: (model: Model) => void;
  onFavorite: (key: string) => void;
  onSettings: () => void;
}
export function Composer(props: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setError('');
    try {
      const additions: MessagePart[] = [];
      if (props.parts.length + files.length > 4)
        throw new Error('Можно прикрепить до четырёх файлов.');
      for (const file of files) {
        const attachment = {
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type || 'text/plain',
          size: file.size,
        };
        if (/^image\/(png|jpeg|webp)$/.test(file.type)) {
          if (!props.selected?.capabilities.imageInput)
            throw new Error('Для изображений выберите модель с поддержкой изображений.');
          if (file.size > 2_000_000) throw new Error('Изображение должно быть меньше 2 МБ.');
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          additions.push({ type: 'image', attachment, dataUrl });
        } else {
          if (!/\.(txt|md|csv|json|ts|tsx|js|jsx|py|css|html|yaml|yml|xml|log)$/i.test(file.name))
            throw new Error('В v0.1 доступны текстовые файлы и изображения PNG, JPEG, WebP.');
          if (file.size > 100_000) throw new Error('Текстовый файл должен быть меньше 100 КБ.');
          additions.push({ type: 'file', attachment, text: await file.text() });
        }
      }
      props.onParts([...props.parts, ...additions]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось прочитать файл.');
    }
    if (fileRef.current) fileRef.current.value = '';
  };
  return (
    <div className="composer-wrap">
      {props.editing && (
        <div className="edit-banner">
          Редактирование заменит это сообщение и все ответы после него.
          <button
            className="icon-button"
            aria-label="Отменить редактирование"
            onClick={props.onCancelEdit}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      <div className="composer">
        {!!props.parts.length && (
          <div className="composer-files">
            {props.parts.map(
              (part, index) =>
                (part.type === 'file' || part.type === 'image') && (
                  <span className="file-chip" key={part.attachment.id}>
                    <FileText size={14} />
                    {part.attachment.name}
                    <button
                      className="icon-button"
                      disabled={props.busy}
                      aria-label={`Убрать ${part.attachment.name}`}
                      onClick={() => props.onParts(props.parts.filter((_, i) => i !== index))}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ),
            )}
          </div>
        )}
        <textarea
          aria-label="Сообщение"
          placeholder="Спросите, придумайте, разберитесь…"
          value={props.value}
          disabled={props.busy}
          rows={2}
          maxLength={100_000}
          onChange={(e) => props.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!props.busy && (props.value.trim() || props.parts.length)) props.onSend();
            }
          }}
        />
        <div className="composer-controls">
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept=".txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.css,.html,.yaml,.yml,.xml,.log,image/png,image/jpeg,image/webp"
            onChange={(e) => {
              void addFiles(e.target.files);
            }}
          />
          <button
            className="icon-button attach-button"
            aria-label="Добавить вложение"
            title="Текстовый файл или изображение"
            disabled={props.busy}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={19} />
          </button>
          <ModelSelector {...props} disabled={props.busy} />
          <span className="composer-spacer" />
          {props.busy ? (
            <button
              className="send-button stop-button"
              disabled={props.aborting}
              aria-label="Остановить генерацию"
              onClick={props.onStop}
            >
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              className="send-button"
              aria-label="Отправить сообщение"
              disabled={!props.selected || (!props.value.trim() && !props.parts.length)}
              onClick={props.onSend}
            >
              <ArrowUp size={20} />
            </button>
          )}
        </div>
      </div>
      <div className="composer-note">
        {props.aborting
          ? 'Останавливаем ответ и сохраняем текст…'
          : props.busy
            ? 'Axiom отвечает…'
            : 'Ваши модели. Ваше пространство.'}
        <span>Enter — отправить · Shift + Enter — новая строка</span>
      </div>
    </div>
  );
}
