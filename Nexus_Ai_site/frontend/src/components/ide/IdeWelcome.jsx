import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export default function IdeWelcome({ demoMode, onOpenFolder, onOpenAgent }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none ide-empty-editor px-6">
      <div className="ide-welcome-card rounded-2xl p-8 max-w-lg w-full">
        <div className="ide-copilot-glow w-16 h-16 rounded-2xl flex items-center justify-center mb-5 mx-auto">
          <Sparkles size={28} className="text-teal-400" />
        </div>
        <span className="text-xl font-semibold text-[var(--ide-fg)]">Nexus Web IDE</span>
        <p className="text-sm text-[var(--ide-muted)] mt-2 mb-6 leading-relaxed">
          {demoMode
            ? 'Демо-проект уже загружен — откройте файл в Explorer или спросите Agent.'
            : 'Откройте папку проекта, затем Agent — ИИ правит файлы и запускает команды.'}
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {!demoMode && (
            <button
              type="button"
              onClick={onOpenFolder}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold rounded-xl"
            >
              Открыть папку
            </button>
          )}
          <button
            type="button"
            onClick={onOpenAgent}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold rounded-xl"
          >
            Agent
          </button>
          <Link
            to="/ide"
            className="px-4 py-2 border border-violet-500/30 text-violet-300 hover:border-violet-400/50 text-sm rounded-xl"
          >
            Desktop IDE
          </Link>
        </div>
      </div>
    </div>
  );
}
