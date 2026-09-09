import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const outputArg = process.argv[2];
const output = resolve(root, outputArg ?? `releases/Axiom-${pkg.version}-source.zip`);
const archiveRootName = `Axiom-${pkg.version}-source`;

const allowedTopLevelDirectories = new Set(['apps', 'packages', 'tests', 'docs', 'scripts']);
const allowedTopLevelFiles = [
  /^README(?:\..+)?$/i,
  /^LICENSE(?:\..+)?$/i,
  /^CHANGELOG(?:\..+)?$/i,
  /^package(?:-lock)?\.json$/,
  /^tsconfig(?:\.[^.]+)*\.json$/,
  /^eslint\.config\.[cm]?js$/,
  /^playwright\.config\.[cm]?ts$/,
  /^\.gitignore$/,
  /^\.nvmrc$/,
  /^\.prettierignore$/,
  /^\.prettierrc(?:\.json)?$/,
  /^\.env\.example$/,
];
const forbiddenSegments = new Set([
  '.axiom',
  '.git',
  'node_modules',
  'dist',
  'test-results',
  'playwright-report',
  'coverage',
  '.cache',
]);
const forbiddenBasenames = new Set(['master.key', 'secrets.json']);

function normalizePath(path) {
  return path.split(sep).join('/');
}

function isForbidden(relativePath) {
  const normalized = normalizePath(relativePath);
  const parts = normalized.split('/').filter(Boolean);
  const name = parts.at(-1) ?? '';
  if (parts.some((part) => forbiddenSegments.has(part))) return true;
  if (forbiddenBasenames.has(name)) return true;
  if (/^\.env(?:\..+)?$/.test(name) && name !== '.env.example') return true;
  if (/\.log$/i.test(name)) return true;
  if (/\.sqlite(?:-(?:wal|shm))?$/i.test(name)) return true;
  return false;
}

function isAllowedTopLevel(name, isDirectory) {
  return isDirectory
    ? allowedTopLevelDirectories.has(name)
    : allowedTopLevelFiles.some((pattern) => pattern.test(name));
}

function copyTree(source, destination, relativePath) {
  if (isForbidden(relativePath)) return 0;
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to package symbolic link: ${normalizePath(relativePath)}`);
  }
  if (stat.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    let copied = 0;
    for (const entry of readdirSync(source)) {
      copied += copyTree(
        join(source, entry),
        join(destination, entry),
        join(relativePath, entry),
      );
    }
    return copied;
  }
  if (!stat.isFile()) return 0;
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { force: true, preserveTimestamps: true });
  return 1;
}

const temp = mkdtempSync(join(tmpdir(), 'axiom-source-release-'));
const stage = join(temp, archiveRootName);
let copied = 0;

try {
  mkdirSync(stage, { recursive: true });
  for (const entry of readdirSync(root)) {
    const source = join(root, entry);
    const stat = lstatSync(source);
    if (!isAllowedTopLevel(entry, stat.isDirectory())) continue;
    copied += copyTree(source, join(stage, entry), entry);
  }
  if (!copied) throw new Error('No source files matched the release allow-list.');

  mkdirSync(dirname(output), { recursive: true });
  if (existsSync(output)) rmSync(output, { force: true });

  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Compress-Archive -LiteralPath $env:AXIOM_STAGE -DestinationPath $env:AXIOM_OUTPUT -Force',
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, AXIOM_STAGE: stage, AXIOM_OUTPUT: output },
      },
    );
  } else {
    execFileSync('zip', ['-qr', output, archiveRootName], {
      cwd: temp,
      stdio: 'inherit',
    });
  }

  console.log(`Created safe source archive with ${copied} files: ${output}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
