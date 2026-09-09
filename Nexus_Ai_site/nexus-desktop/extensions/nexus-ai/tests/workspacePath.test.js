const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeWorkspaceRelativePath } = require('../lib/workspacePath');

test('normalizes a workspace child path', () => {
  assert.equal(normalizeWorkspaceRelativePath('src\\app.js'), 'src/app.js');
});

test('rejects parent traversal and absolute paths', () => {
  for (const value of ['../secret.txt', 'src/../../secret.txt', 'C:\\secret.txt', '/etc/passwd']) {
    assert.throws(() => normalizeWorkspaceRelativePath(value));
  }
});

test('does not allow the workspace root for a file write', () => {
  assert.throws(() => normalizeWorkspaceRelativePath('.', { allowRoot: false }));
});
