#!/usr/bin/env node
/**
 * Builds product/brand/icon.ico for Windows (taskbar, .exe, shortcuts).
 */
import { writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pngToIco from 'png-to-ico';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pngPath = join(root, 'product', 'brand', 'icon.png');
const icoPath = join(root, 'product', 'brand', 'icon.ico');

if (!existsSync(pngPath)) {
  console.error(`Missing ${pngPath}. Run scripts/sync-brand.ps1 first.`);
  process.exit(1);
}

const buf = await pngToIco(pngPath);
writeFileSync(icoPath, buf);
console.log(`Wrote ${icoPath} (${buf.length} bytes)`);
