/** Заголовок боковой панели как в VS Code */
export default function SidebarHeader({ title, actions }) {
  return (
    <div className="flex items-center justify-between h-[35px] px-3 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-vscode-muted select-none">
      <span>{title}</span>
      {actions && <div className="flex items-center gap-0.5">{actions}</div>}
    </div>
  );
}
