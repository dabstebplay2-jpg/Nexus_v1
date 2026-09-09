import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Message } from '@axiom/shared';
async function start(directory: string): Promise<{ child: ChildProcess; url: string }> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
    env: { ...process.env, PORT: '0', AXIOM_DATA_DIR: directory },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Server startup timeout'));
    }, 10_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before ready: ${code}`));
    });
    child.stdout!.on('data', (chunk) => {
      output += String(chunk);
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timeout);
        resolve({ child, url: match[0] });
      }
    });
    child.stderr!.resume();
  });
}
async function kill(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
}
test('Real server restart recovers persisted partial Mock output after forced process termination', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'axiom-restart-'));
  let child: ChildProcess | undefined;
  try {
    let running = await start(directory);
    child = running.child;
    const post = (path: string, body: unknown) =>
      fetch(`${running.url}/api${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Axiom-Client': 'chat' },
        body: JSON.stringify(body),
      });
    const conversation = (await post('/conversations', {}).then((r) => r.json())) as { id: string };
    const response = await post(`/conversations/${conversation.id}/generate`, {
      providerId: 'axiom-mock',
      modelId: 'axiom-mock',
      parts: [{ type: 'text', text: 'Restart check' }],
    });
    const reader = response.body!.getReader();
    let chunks = 0;
    while (chunks < 18) {
      const data = await reader.read();
      if (data.done) break;
      if (new TextDecoder().decode(data.value).includes('"delta"')) chunks++;
    }
    await kill(child);
    await reader.cancel().catch(() => undefined);
    running = await start(directory);
    child = running.child;
    const result = (await fetch(`${running.url}/api/conversations/${conversation.id}`).then((r) =>
      r.json(),
    )) as { messages: Message[] };
    assert.equal(result.messages.length, 2);
    assert.equal(result.messages[1]?.status, 'aborted');
    assert.ok(result.messages[1]?.parts.some((p) => p.type === 'text' && p.text.length > 0));
    assert.equal(result.messages[0]?.parts[0]?.type, 'text');
  } finally {
    if (child) await kill(child);
    rmSync(directory, { recursive: true, force: true });
  }
});
