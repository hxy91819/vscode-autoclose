import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import * as vscode from 'vscode';

const EXTENSION_ID = 'local-poc.stale-window-cleaner';
const CLOSE_COMMAND = 'staleWindowCleaner.e2e.closeWindow';

suite('Stale Window Cleaner close smoke', () => {
  test('closes the isolated VS Code window through the extension', async () => {
    const markerPath = process.env.STALE_WINDOW_CLEANER_CLOSE_MARKER;
    assert.ok(markerPath, 'the outer runner must provide a close marker path');
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(
      extension,
      `${EXTENSION_ID} should be installed in the test host`,
    );
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes(CLOSE_COMMAND),
      'the close smoke command should exist only in ExtensionMode.Test',
    );
    await vscode.workspace
      .getConfiguration('files')
      .update(
        'hotExit',
        'onExitAndWindowClose',
        vscode.ConfigurationTarget.Global,
      );
    const document = await vscode.workspace.openTextDocument({
      content: 'autoclose hot exit recovery test',
    });
    await vscode.window.showTextDocument(document);
    assert.equal(document.isDirty, true);
    // Model the reconnect dialog: closing must not require dismissing it first.
    void vscode.window.showWarningMessage(
      'Cannot reconnect. Please reload the window.',
      { modal: true },
      'Reload Window',
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    writeFileSync(markerPath, 'close command invoked\n', 'utf8');

    await vscode.commands.executeCommand(CLOSE_COMMAND);
    await new Promise(() => undefined);
  });
});
