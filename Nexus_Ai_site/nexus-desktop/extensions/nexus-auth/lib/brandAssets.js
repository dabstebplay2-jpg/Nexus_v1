const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const BRAND_ASSET_BASENAME = 'brand';
const BRAND_ASSET_EXTENSIONS = ['svg', 'png', 'webp', 'jpg', 'jpeg'];
const BRAND_DIRS = { icon: 'logo', full: 'logo_and_name', wordmark: 'only_name' };

function resolveBrandFile(extRoot, variant) {
  const sub = BRAND_DIRS[variant] || BRAND_DIRS.icon;
  const baseDir = path.join(extRoot, 'media', 'brand', sub);
  for (const ext of BRAND_ASSET_EXTENSIONS) {
    const p = path.join(baseDir, `${BRAND_ASSET_BASENAME}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return path.join(extRoot, 'media', 'brand', 'logo', 'brand.svg');
}

function brandUrisForWebview(webview, extRoot) {
  const toUri = (variant) =>
    String(webview.asWebviewUri(vscode.Uri.file(resolveBrandFile(extRoot, variant))));
  const logo = toUri('icon');
  return { logo, logoFull: toUri('full'), wordmark: toUri('wordmark'), assistant: logo };
}

module.exports = { brandUrisForWebview };
