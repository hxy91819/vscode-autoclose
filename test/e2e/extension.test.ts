import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { CleanupDecision } from '../../src/cleanupDecision';
import type { SweepOptions } from '../../src/scheduler';
import { CleanupScheduler } from '../../src/scheduler';
import type { ActivityTracker } from '../../src/activityTracker';
import type { Logger } from '../../src/logger';
import type { WindowCloser } from '../../src/windowCloser';
import { StatusIndicator } from '../../src/statusIndicator';

const EXTENSION_ID = 'local-poc.stale-window-cleaner';
const RUN_CHECK_COMMAND = 'staleWindowCleaner.runCleanupCheck';
const QUICK_TEST_COMMAND = 'staleWindowCleaner.startQuickTest';

const simulatedIdleCheck: SweepOptions = {
  forceIdle: true,
  ignoreFocused: true,
  ignoreActive: true,
  dryRun: true,
};

suite('Stale Window Cleaner end-to-end', () => {
  test('loads in a real extension host and registers its commands', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(
      extension,
      `${EXTENSION_ID} should be installed in the test host`,
    );

    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.equal(
      extension.extensionKind,
      vscode.ExtensionKind.UI,
      'cleanup must live in the local UI host so SSH loss cannot stop its timer',
    );
    assert.deepEqual(
      extension.packageJSON.extensionKind,
      ['ui'],
      'Remote-SSH must not select the remote workspace host for this extension',
    );
    assert.equal(extension.isActive, true);
    assert.ok(commands.includes('staleWindowCleaner.showStatus'));
    assert.ok(commands.includes('staleWindowCleaner.resetIdleTimer'));
    assert.ok(commands.includes(RUN_CHECK_COMMAND));
    assert.ok(commands.includes(QUICK_TEST_COMMAND));
    assert.ok(commands.includes('workbench.action.closeWindow'));
  });

  test('recognizes a clean workspace as a stale close candidate', async () => {
    const config = vscode.workspace.getConfiguration('staleWindowCleaner');
    assert.equal(config.get('idleHours'), 24);
    assert.equal(config.get('action'), 'close');

    const decision = await vscode.commands.executeCommand<CleanupDecision>(
      RUN_CHECK_COMMAND,
      simulatedIdleCheck,
    );

    assert.equal(decision.outcome, 'close');
  });

  test('runs the quick-test path without waiting for active to decay', async () => {
    const decision = await vscode.commands.executeCommand<CleanupDecision>(
      QUICK_TEST_COMMAND,
      { delayMs: 1, ignoreFocused: true, dryRun: true },
    );

    assert.equal(decision.outcome, 'close');
  });

  test('reports an unavailable close command as a skipped cleanup', async () => {
    const scheduler = schedulerWithCloser({
      canClose: () => false,
      close: async () => false,
    });

    const decision = await scheduler.sweep('test', {
      ...simulatedIdleCheck,
      dryRun: false,
    });

    assert.equal(decision.outcome, 'keep');
    assert.equal(
      'reason' in decision && decision.reason,
      'close-command-unavailable',
    );
    assert.match(
      scheduler.statusText(),
      /Last check: .*close-command-unavailable/,
    );
    scheduler.dispose();
  });

  test('reports a failed close command instead of claiming cleanup succeeded', async () => {
    const scheduler = schedulerWithCloser({
      canClose: () => true,
      close: async () => {
        throw new Error('test close failure');
      },
    });

    const decision = await scheduler.sweep('test', {
      ...simulatedIdleCheck,
      dryRun: false,
    });

    assert.equal(decision.outcome, 'keep');
    assert.equal('reason' in decision && decision.reason, 'close-failed');
    assert.match(scheduler.statusText(), /Last check: .*close-failed/);
    scheduler.dispose();
  });

  test('reports activity detected by the final check and does not close', async () => {
    const now = Date.now();
    let reads = 0;
    let closeCalled = false;
    const tracker = {
      getLastActivityAt: () => (++reads === 1 ? 0 : now),
      markActivity: async () => undefined,
    } as unknown as ActivityTracker;
    const scheduler = schedulerWithCloser(
      {
        canClose: () => true,
        close: async () => {
          closeCalled = true;
          return true;
        },
      },
      tracker,
    );
    try {
      const decision = await scheduler.sweep('test', {
        ignoreFocused: true,
        ignoreActive: true,
      });
      assert.equal(decision.outcome, 'keep');
      assert.equal('reason' in decision && decision.reason, 'not-idle');
      assert.equal(closeCalled, false);
    } finally {
      scheduler.dispose();
    }
  });

  test('shows live cleanup results and disabled state in the status bar', async () => {
    const scheduler = schedulerWithCloser({
      canClose: () => false,
      close: async () => false,
    });
    const indicator = new StatusIndicator(scheduler);
    const config = vscode.workspace.getConfiguration('staleWindowCleaner');
    const originalEnabled = config.inspect<boolean>('enabled')?.workspaceValue;
    try {
      assert.match(indicator.item.text, /Auto Close: Unavailable/);
      assert.equal(indicator.item.command, 'staleWindowCleaner.showStatus');
      await scheduler.sweep('status test', {
        ...simulatedIdleCheck,
        dryRun: false,
      });
      assert.match(
        String(indicator.item.tooltip),
        /Last check: .*close-command-unavailable/,
      );
      await config.update(
        'enabled',
        false,
        vscode.ConfigurationTarget.Workspace,
      );
      indicator.refresh();
      assert.match(indicator.item.text, /Auto Close: Off/);
      assert.match(String(indicator.item.tooltip), /插件已禁用/);
    } finally {
      await config.update(
        'enabled',
        originalEnabled,
        vscode.ConfigurationTarget.Workspace,
      );
      indicator.dispose();
      scheduler.dispose();
    }
  });

  test('protects a real dirty editor tab', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, 'the test workspace should be open');
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(workspaceFolder.uri, 'sample.txt'),
    );
    const editor = await vscode.window.showTextDocument(document);

    await editor.edit((builder) => {
      builder.insert(new vscode.Position(0, 0), 'unsaved change\n');
    });
    assert.equal(document.isDirty, true);

    const decision = await vscode.commands.executeCommand<CleanupDecision>(
      RUN_CHECK_COMMAND,
      simulatedIdleCheck,
    );

    assert.equal(decision.outcome, 'keep');
    assert.ok(
      decision.outcome !== 'keep' || decision.reason === 'dirty-editor',
    );

    await vscode.commands.executeCommand('workbench.action.files.revert');
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });
});

function schedulerWithCloser(
  closer: Pick<WindowCloser, 'canClose' | 'close'>,
  activityTracker?: ActivityTracker,
): CleanupScheduler {
  const tracker = {
    getLastActivityAt: () => 0,
    markActivity: async () => undefined,
  } as unknown as ActivityTracker;
  const logger = {
    info: () => undefined,
    warn: () => undefined,
  } as unknown as Logger;
  return new CleanupScheduler(
    activityTracker ?? tracker,
    closer as WindowCloser,
    logger,
    {
      now: Date.now,
    },
  );
}
