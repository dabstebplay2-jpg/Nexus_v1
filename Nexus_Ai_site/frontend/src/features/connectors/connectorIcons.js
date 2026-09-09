/** Simple brand-ish colors for connector cards */
export const CONNECTOR_ICON_STYLES = {
  google: 'bg-white/10 text-blue-300',
  github: 'bg-white/10 text-zinc-100',
  vercel: 'bg-white/10 text-zinc-100',
  discord: 'bg-indigo-500/20 text-indigo-300',
  microsoft: 'bg-blue-500/15 text-blue-300',
  hubspot: 'bg-orange-500/15 text-orange-300',
  supabase: 'bg-emerald-500/15 text-emerald-300',
  stripe: 'bg-violet-500/15 text-violet-300',
  linear: 'bg-indigo-500/15 text-indigo-200',
  sentry: 'bg-purple-500/15 text-purple-300',
  atlassian: 'bg-blue-500/15 text-blue-400',
  notion: 'bg-zinc-500/15 text-zinc-200',
  slack: 'bg-purple-500/15 text-purple-300',
  default: 'bg-teal-500/15 text-teal-300',
};

export function iconStyle(icon) {
  return CONNECTOR_ICON_STYLES[icon] || CONNECTOR_ICON_STYLES.default;
}

export function connectorInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}
