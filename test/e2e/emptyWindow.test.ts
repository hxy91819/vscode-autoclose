import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { CleanupDecision } from '../../src/cleanupDecision';
import type { WindowReport } from '../../src/windowRegistry';

suite('Empty window cleanup', () => {
  test('activates overview in an empty window and includes it in the reports', async () => {
    assert.equal(vscode.workspace.workspaceFolders, undefined);
    const reports = await vscode.commands.executeCommand<WindowReport[]>(
      'staleWindowCleaner.showAllWindows',
    );
    assert.ok(reports?.some((report) => report.label === 'Empty Window'));
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  test('recognizes an idle clean empty window as a close candidate', async () => {
    const decision = await vscode.commands.executeCommand<CleanupDecision>(
      'staleWindowCleaner.runCleanupCheck',
      {
        forceIdle: true,
        ignoreFocused: true,
        ignoreActive: true,
        dryRun: true,
      },
    );
    assert.equal(decision?.outcome, 'close');
  });

  test('allows unsaved notes by default and supports explicit dirty protection', async () => {
    const config = vscode.workspace.getConfiguration('staleWindowCleaner');
    const original = config.inspect<boolean>(
      'protectDirtyEditors',
    )?.globalValue;
    const document = await vscode.workspace.openTextDocument({
      content: 'unsaved notes',
    });
    await vscode.window.showTextDocument(document);
    assert.equal(document.isDirty, true);
    const options = {
      forceIdle: true,
      ignoreFocused: true,
      ignoreActive: true,
      dryRun: true,
    };
    const aggressiveDecision =
      await vscode.commands.executeCommand<CleanupDecision>(
        'staleWindowCleaner.runCleanupCheck',
        options,
      );
    assert.equal(aggressiveDecision?.outcome, 'close');
    await config.update(
      'protectDirtyEditors',
      true,
      vscode.ConfigurationTarget.Global,
    );
    try {
      const decision = await vscode.commands.executeCommand<CleanupDecision>(
        'staleWindowCleaner.runCleanupCheck',
        {
          forceIdle: true,
          ignoreFocused: true,
          ignoreActive: true,
          dryRun: true,
        },
      );
      assert.equal(decision?.outcome, 'keep');
      assert.equal(
        decision?.outcome === 'keep' && decision.reason,
        'dirty-editor',
      );
    } finally {
      await vscode.commands.executeCommand(
        'workbench.action.revertAndCloseActiveEditor',
      );
      await config.update(
        'protectDirtyEditors',
        original,
        vscode.ConfigurationTarget.Global,
      );
    }
  });
});
