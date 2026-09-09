import { motion } from 'framer-motion';
import { Plus, PanelLeftClose, PanelLeft, Trash2 } from 'lucide-react';
import { groupConversationsByDate } from '../../lib/chatStore';

const DATE_LABELS = {
  today: 'Сегодня',
  yesterday: 'Вчера',
  week: '7 дней',
  older: 'Ранее',
};

export default function ChatSidebar({
  collapsed,
  onToggleCollapse,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
}) {
  const groups = groupConversationsByDate(conversations);

  return (
    <>
      <motion.aside
        animate={{ width: collapsed ? 0 : 260 }}
        className="h-full flex flex-col border-r border-white/[0.06] bg-[#08080c]/80 overflow-hidden shrink-0 relative"
      >
        {!collapsed && (
          <div className="flex flex-col h-full w-[260px]">
            <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.06]">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Чаты</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={onNewChat}
                  className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
                  title="Новый чат"
                >
                  <Plus size={16} />
                </button>
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400"
                  title="Свернуть"
                >
                  <PanelLeftClose size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
              {conversations.length === 0 ? (
                <p className="text-xs text-zinc-600 px-2 py-4">Нет чатов. Нажмите + или «Новый чат» слева.</p>
              ) : (
                Object.entries(groups).map(([key, items]) =>
                  items.length === 0 ? null : (
                    <div key={key} className="mb-3">
                      <p className="text-[10px] uppercase text-zinc-600 px-2 mb-1">{DATE_LABELS[key]}</p>
                      {items.map((c) => (
                        <div
                          key={c.id}
                          className={`group flex items-center rounded-lg mb-0.5 ${
                            c.id === activeConversationId ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectConversation(c.id)}
                            className="flex-1 text-left px-3 py-2 text-[13px] text-zinc-300 truncate"
                          >
                            {c.title}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteConversation(c.id)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-600 hover:text-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                )
              )}
            </div>
          </div>
        )}
      </motion.aside>

      {collapsed && (
        <div className="absolute left-[56px] top-14 z-20 flex flex-col gap-2 p-1">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-2 rounded-lg bg-[#14141a] border border-white/10 text-zinc-400 hover:text-white"
            title="Развернуть чаты"
          >
            <PanelLeft size={18} />
          </button>
          <button
            type="button"
            onClick={onNewChat}
            className="p-2 rounded-lg bg-gradient-to-r from-cyan-600 to-violet-600 text-white shadow-lg"
            title="Новый чат"
          >
            <Plus size={18} />
          </button>
        </div>
      )}
    </>
  );
}
