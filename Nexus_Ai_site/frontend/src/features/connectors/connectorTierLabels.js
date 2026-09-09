const TIER_LABELS = {
  FREE: 'Free',
  HOBBY: 'Hobby',
  STANDARD: 'Standard',
  PRO: 'Pro',
  ULTRA: 'Ultra',
};

export function tierLabel(tier) {
  return TIER_LABELS[(tier || '').toUpperCase()] || tier || 'Hobby';
}
