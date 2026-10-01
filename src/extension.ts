import * as vscode from 'vscode';
import {
  ActivityTracker,
  windowTransitionShowsActivity,
} from './activityTracker';
import { systemClock } from './clock';
import { readConfig } from './config';
import { Logger } from './logger';
import { CleanupScheduler, type SweepOptions } from './scheduler';
import { WindowCloser } from './windowCloser';
import { StatusIndicator } from './statusIndicator';
import path from 'node:path';
import { WindowRegistry } from './windowRegistry';
import { WindowOverview } from './windowOverview';

let activeRegistry: WindowRegistry | undefined;

interface QuickTestOptions {
  delayMs?: number;
  ignoreFocused?: boolean;
  dryRun?: boolean;
}

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const logger = new Logger();
  const tracker = new ActivityTracker(context.workspaceState, systemClock);
  await tracker.initialize();

  if (vscode.window.state.focused || vscode.window.state.active) {
    await tracker.markActivity();
  }

  const closer = await WindowCloser.create(logger);
  const scheduler = new CleanupScheduler(tracker, closer, logger, systemClock);
  let previousWindowState = vscode.window.state;
  let interval: ReturnType<typeof setInterval> | undefined;
  let quickTestTimeout: ReturnType<typeof setTimeout> | undefined;
  let nextCheckAt = Date.now() + readConfig().checkIntervalMs;
  const registry = new WindowRegistry(
    path.join(context.globalStorageUri.fsPath, 'windows'),
  );
  activeRegistry = registry;
  const overview = new WindowOverview(
    registry,
    scheduler,
    logger,
    () => nextCheckAt,
    closer.canClose(),
  );

  const restartInterval = (): void => {
    if (interval) {
      clearInterval(interval);
    }

    const intervalMs = readConfig().checkIntervalMs;
    nextCheckAt = Date.now() + intervalMs;
    interval = setInterval(() => {
      nextCheckAt = Date.now() + intervalMs;
      void scheduler.sweep('interval');
    }, intervalMs);
  };

  context.subscriptions.push(
    logger,
    scheduler,
    overview,
    new StatusIndicator(scheduler),
    vscode.window.onDidChangeWindowState((currentState) => {
      if (windowTransitionShowsActivity(previousWindowState, currentState)) {
        void tracker.markActivity().then(() => scheduler.activityRecorded());
      }
      previousWindowState = currentState;
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('staleWindowCleaner')) {
        restartInterval();
        scheduler.activityRecorded();
        void scheduler.sweep('configuration changed');
      }
    }),
    vscode.commands.registerCommand('staleWindowCleaner.showAllWindows', () =>
      overview.show(),
    ),
    vscode.commands.registerCommand(
      'staleWindowCleaner.showStatus',
      async () => {
        const status = scheduler.statusText();
        logger.info(status.replaceAll('\n', '; '));
        await vscode.window.showInformationMessage(status, { modal: true });
      },
    ),
    vscode.commands.registerCommand(
      'staleWindowCleaner.resetIdleTimer',
      async () => {
        await tracker.markActivity();
        scheduler.activityRecorded();
        logger.info('idle timer reset manually');
        await vscode.window.showInformationMessage(
          'Stale Window Cleaner：闲置计时已重置。',
        );
      },
    ),
    vscode.commands.registerCommand(
      'staleWindowCleaner.runCleanupCheck',
      async (options: SweepOptions = {}) => {
        const effectiveOptions = options.dryRun ? options : {};
        const decision = await scheduler.sweep('manual', effectiveOptions);
        if (!options.dryRun) {
          await vscode.window.showInformationMessage(scheduler.statusText(), {
            modal: true,
          });
        }
        return decision;
      },
    ),
    vscode.commands.registerCommand(
      'staleWindowCleaner.startQuickTest',
      (options: QuickTestOptions = {}) => {
        if (quickTestTimeout) {
          clearTimeout(quickTestTimeout);
        }

        if (!options.dryRun) {
          void vscode.window.showInformationMessage(
            'Stale Window Cleaner：10 秒快速测试已开始，请立即切换到另一个窗口。',
          );
        }

        return new Promise((resolve) => {
          quickTestTimeout = setTimeout(
            async () => {
              quickTestTimeout = undefined;
              const sweepOptions: SweepOptions = {
                forceIdle: true,
                ignoreActive: true,
                ignoreFocused: options.dryRun ? options.ignoreFocused : false,
                dryRun: options.dryRun,
              };
              const decision = await scheduler.sweep(
                '10-second quick test',
                sweepOptions,
              );
              if (decision.outcome === 'keep' && !options.dryRun) {
                await vscode.window.showWarningMessage(
                  `Stale Window Cleaner：快速测试未执行动作。${scheduler.statusText(sweepOptions)}`,
                  { modal: true },
                );
              }
              resolve(decision);
            },
            Math.max(0, options.delayMs ?? 10_000),
          );
        });
      },
    ),
    {
      dispose: () => {
        if (interval) {
          clearInterval(interval);
        }
        if (quickTestTimeout) {
          clearTimeout(quickTestTimeout);
        }
      },
    },
  );

  if (context.extensionMode === vscode.ExtensionMode.Test) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'staleWindowCleaner.e2e.closeWindow',
        () =>
          scheduler.sweep('end-to-end close smoke', {
            forceIdle: true,
            ignoreFocused: true,
            ignoreActive: true,
            actionOverride: 'close',
          }),
      ),
    );
  }

  restartInterval();
  logger.info('extension activated');
  void scheduler.sweep('startup');
}

export async function deactivate(): Promise<void> {
  await activeRegistry?.dispose();
  activeRegistry = undefined;
}
