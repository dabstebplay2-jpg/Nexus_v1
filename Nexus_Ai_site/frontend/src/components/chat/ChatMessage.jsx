import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import BrandLogo from '../brand/BrandLogo';
import ChatMessageContent from './ChatMessageContent';
import SourceLinks from './SourceLinks';
import { ensureArray } from '../../lib/normalizeArrays';

export default function ChatMessage({
  message,
  isStreaming,
  assistantLabel = 'Nexus',
  onOpenCodeFile,
  activeCodeFileId,
  codePanelOpen,
}) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`nx-message flex gap-5 px-5 sm:px-8 py-7 select-text ${
        isUser ? 'bg-transparent' : 'nx-message--assistant'
      }`}
    >
      {isUser ? (
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-violet-500/20 text-violet-300">
          <User size={20} />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-xl shrink-0 overflow-hidden border border-white/10 bg-black/30">
          <BrandLogo
            variant="icon"
            className="h-10 w-10"
            imgClassName="h-10 w-10 object-cover"
            alt={assistantLabel}
          />
        </div>
      )}
      <div className="nx-message-body flex-1 min-w-0 max-w-[95%] sm:max-w-[var(--nx-content-max)] select-text">
        <p className="text-sm font-semibold text-zinc-500 mb-1.5">
          {isUser ? 'Вы' : assistantLabel}
        </p>
        <ChatMessageContent
          content={message.content}
          thinking={message.thinking}
          message={message}
          isStreaming={isStreaming}
          isUser={isUser}
          onOpenCodeFile={(fileId) => onOpenCodeFile?.(message, fileId)}
          activeCodeFileId={activeCodeFileId}
          codePanelOpen={codePanelOpen}
        />
        <SourceLinks sources={ensureArray(message.sources)} />
        {!isUser && message.connectorTools?.length > 0 && (
          <p className="mt-3 text-[11px] text-zinc-500">
            Использовано:{' '}
            <span className="text-teal-400/90">{message.connectorTools.join(', ')}</span>
          </p>
        )}
      </div>
    </motion.div>
  );
}
