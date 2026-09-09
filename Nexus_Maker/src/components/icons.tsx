import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const Icon = ({ children, ...props }: P) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>

export const MouseIcon = (p: P) => <Icon {...p}><path d="m4 3 16 8-7 2-3 7L4 3Z" /></Icon>
export const FrameIcon = (p: P) => <Icon {...p}><path d="M5 3v18M19 3v18M3 5h18M3 19h18" /></Icon>
export const RectIcon = (p: P) => <Icon {...p}><rect x="4" y="5" width="16" height="14" rx="2" /></Icon>
export const TextIcon = (p: P) => <Icon {...p}><path d="M5 5h14M12 5v14M8 19h8" /></Icon>
export const StickyIcon = (p: P) => <Icon {...p}><path d="M5 3h14v13l-5 5H5V3Z"/><path d="M14 21v-5h5"/></Icon>
export const UndoIcon = (p: P) => <Icon {...p}><path d="M9 7 4 12l5 5"/><path d="M20 17a8 8 0 0 0-8-8H4"/></Icon>
export const RedoIcon = (p: P) => <Icon {...p}><path d="m15 7 5 5-5 5"/><path d="M4 17a8 8 0 0 1 8-8h8"/></Icon>
export const EyeIcon = (p: P) => <Icon {...p}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></Icon>
export const EyeOffIcon = (p: P) => <Icon {...p}><path d="m3 3 18 18"/><path d="M10.6 6.2A11 11 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-2.1 2.8M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6c1.7 0 3.2-.4 4.5-1"/></Icon>
export const LockIcon = (p: P) => <Icon {...p}><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></Icon>
export const UnlockIcon = (p: P) => <Icon {...p}><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.2-2.4"/></Icon>
export const SunIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></Icon>
export const MoonIcon = (p: P) => <Icon {...p}><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8Z"/></Icon>
export const LayersIcon = (p: P) => <Icon {...p}><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></Icon>
export const SparkIcon = (p: P) => <Icon {...p}><path d="m12 2 1.3 4.7L18 8l-4.7 1.3L12 14l-1.3-4.7L6 8l4.7-1.3L12 2Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/></Icon>
export const PlusIcon = (p: P) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>
export const MinusIcon = (p: P) => <Icon {...p}><path d="M5 12h14"/></Icon>
export const ChevronIcon = (p: P) => <Icon {...p}><path d="m9 18 6-6-6-6"/></Icon>
export const FileIcon = (p: P) => <Icon {...p}><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/></Icon>
export const BoxIcon = (p: P) => <Icon {...p}><path d="m12 2 8 4.5v11L12 22l-8-4.5v-11L12 2Z"/><path d="m4.5 6.8 7.5 4.3 7.5-4.3M12 11v11"/></Icon>
export const WrenchIcon = (p: P) => <Icon {...p}><path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L4 17l3 3 8.3-8.3a4 4 0 0 0-.6-5.4Z"/></Icon>
export const VariableIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="8"/><path d="M8.5 15.5 15.5 8.5M8.5 8.5h.01M15.5 15.5h.01"/></Icon>
export const ArrowUpIcon = (p: P) => <Icon {...p}><path d="m6 10 6-6 6 6M12 4v16"/></Icon>
export const ArrowDownIcon = (p: P) => <Icon {...p}><path d="m6 14 6 6 6-6M12 20V4"/></Icon>
export const GripIcon = (p: P) => <Icon {...p}><circle cx="8" cy="7" r=".7" fill="currentColor" stroke="none"/><circle cx="16" cy="7" r=".7" fill="currentColor" stroke="none"/><circle cx="8" cy="12" r=".7" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r=".7" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r=".7" fill="currentColor" stroke="none"/><circle cx="16" cy="17" r=".7" fill="currentColor" stroke="none"/></Icon>
export const SearchIcon = (p: P) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></Icon>
export const EllipseIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="8" /></Icon>
export const PenIcon = (p: P) => <Icon {...p}><path d="m12 3 4 4-7.5 7.5-4.5 1 1-4.5L12 3Z"/><path d="m13 6 5 5M4 20h16"/></Icon>
export const PencilIcon = (p: P) => <Icon {...p}><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z"/><path d="m13.8 6.7 3.5 3.5"/></Icon>
export const BrushIcon = (p: P) => <Icon {...p}><path d="M14 4c2-2 4-1 5 0s1 3-1 5l-7 7-4-4 7-8Z"/><path d="M7 12c-3 1-4 3-3 6 2-1 4 0 5-2"/></Icon>
export const DrawModeIcon = (p: P) => <Icon {...p}><path d="M4 17c4-8 8-12 16-13-1 8-5 12-13 16l-3-3Z"/><path d="m7 14 3 3"/></Icon>
export const DesignModeIcon = (p: P) => <Icon {...p}><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M5 9h14M9 5v14"/></Icon>
export const MotionIcon = (p: P) => <Icon {...p}><path d="M3 12h4l2-5 3 10 2-5h7"/><circle cx="3" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="21" cy="12" r="1" fill="currentColor" stroke="none"/></Icon>
export const CodeIcon = (p: P) => <Icon {...p}><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/></Icon>
export const PlayIcon = (p: P) => <Icon {...p}><path d="m8 5 11 7-11 7V5Z"/></Icon>
export const DiamondIcon = (p: P) => <Icon {...p}><path d="m12 4 8 8-8 8-8-8 8-8Z"/></Icon>
export const AlignLeftIcon = (p: P) => <Icon {...p}><path d="M5 4v16M8 8h8v3H8zM8 14h11v3H8z"/></Icon>
export const AlignCenterIcon = (p: P) => <Icon {...p}><path d="M12 4v16M7 8h10v3H7zM5 14h14v3H5z"/></Icon>
export const AlignRightIcon = (p: P) => <Icon {...p}><path d="M19 4v16M8 8h8v3H8zM5 14h11v3H5z"/></Icon>
export const AlignTopIcon = (p: P) => <Icon {...p}><path d="M4 5h16M8 8v8h3V8zM14 8v11h3V8z"/></Icon>
export const AlignMiddleIcon = (p: P) => <Icon {...p}><path d="M4 12h16M8 7h3v10H8zM14 5h3v14h-3z"/></Icon>
export const AlignBottomIcon = (p: P) => <Icon {...p}><path d="M4 19h16M8 8v8h3V8zM14 5v11h3V5z"/></Icon>
export const CopyIcon = (p: P) => <Icon {...p}><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></Icon>
export const EyeDropIcon = (p: P) => <Icon {...p}><path d="m16 3 5 5-10 10H6v-5L16 3Z"/><path d="m13 6 5 5"/></Icon>
