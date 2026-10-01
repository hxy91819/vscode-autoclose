import * as vscode from 'vscode';
import { decideCleanup } from './cleanupDecision';
import {
  formatDuration,
  reasonLabel,
  type CleanupScheduler,
} from './scheduler';
import type { Logger } from './logger';
import { getWorkspaceIdentity } from './workspaceIdentity';
import { readConfig } from './config';
import {
  HEARTBEAT_MS,
  WindowRegistry,
  type WindowReport,
} from './windowRegistry';

export class WindowOverview implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly interval: ReturnType<typeof setInterval>;
  private readonly subscriptions: vscode.Disposable[];
  private disposed = false;

  public constructor(
    private readonly registry: WindowRegistry,
    private readonly scheduler: CleanupScheduler,
    private readonly logger: Logger,
    private readonly nextCheckAt: () => number,
    private readonly closeSupported: boolean,
  ) {
    this.subscriptions = [
      scheduler.onDidChange(() => this.update()),
      vscode.window.tabGroups.onDidChangeTabs(() => this.update()),
      vscode.window.tabGroups.onDidChangeTabGroups(() => this.update()),
    ];
    this.interval = setInterval(() => this.update(), HEARTBEAT_MS);
    this.update();
  }

  public async reports(): Promise<WindowReport[]> {
    await this.publish();
    return this.registry.list();
  }

  public async show(): Promise<WindowReport[]> {
    const reports = await this.reports();
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'staleWindowCleaner.overview',
        'Stale Window Cleaner: All Windows',
        vscode.ViewColumn.Active,
        {},
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    } else {
      this.panel.reveal();
    }
    this.panel.webview.html = renderOverview(reports, this.registry.id);
    this.logger.info(
      `All windows: ${reports.length}\n${reports.map((report) => `${report.label}; last activity=${new Date(report.snapshot.lastActivityAt).toISOString()}; ${windowEstimate(report)}`).join('\n')}`,
    );
    return reports;
  }

  private async publish(): Promise<void> {
    const identity = getWorkspaceIdentity();
    const authority =
      vscode.workspace.workspaceFile?.authority ??
      vscode.workspace.workspaceFolders?.[0]?.uri.authority;
    await this.registry.publish({
      label: `${identity?.label ?? 'Empty Window'}${authority ? ` [${authority}]` : ''}`,
      snapshot: this.scheduler.snapshot(),
      nextCheckAt: this.nextCheckAt(),
      checkIntervalMs: readConfig().checkIntervalMs,
      closeSupported: this.closeSupported,
    });
  }

  private update(): void {
    if (this.disposed) return;
    void this.reports()
      .then((reports) => {
        if (this.panel)
          this.panel.webview.html = renderOverview(reports, this.registry.id);
      })
      .catch((error) =>
        this.logger.warn(`window overview update failed: ${String(error)}`),
      );
  }

  public dispose(): void {
    this.disposed = true;
    clearInterval(this.interval);
    for (const subscription of this.subscriptions) subscription.dispose();
    this.panel?.dispose();
    void this.registry
      .dispose()
      .catch((error) =>
        this.logger.warn(`window record removal failed: ${String(error)}`),
      );
  }
}

export function windowEstimate(report: WindowReport, now = Date.now()): string {
  const decision = decideCleanup({
    ...report.snapshot,
    now,
    lastActivityAt: Math.min(
      report.snapshot.lastActivityAt,
      now - report.snapshot.idleMs,
    ),
  });
  if (decision.outcome === 'keep' && decision.reason !== 'not-idle') {
    return `暂不清理：${reasonLabel(decision.reason)}`;
  }
  if (report.snapshot.action === 'close' && !report.closeSupported)
    return '暂不清理：关闭命令不可用';
  const thresholdAt = report.snapshot.lastActivityAt + report.snapshot.idleMs;
  // A missed heartbeat/check can be delayed after sleep; never promise an overdue timestamp.
  const firstCheck = Math.max(now, report.nextCheckAt);
  const due =
    firstCheck +
    Math.max(
      0,
      Math.ceil((thresholdAt - firstCheck) / report.checkIntervalMs),
    ) *
      report.checkIntervalMs;
  const action = report.snapshot.action === 'notify' ? '通知' : '清理';
  const unsaved =
    report.snapshot.dirtyEditors > 0 && report.snapshot.action === 'close'
      ? '；有未保存内容，VS Code 可能要求确认'
      : '';
  return `预计${action}：${new Date(due).toLocaleString()}（约 ${formatDuration(Math.max(0, due - now))} 后）${unsaved}`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );
}

function renderOverview(reports: WindowReport[], currentId: string): string {
  const now = Date.now();
  const rows = reports
    .map(
      (report) =>
        `<tr><td>${escapeHtml(report.label)}${report.id === currentId ? '（当前窗口）' : ''}<br><small>${escapeHtml(report.id.slice(0, 8))}</small></td><td>${escapeHtml(new Date(report.snapshot.lastActivityAt).toLocaleString())}<br>闲置 ${formatDuration(Math.max(0, now - report.snapshot.lastActivityAt))}</td><td>${report.snapshot.idleMs / 3_600_000}h / ${report.checkIntervalMs / 60_000}m</td><td>${escapeHtml(windowEstimate(report, now))}</td><td>${escapeHtml(new Date(report.nextCheckAt).toLocaleString())}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:20px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top;overflow-wrap:anywhere}small,p{color:var(--vscode-descriptionForeground)}</style></head><body><h1>窗口清理概况 · ${reports.length} 个窗口</h1><p>最后更新：${escapeHtml(new Date(now).toLocaleString())}。约每 30 秒刷新。仅显示本机同一 VS Code 配置文件下已运行新版插件的窗口；升级后请重新加载已有窗口。</p><table><thead><tr><th>窗口</th><th>最后活动</th><th>阈值 / 检查间隔</th><th>清理计划或保留原因</th><th>下一次检查</th></tr></thead><tbody>${rows}</tbody></table><p>预计时间以窗口继续闲置、VS Code 允许完成关闭为前提；未保存内容会走 VS Code 的备份或保存确认流程。进入窗口会重置计时。电脑休眠或 VS Code 关闭时不会执行检查。</p></body></html>`;
}
