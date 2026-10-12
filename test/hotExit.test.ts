import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import type { CleanupScheduler } from '../src/scheduler';
import type { WindowCloser } from '../src/windowCloser';

async function harness(update: () => Promise<void>) {
  const settings: Record<string, unknown> = { enabled: true, action: 'close' };
  const state = { focused: false, active: false };
  const warnings: string[] = [];
  let closeCalls = 0;
  const vscode = {
    ConfigurationTarget: { Global: 1 },
    workspace: {
      getConfiguration: (section: string) => ({
        get: (key: string, fallback?: unknown) =>
          section === 'files' ? 'off' : (settings[key] ?? fallback),
        update,
      }),
    },
    window: {
      state,
      tabGroups: { all: [] },
      showWarningMessage: () => Promise.resolve(),
    },
    commands: {
      getCommands: async () => ['workbench.action.closeWindow'],
      executeCommand: async () => {
        closeCalls++;
      },
    },
    EventEmitter: class {
      event = () => undefined;
      fire() {}
      dispose() {}
    },
  };
  const cache = new Map<string, Record<string, unknown>>();
  function load(name: string): Record<string, unknown> {
    if (name === 'vscode') return vscode;
    const key = path.basename(name);
    if (cache.has(key)) return cache.get(key)!;
    const exports = {};
    cache.set(key, exports);
    runInNewContext(
      readFileSync(path.join(__dirname, '../src', `${key}.js`), 'utf8'),
      { exports, require: load },
    );
    return exports;
  }
  const logger = {
    info() {},
    warn: (message: string) => warnings.push(message),
  };
  const Closer = load('windowCloser').WindowCloser as typeof WindowCloser;
  const closer = await Closer.create(logger as never);
  const Scheduler = load('scheduler')
    .CleanupScheduler as typeof CleanupScheduler;
  const scheduler = new Scheduler(
    { getLastActivityAt: () => 0 } as never,
    closer,
    logger as never,
    { now: () => 100_000_000 },
  );
  return { scheduler, settings, state, warnings, closeCalls: () => closeCalls };
}

for (const change of ['focus', 'disable', 'notify'] as const) {
  test(`does not close if ${change} occurs while Hot Exit is being configured`, async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const env = await harness(() => pending);
    const sweep = env.scheduler.sweep('test');
    if (change === 'focus') env.state.focused = true;
    if (change === 'disable') env.settings.enabled = false;
    if (change === 'notify') env.settings.action = 'notify';
    release();
    const result = await sweep;
    assert.notEqual(result.outcome, 'close');
    assert.equal(env.closeCalls(), 0);
  });
}

test('reports a Hot Exit write failure and does not invoke Close Window', async () => {
  const env = await harness(async () => {
    throw new Error('settings are read-only');
  });
  const result = await env.scheduler.sweep('test');
  assert.equal(result.outcome, 'keep');
  assert.equal(result.outcome === 'keep' && result.reason, 'close-failed');
  assert.equal(env.closeCalls(), 0);
  assert.ok(
    env.warnings.some((message) => message.includes('settings are read-only')),
  );
});
