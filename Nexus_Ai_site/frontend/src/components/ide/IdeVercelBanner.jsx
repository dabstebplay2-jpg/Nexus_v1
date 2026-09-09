import { Link } from 'react-router-dom';

export default function IdeVercelBanner({ demoMode }) {
  if (!demoMode) {
    return (
      <div className="shrink-0 px-3 py-1.5 text-[11px] bg-amber-500/10 border-b border-amber-500/20 text-amber-100/90 flex flex-wrap items-center justify-center gap-2 z-50">
        <span>Web Lite — для полного LSP/OpenVSX используйте Desktop IDE.</span>
        <Link to="/ide" className="underline font-semibold hover:text-white">
          Скачать Nexus IDE
        </Link>
      </div>
    );
  }

  return (
    <div className="shrink-0 px-3 py-1.5 text-[11px] bg-teal-500/10 border-b border-teal-500/25 text-teal-100/95 flex flex-wrap items-center justify-center gap-2 z-50">
      <span>Демо-проект в браузере — файлы сохраняются локально в этом устройстве.</span>
      <Link to="/ide" className="underline font-semibold hover:text-white">
        Desktop IDE
      </Link>
      <span className="text-teal-200/60">·</span>
      <span className="text-teal-200/80">Agent работает через облако Nexus</span>
    </div>
  );
}
