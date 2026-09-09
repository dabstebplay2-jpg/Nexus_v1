/**
 * Бренд-ассеты из public/brand/image/.
 * Чтобы сменить логотип — замените файл в нужной папке, имя оставьте brand.svg или brand.png
 */

export const BRAND_ASSET_BASENAME = 'brand';

/** @type {readonly ('svg' | 'png' | 'webp' | 'jpg' | 'jpeg')[]} */
export const BRAND_ASSET_EXTENSIONS = ['svg', 'png', 'webp', 'jpg', 'jpeg'];

/** @type {{ icon: string; full: string; wordmark: string }} */
export const BRAND_DIRS = {
  /** Только знак — сайдбар (свёрнут), favicon, мелкие иконки */
  icon: '/brand/image/logo',
  /** Знак + название — шапка, лендинг, развёрнутый сайдбар */
  full: '/brand/image/logo_and_name',
  /** Только название — где нужен текстовый логотип без знака */
  wordmark: '/brand/image/only_name',
};

/** @param {'icon' | 'full' | 'wordmark'} variant */
export function brandAssetCandidates(variant) {
  const dir = BRAND_DIRS[variant];
  return BRAND_ASSET_EXTENSIONS.map((ext) => `${dir}/${BRAND_ASSET_BASENAME}.${ext}`);
}
