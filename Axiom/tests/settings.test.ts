import test from 'node:test';
import assert from 'node:assert/strict';
import { SerializedWriter } from '../apps/chat/src/state/serialized-writer';
test('Settings single writer serializes slow A before latest C, coalescing B', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: string[] = [];
  let persisted = '';
  const writer = new SerializedWriter<string>(
    async (value) => {
      writes.push(value);
      if (value === 'A') await gate;
      persisted = value;
    },
    () => assert.fail('unexpected error'),
  );
  writer.enqueue('A');
  writer.enqueue('B');
  writer.enqueue('C');
  assert.deepEqual(writes, ['A']);
  release();
  await writer.flush();
  assert.deepEqual(writes, ['A', 'C']);
  assert.equal(persisted, 'C');
});
test('Failed settings snapshot is retryable and never produces a rejected flush promise', async () => {
  const errors: unknown[] = [];
  let fail = true;
  let persisted = '';
  const writer = new SerializedWriter<string>(
    async (value) => {
      if (fail) throw new Error('offline');
      persisted = value;
    },
    (error) => {
      errors.push(error);
    },
  );
  writer.enqueue('latest');
  await writer.flush();
  assert.equal(errors.length, 1);
  fail = false;
  writer.retry();
  await writer.flush();
  assert.equal(persisted, 'latest');
});
test('Failed old settings write does not drop a newer update', async () => {
  let reject!: (error: Error) => void;
  const gate = new Promise<void>((_, r) => {
    reject = r;
  });
  let persisted = '';
  const writer = new SerializedWriter<string>(
    async (value) => {
      if (value === 'old') await gate;
      persisted = value;
    },
    () => assert.fail('superseded error'),
  );
  writer.enqueue('old');
  writer.enqueue('new');
  reject(new Error('offline'));
  await writer.flush();
  assert.equal(persisted, 'new');
});

test('Settings update arriving between drain completion and cleanup is not stranded', async () => {
  const writes: string[] = [];
  const writer = new SerializedWriter<string>(
    async (value) => {
      writes.push(value);
    },
    () => assert.fail('unexpected error'),
  );
  writer.enqueue('A');
  queueMicrotask(() => writer.enqueue('B'));
  await writer.flush();
  assert.deepEqual(writes, ['A', 'B']);
});
