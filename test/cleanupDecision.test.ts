import assert from 'node:assert/strict';
import test from 'node:test';
import { decideCleanup, type CleanupSnapshot } from '../src/cleanupDecision';

const HOUR = 60 * 60 * 1000;

function snapshot(overrides: Partial<CleanupSnapshot> = {}): CleanupSnapshot {
  return {
    now: 100 * HOUR,
    lastActivityAt: 27 * HOUR,
    idleMs: 72 * HOUR,
    enabled: true,
    hasWorkspace: true,
    focused: false,
    active: false,
    dirtyEditors: 0,
    protectDirtyEditors: true,
    action: 'close',
    ...overrides,
  };
}

test('closes a clean inactive workspace after the idle threshold', () => {
  assert.deepEqual(decideCleanup(snapshot()), {
    outcome: 'close',
    idleForMs: 73 * HOUR,
  });
});

test('keeps a stale workspace with a dirty tab', () => {
  const result = decideCleanup(
    snapshot({ lastActivityAt: 0, dirtyEditors: 1 }),
  );

  assert.equal(result.outcome, 'keep');
  assert.ok(result.outcome !== 'keep' || result.reason === 'dirty-editor');
});

test('focused and active states independently protect the window', () => {
  for (const state of [{ focused: true }, { active: true }]) {
    const result = decideCleanup(snapshot(state));
    assert.equal(result.outcome, 'keep');
  }
});

test('does not clean an empty window', () => {
  const result = decideCleanup(snapshot({ hasWorkspace: false }));
  assert.equal(result.outcome, 'keep');
  assert.ok(result.outcome !== 'keep' || result.reason === 'empty-window');
});

test('notify mode reports the candidate without requesting close', () => {
  assert.deepEqual(decideCleanup(snapshot({ action: 'notify' })), {
    outcome: 'notify',
    idleForMs: 73 * HOUR,
  });
});
