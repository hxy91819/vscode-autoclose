import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  HEARTBEAT_MS,
  WindowRegistry,
  type WindowReport,
} from '../src/windowRegistry';

type Details = Omit<WindowReport, 'id' | 'updatedAt'>;
const details = (label: string, lastActivityAt = 0): Details => ({
  label,
  nextCheckAt: 500,
  checkIntervalMs: 500,
  closeSupported: true,
  snapshot: {
    now: 100,
    lastActivityAt,
    idleMs: 24 * 3_600_000,
    enabled: true,
    hasWorkspace: label !== 'Empty Window',
    focused: false,
    active: false,
    dirtyEditors: 0,
    protectDirtyEditors: true,
    action: 'close',
  },
});

async function registryDirectory(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'autoclose-registry-'),
  );
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('independent windows share reports without losing concurrent updates', async () => {
  await registryDirectory(async (directory) => {
    const first = new WindowRegistry(directory, () => 100);
    const second = new WindowRegistry(directory, () => 100);
    await Promise.all([
      first.publish(details('workspace', 50)),
      second.publish(details('Empty Window', 25)),
    ]);
    const reports = await first.list();
    assert.deepEqual(
      reports.map((report) => report.label),
      ['Empty Window', 'workspace'],
    );
    await first.publish(details('workspace', 75));
    assert.deepEqual(
      (await second.list()).map((report) => report.snapshot.lastActivityAt),
      [25, 75],
    );
    await first.dispose();
    assert.deepEqual(
      (await second.list()).map((report) => report.id),
      [second.id],
    );
    await second.dispose();
  });
});

test('two empty windows keep separate identities and activity times', async () => {
  await registryDirectory(async (directory) => {
    const first = new WindowRegistry(directory, () => 100);
    const second = new WindowRegistry(directory, () => 100);
    await Promise.all([
      first.publish(details('Empty Window', 10)),
      second.publish(details('Empty Window', 20)),
    ]);
    const reports = await first.list();
    assert.equal(reports.length, 2);
    assert.notEqual(reports[0].id, reports[1].id);
    assert.deepEqual(
      reports.map((report) => report.snapshot.lastActivityAt),
      [10, 20],
    );
  });
});

test('crashed windows expire and a resumed window becomes visible again', async () => {
  await registryDirectory(async (directory) => {
    let now = 100;
    const registry = new WindowRegistry(directory, () => now);
    await registry.publish(details('workspace'));
    now += 3 * HEARTBEAT_MS + 1;
    assert.deepEqual(await registry.list(), []);
    await registry.publish(details('workspace'));
    assert.equal((await registry.list()).length, 1);
  });
});

test('shutdown waits for queued writes and removes the window record', async () => {
  await registryDirectory(async (directory) => {
    const registry = new WindowRegistry(directory, () => 100);
    const pending = [
      registry.publish(details('first')),
      registry.publish(details('second')),
    ];
    await registry.dispose();
    await Promise.all(pending);
    await registry.publish(details('after shutdown'));
    assert.deepEqual(await registry.list(), []);
  });
});

test('partial or malformed records do not hide valid windows', async () => {
  await registryDirectory(async (directory) => {
    const registry = new WindowRegistry(directory, () => 100);
    await registry.publish(details('workspace'));
    await writeFile(path.join(directory, 'broken.json'), '{');
    await writeFile(path.join(directory, 'incomplete.json'), '{}');
    await writeFile(path.join(directory, 'pending.json.tmp'), '{}');
    assert.equal((await registry.list()).length, 1);
  });
});
