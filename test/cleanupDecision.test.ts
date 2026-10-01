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

test('cleans an idle empty window using the same rules as a workspace', () => {
  const result = decideCleanup(snapshot({ hasWorkspace: false }));
  assert.equal(result.outcome, 'close');
});

test('protects unsaved editors and focused states in empty windows', () => {
  for (const overrides of [
    { dirtyEditors: 1 },
    { focused: true },
    { active: true },
  ]) {
    const result = decideCleanup(
      snapshot({ hasWorkspace: false, ...overrides }),
    );
    assert.equal(result.outcome, 'keep');
  }
});

test('notify mode reports the candidate without requesting close', () => {
  assert.deepEqual(decideCleanup(snapshot({ action: 'notify' })), {
    outcome: 'notify',
    idleForMs: 73 * HOUR,
  });
});

test('allows unsaved tabs into the normal close flow when protection is off', () => {
  for (const hasWorkspace of [true, false]) {
    assert.equal(
      decideCleanup(
        snapshot({ hasWorkspace, dirtyEditors: 1, protectDirtyEditors: false }),
      ).outcome,
      'close',
    );
  }
});
