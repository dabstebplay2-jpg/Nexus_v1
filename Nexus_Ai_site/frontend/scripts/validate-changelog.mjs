#!/usr/bin/env node
import { dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { validateChangelog } from './changelog-utils.mjs';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

const result = validateChangelog(root);

for (const warning of result.warnings) {
  console.warn(`WARN ${warning}`);
}

if (!result.ok) {
  console.error('Changelog validation failed:');
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Changelog OK: ${result.entries.length} entries (${relative(root, result.path).replace(/\\/g, '/')})`
);
