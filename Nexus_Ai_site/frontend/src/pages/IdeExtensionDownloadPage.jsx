import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const VSIX = import.meta.env.VITE_NEXUS_AI_VSIX_URL || '/extensions/nexus-ai.vsix';

/** Короткий URL: сразу отдаёт VSIX, с fallback-страницей если браузер не скачал. */
export default function IdeExtensionDownloadPage() {
  useEffect(() => {
    window.location.replace(VSIX);
  }, []);

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 px-6 bg-[var(--nx-bg,#07070a)] text-[var(--nx-text,#fafafa)]">
      <p className="text-sm text-[var(--nx-muted,#a1a1aa)] text-center max-w-md">
        Загрузка <strong>nexus-ai.vsix</strong>… Если файл не появился, нажмите кнопку ниже.
      </p>
      <a
        href={VSIX}
        download="nexus-ai.vsix"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-500 text-black font-semibold hover:opacity-90"
      >
        Скачать Nexus AI
      </a>
      <Link to="/ide" className="text-sm text-teal-400 hover:underline">
        ← Все расширения для IDE
      </Link>
    </div>
  );
}
