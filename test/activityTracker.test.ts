import assert from 'node:assert/strict';
import test from 'node:test';
import type { Memento, WindowState } from 'vscode';
import {
  ActivityTracker,
  windowTransitionShowsActivity,
} from '../src/activityTracker';

class MemoryMemento implements Memento {
  private readonly values = new Map<string, unknown>();

  public keys(): readonly string[] {
    return [...this.values.keys()];
  }

  public get<T>(key: string): T | undefined;
  public get<T>(key: string, defaultValue: T): T;
  public get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.values.get(key) as T | undefined) ?? defaultValue;
  }

  public update(key: string, value: unknown): Thenable<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

test('first install starts the timer at activation time', async () => {
  const storage = new MemoryMemento();
  const tracker = new ActivityTracker(storage, { now: () => 1234 });

  await tracker.initialize();

  assert.equal(tracker.getLastActivityAt(), 1234);
  assert.equal(storage.get('lastActivityAt'), 1234);
});

test('restored background workspace preserves persisted activity', async () => {
  const storage = new MemoryMemento();
  await storage.update('lastActivityAt', 500);
  const tracker = new ActivityTracker(storage, { now: () => 999 });

  await tracker.initialize();

  assert.equal(tracker.getLastActivityAt(), 500);
});

test('entering or leaving an interactive state counts as activity', () => {
  const state = (focused: boolean, active: boolean): WindowState => ({
    focused,
    active,
  });

  assert.equal(
    windowTransitionShowsActivity(state(false, false), state(true, true)),
    true,
  );
  assert.equal(
    windowTransitionShowsActivity(state(true, true), state(false, false)),
    true,
  );
  assert.equal(
    windowTransitionShowsActivity(state(false, false), state(false, false)),
    false,
  );
});
