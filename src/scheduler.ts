import * as vscode from 'vscode';
import type { ActivityTracker } from './activityTracker';
import type { Clock } from './clock';
import {
  decideCleanup,
  type CleanupDecision,
  type CleanupSnapshot,
} from './cleanupDecision';
import { readConfig, type CleanupAction } from './config';
import type { Logger } from './logger';
import type { WindowCloser } from './windowCloser';
import { getWorkspaceIdentity } from './workspaceIdentity';

export interface SweepOptions {
  forceIdle?: boolean;
  ignoreFocused?: boolean;
  ignoreActive?: boolean;
  dryRun?: boolean;
  actionOverride?: CleanupAction;
}

const REASON_LABELS: Record<string, string> = {
  disabled: '插件已禁用',
  focused: '窗口当前有焦点',
  active: '窗口近期仍有用户活动',
  'not-idle': '尚未达到闲置阈值',
  'dirty-editor': '存在未保存的标签页',
  'close-command-unavailable': '关闭窗口命令不可用',
  'close-failed': '关闭窗口失败，请查看 Stale Window Cleaner 输出',
};

export class CleanupScheduler {
  private lastNotifiedActivityAt: number | undefined;
  private lastCheck:
    | { at: number; trigger: string; decision: CleanupDecision }
    | undefined;
  private readonly changes = new vscode.EventEmitter<void>();
  public readonly onDidChange = this.changes.event;

  public dispose(): void {
    this.changes.dispose();
  }

  public constructor(
    private readonly tracker: ActivityTracker,
    private readonly closer: WindowCloser,
    private readonly logger: Logger,
    private readonly clock: Clock,
  ) {}

  public activityRecorded(): void {
    this.lastNotifiedActivityAt = undefined;
    this.changes.fire();
  }

  public inspect(options: SweepOptions = {}): CleanupDecision {
    return decideCleanup(this.snapshot(options));
  }

  public snapshot(options: SweepOptions = {}): CleanupSnapshot {
    const config = readConfig();
    const windowState = vscode.window.state;
    const now = this.clock.now();
    const dirtyEditors = vscode.window.tabGroups.all.reduce(
      (count, group) => count + group.tabs.filter((tab) => tab.isDirty).length,
      0,
    );

    return {
      now,
      lastActivityAt: options.forceIdle
        ? now - config.idleMs
        : this.tracker.getLastActivityAt(),
      idleMs: config.idleMs,
      enabled: config.enabled,
      hasWorkspace: getWorkspaceIdentity() !== undefined,
      focused: options.ignoreFocused ? false : windowState.focused,
      active: options.ignoreActive ? false : windowState.active,
      dirtyEditors,
      protectDirtyEditors: config.protectDirtyEditors,
      action: options.actionOverride ?? config.action,
    };
  }

  public async sweep(
    trigger: string,
    options: SweepOptions = {},
  ): Promise<CleanupDecision> {
    const state = vscode.window.state;
    if (state.focused || state.active) {
      await this.tracker.markActivity();
      this.activityRecorded();
    }

    let decision = this.inspect(options);

    if (options.dryRun) {
      return decision;
    }

    if (decision.outcome === 'notify') {
      this.notifyOnce(decision.idleForMs);
    } else if (decision.outcome === 'close') {
      decision = await this.closeIfStillSafe(options);
    }

    this.lastCheck = { at: this.clock.now(), trigger, decision };
    this.logger.info(
      `${trigger}: ${describeDecision(decision)}; idle=${formatDuration(decision.idleForMs)}`,
    );
    this.changes.fire();
    return decision;
  }

  public statusLabel(): string {
    const config = readConfig();
    const decision = this.inspect();
    if (decision.outcome === 'keep' && decision.reason === 'disabled') {
      return '$(circle-slash) Auto Close: Off';
    }
    if (decision.outcome === 'keep' && decision.reason === 'dirty-editor') {
      return '$(lock) Auto Close: Unsaved';
    }
    if (
      this.lastCheck?.decision.outcome === 'keep' &&
      this.lastCheck.decision.reason === 'close-failed'
    ) {
      return '$(warning) Auto Close: Failed';
    }
    if (config.action === 'close' && !this.closer.canClose()) {
      return '$(warning) Auto Close: Unavailable';
    }
    const mode = config.action === 'notify' ? 'Notify' : 'Auto Close';
    return `$(clock) ${mode}: ${formatDuration(decision.idleForMs)} / ${config.idleHours}h`;
  }

  public statusText(options: SweepOptions = {}): string {
    const identity = getWorkspaceIdentity();
    const config = readConfig();
    const decision = this.inspect(options);
    const status =
      decision.outcome === 'keep'
        ? `Protected — ${REASON_LABELS[decision.reason]}`
        : decision.outcome === 'notify'
          ? 'Stale — notify 模式，不会自动关闭'
          : this.closer.canClose()
            ? 'Stale — 可安全关闭'
            : 'Stale — 当前 VS Code 不支持关闭命令';

    return [
      `Workspace: ${identity?.label ?? 'Empty Window'}`,
      options.forceIdle
        ? `Idle: simulated ${formatDuration(decision.idleForMs)}`
        : `Last used: ${formatDuration(decision.idleForMs)} ago`,
      `Threshold: ${config.idleHours}h`,
      `Action: ${config.action}`,
      `Protect unsaved tabs: ${config.protectDirtyEditors}`,
      `Hot Exit: ${vscode.workspace.getConfiguration('files').get<string>('hotExit', 'onExit')}`,
      `Check interval: ${config.checkIntervalMinutes}m`,
      `Status: ${status}`,
      this.lastCheck
        ? `Last check: ${new Date(this.lastCheck.at).toISOString()} (${this.lastCheck.trigger}) — ${describeDecision(this.lastCheck.decision)}${this.lastCheck.decision.outcome === 'keep' ? `: ${REASON_LABELS[this.lastCheck.decision.reason]}` : ''}`
        : 'Last check: pending',
    ].join('\n');
  }

  private notifyOnce(idleForMs: number): void {
    const activityAt = this.tracker.getLastActivityAt();
    if (this.lastNotifiedActivityAt === activityAt) {
      return;
    }

    this.lastNotifiedActivityAt = activityAt;
    void vscode.window.showWarningMessage(
      `Stale Window Cleaner：此窗口已闲置 ${formatDuration(idleForMs)}。当前为 notify 模式，不会关闭。`,
    );
  }

  private async closeIfStillSafe(
    options: SweepOptions,
  ): Promise<CleanupDecision> {
    const latestDecision = this.inspect(options);
    if (latestDecision.outcome !== 'close') {
      this.logger.info(
        `close cancelled after final safety check: ${describeDecision(latestDecision)}`,
      );
      return latestDecision;
    }

    try {
      if (!(await this.closer.close())) {
        this.logger.warn(
          'close skipped because the VS Code close command is unavailable',
        );
        return {
          outcome: 'keep',
          reason: 'close-command-unavailable',
          idleForMs: latestDecision.idleForMs,
        };
      }
      return latestDecision;
    } catch (error) {
      this.logger.warn(
        `close failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        outcome: 'keep',
        reason: 'close-failed',
        idleForMs: latestDecision.idleForMs,
      };
    }
  }
}

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

export function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function describeDecision(decision: CleanupDecision): string {
  if (decision.outcome === 'keep') {
    return `keep (${decision.reason})`;
  }
  return decision.outcome;
}
