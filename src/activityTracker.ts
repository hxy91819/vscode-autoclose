import type { Memento, WindowState } from 'vscode';
import type { Clock } from './clock';

const LAST_ACTIVITY_KEY = 'lastActivityAt';

export class ActivityTracker {
  private lastActivityAt = 0;

  public constructor(
    private readonly storage: Memento,
    private readonly clock: Clock,
  ) {}

  public async initialize(): Promise<void> {
    const storedValue = this.storage.get<number>(LAST_ACTIVITY_KEY);
    this.lastActivityAt = storedValue ?? this.clock.now();

    if (storedValue === undefined) {
      await this.storage.update(LAST_ACTIVITY_KEY, this.lastActivityAt);
    }
  }

  public getLastActivityAt(): number {
    return this.lastActivityAt;
  }

  public async markActivity(): Promise<void> {
    this.lastActivityAt = this.clock.now();
    await this.storage.update(LAST_ACTIVITY_KEY, this.lastActivityAt);
  }
}

export function windowTransitionShowsActivity(
  previous: WindowState,
  current: WindowState,
): boolean {
  const leftInteractiveState =
    (previous.focused && !current.focused) ||
    (previous.active && !current.active);

  return current.focused || current.active || leftInteractiveState;
}
