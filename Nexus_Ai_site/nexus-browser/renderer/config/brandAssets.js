/**
 * Бренд-ассеты (копия с сайта Nexus) — public/brand/image/.
 */

export const BRAND_ASSET_BASENAME = 'brand';

/** @type {readonly ('svg' | 'png' | 'webp' | 'jpg' | 'jpeg')[]} */
export const BRAND_ASSET_EXTENSIONS = ['svg', 'png', 'webp', 'jpg', 'jpeg'];

/** @type {{ icon: string; full: string; wordmark: string }} */
export const BRAND_DIRS = {
  icon: '/brand/image/logo',
  full: '/brand/image/logo_and_name',
  wordmark: '/brand/image/only_name',
};

/** @param {'icon' | 'full' | 'wordmark'} variant */
export function brandAssetCandidates(variant) {
  const dir = BRAND_DIRS[variant];
  return BRAND_ASSET_EXTENSIONS.map((ext) => `${dir}/${BRAND_ASSET_BASENAME}.${ext}`);
}
