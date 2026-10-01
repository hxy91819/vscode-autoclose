import * as vscode from 'vscode';
import type { CleanupScheduler } from './scheduler';

export class StatusIndicator implements vscode.Disposable {
  public readonly item = vscode.window.createStatusBarItem(
    'staleWindowCleaner.status',
    vscode.StatusBarAlignment.Right,
    10,
  );
  private readonly changeSubscription: vscode.Disposable;
  private readonly interval: ReturnType<typeof setInterval>;

  public constructor(private readonly scheduler: CleanupScheduler) {
    this.item.name = 'Stale Window Cleaner';
    this.item.command = 'staleWindowCleaner.showStatus';
    this.changeSubscription = scheduler.onDidChange(() => this.refresh());
    this.interval = setInterval(() => this.refresh(), 60_000);
    this.refresh();
    this.item.show();
  }

  public refresh(): void {
    this.item.text = this.scheduler.statusLabel();
    this.item.tooltip = `${this.scheduler.statusText()}\nClick for details.`;
  }

  public dispose(): void {
    clearInterval(this.interval);
    this.changeSubscription.dispose();
    this.item.dispose();
  }
}
