import { GitBranch, Terminal } from 'lucide-react';

export default function IdeStatusBar({
  demoMode,
  gitInfo,
  authStatus,
  activeFile,
  getLanguageFromPath,
}) {
  return (
    <footer className="ide-statusbar h-[24px] text-white flex items-center justify-between px-3 text-[11px] shrink-0 select-none z-30 relative">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <Terminal size={12} />
          <span>{demoMode ? 'Демо-терминал' : 'Терминал · PowerShell'}</span>
        </div>
        {demoMode ? (
          <span className="text-teal-100/90 truncate">demo workspace</span>
        ) : (
          gitInfo.is_git && (
            <div className="flex items-center gap-1 shrink-0">
              <GitBranch size={12} />
              <span>
                git: <b>{gitInfo.branch}</b>
              </span>
            </div>
          )
        )}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {authStatus.authorized &&
          (authStatus.profile?.monthly_cap_rub > 0 || authStatus.profile?.daily_cap_rub > 0) && (
            <span className="bg-black/20 px-2 py-0.5 rounded select-none font-mono" title="Пул ИИ на месяц">
              {Math.round(
                authStatus.profile.monthly_remaining_rub ?? authStatus.profile.daily_remaining_rub ?? 0
              ).toLocaleString('ru-RU')}{' '}
              ₽
            </span>
          )}
        <span className="hidden sm:inline">UTF-8</span>
        {activeFile && (
          <span className="hidden md:inline">
            {getLanguageFromPath(activeFile.path).toUpperCase()}
          </span>
        )}
      </div>
    </footer>
  );
}
