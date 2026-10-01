import * as vscode from 'vscode';

export class Logger implements vscode.Disposable {
  private readonly channel = vscode.window.createOutputChannel(
    'Stale Window Cleaner',
  );

  public info(message: string): void {
    this.channel.appendLine(`${new Date().toISOString()} ${message}`);
  }

  public warn(message: string): void {
    this.channel.appendLine(`${new Date().toISOString()} WARNING ${message}`);
  }

  public show(): void {
    this.channel.show(true);
  }

  public dispose(): void {
    this.channel.dispose();
  }
}
