import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
test('All workspace packages load in plain Node with TypeScript stripping disabled', () => {
  const code = `import { AXIOM_VERSION } from '@axiom/shared'; import { RecentTurnsContextBuilder } from '@axiom/core'; import { MockProvider } from '@axiom/providers'; import { SQLiteStorage } from '@axiom/storage'; const db=new SQLiteStorage(':memory:'); db.close(); if(!RecentTurnsContextBuilder || !MockProvider)throw Error('missing export'); console.log(AXIOM_VERSION);`;
  assert.match(
    execFileSync(
      process.execPath,
      ['--no-experimental-strip-types', '--input-type=module', '-e', code],
      { encoding: 'utf8' },
    ),
    /alpha\.2/,
  );
  for (const name of ['shared', 'core', 'providers', 'storage']) {
    const pkg = JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8')) as {
      exports: { '.': { types: string; import: string } };
    };
    assert.equal(pkg.exports['.'].import, './dist/index.js');
    assert.ok(existsSync(`packages/${name}/${pkg.exports['.'].types}`));
  }
});
