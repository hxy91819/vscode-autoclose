import type { CleanupAction } from './config';

export type KeepReason =
  | 'disabled'
  | 'empty-window'
  | 'focused'
  | 'active'
  | 'not-idle'
  | 'dirty-editor'
  | 'close-command-unavailable'
  | 'close-failed';

export type CleanupDecision =
  | { outcome: 'keep'; reason: KeepReason; idleForMs: number }
  | { outcome: CleanupAction; idleForMs: number };

export interface CleanupSnapshot {
  now: number;
  lastActivityAt: number;
  idleMs: number;
  enabled: boolean;
  hasWorkspace: boolean;
  focused: boolean;
  active: boolean;
  dirtyEditors: number;
  protectDirtyEditors: boolean;
  action: CleanupAction;
}

export function decideCleanup(snapshot: CleanupSnapshot): CleanupDecision {
  const idleForMs = Math.max(0, snapshot.now - snapshot.lastActivityAt);

  if (!snapshot.enabled) {
    return { outcome: 'keep', reason: 'disabled', idleForMs };
  }
  if (!snapshot.hasWorkspace) {
    return { outcome: 'keep', reason: 'empty-window', idleForMs };
  }
  if (snapshot.focused) {
    return { outcome: 'keep', reason: 'focused', idleForMs };
  }
  if (snapshot.active) {
    return { outcome: 'keep', reason: 'active', idleForMs };
  }
  if (idleForMs < snapshot.idleMs) {
    return { outcome: 'keep', reason: 'not-idle', idleForMs };
  }
  if (snapshot.protectDirtyEditors && snapshot.dirtyEditors > 0) {
    return { outcome: 'keep', reason: 'dirty-editor', idleForMs };
  }

  return { outcome: snapshot.action, idleForMs };
}
