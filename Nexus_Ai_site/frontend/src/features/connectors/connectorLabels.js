const LABELS = {
  google_workspace: 'Gmail',
  github: 'GitHub',
  vercel: 'Vercel',
  discord: 'Discord',
};

export function connectorLabel(id) {
  if (!id) return '';
  return LABELS[id] || id;
}

export function formatConnectorList(ids) {
  if (!ids?.length) return '';
  return ids.map((id) => connectorLabel(id)).filter(Boolean).join(', ');
}

export function labelFromToolEvent(evt) {
  if (evt?.connector) return connectorLabel(evt.connector);
  const tool = evt?.tool || '';
  if (tool.startsWith('github_')) return 'GitHub';
  if (tool.startsWith('gmail_') || tool.startsWith('calendar_')) return 'Gmail';
  if (tool.startsWith('vercel_')) return 'Vercel';
  if (tool.startsWith('discord_')) return 'Discord';
  return tool || 'инструмент';
}
