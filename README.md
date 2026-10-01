# Stale Window Cleaner

Automatically close idle VS Code windows, including empty and Remote-SSH windows, and see a shared overview of their cleanup schedules. Runs in the **local UI extension host**, so an SSH disconnect does not remove the cleanup timer or the local Close Window command.

[中文说明](#中文说明) · [Releases](https://github.com/hxy91819/vscode-autoclose/releases) · MIT

## Install

Requires desktop VS Code 1.89 or later.

1. Download the `.vsix` from [Releases](https://github.com/hxy91819/vscode-autoclose/releases).
2. In your **local** VS Code window, run **Extensions: Install from VSIX…** and select the file. For Remote-SSH, install locally rather than on the SSH host.
3. Reload existing windows. The status bar shows **Auto Close**; click it for details.

The extension ID remains `local-poc.stale-window-cleaner` for compatibility with existing installations. This project is distributed as a VSIX; it is not currently published on the VS Code Marketplace.

**Upgrading from 0.0.5:** that version ran on the SSH host and could not clean up a disconnected window. Install the latest version locally and reload. The local extension host uses its own workspace storage, so the idle timer may start fresh after migration.

## Behavior and settings

By default, a workspace must be idle for **24 hours**. Checks run at startup and every **30 minutes**. Entering or leaving a focused/active state records activity. Focusing the window again resets its idle timer. The last activity timestamp persists across restarts in the extension host's workspace storage.

Workspace and empty windows use the same idle rules. Windows stay open when the extension is disabled, focused/active, or below the idle threshold. Since 0.0.7, unsaved tabs do not block the extension by default; set `staleWindowCleaner.protectDirtyEditors` to `true` to retain the previous protection. VS Code may also request confirmation before closing, such as for running terminal processes; the extension does not bypass those prompts.

| Setting                                   | Default | Meaning                                         |
| ----------------------------------------- | ------- | ----------------------------------------------- |
| `staleWindowCleaner.enabled`              | `true`  | Enable cleanup                                  |
| `staleWindowCleaner.idleHours`            | `24`    | Idle threshold in hours; minimum `0.01`         |
| `staleWindowCleaner.checkIntervalMinutes` | `30`    | Check interval; minimum `1` minute              |
| `staleWindowCleaner.action`               | `close` | `close` or `notify`                             |
| `staleWindowCleaner.protectDirtyEditors`  | `false` | Preserve windows with unsaved tabs when enabled |

For an observation-only trial:

```json
{
  "staleWindowCleaner.idleHours": 0.01,
  "staleWindowCleaner.checkIntervalMinutes": 1,
  "staleWindowCleaner.action": "notify"
}
```

## All-window overview

Run **Stale Window Cleaner: Show All Windows** to see every live window running this version in the same local VS Code profile. The table includes the last activity time, idle duration, threshold, next check, estimated cleanup time, and reasons a window stays open. It refreshes about every 30 seconds and distinguishes duplicate workspaces and empty windows. Reload existing windows after upgrading so they can report their status. Other profiles, other computers, and windows without a running extension instance are excluded.

Viewing the overview does not focus the other windows or reset their timers. Estimates assume the window remains idle. Focused windows have no current cleanup estimate; unsaved tabs block an estimate only when protection is enabled. Closed windows disappear; reports without a heartbeat for more than 90 seconds are excluded until the host resumes.

## Unsaved editors and Hot Exit

The extension requests a normal VS Code window close. VS Code decides whether to restore unsaved editors through Hot Exit or show a save/confirmation dialog. Backup is not the same as saving files to disk.

For workspace windows, you can enable window-close backups in your **local user settings**:

```json
{
  "files.hotExit": "onExitAndWindowClose",
  "staleWindowCleaner.protectDirtyEditors": false
}
```

On macOS, the default `files.hotExit: "onExit"` does not generally suppress confirmation for closing an individual window. Empty windows can still prompt for unsaved notes even with `onExitAndWindowClose`. The extension does not change your Hot Exit setting or bypass native confirmations. To keep every window with unsaved tabs open, set `protectDirtyEditors` to `true`.

## Verify and troubleshoot

The status bar shows idle progress, disabled state, unsaved-change protection when a window becomes stale, and unavailable or failed close commands. Its tooltip and **Stale Window Cleaner: Show Status** show the current reason and the most recent completed check. Logs appear in **Output → Stale Window Cleaner**.

To verify quickly, open a disposable workspace window with all files saved, run **Stale Window Cleaner: Start 10-Second Test**, then switch to another application or window. With the default `close` action, the test window should close after 10 seconds. The quick test simulates an elapsed idle threshold and ignores the command's recent-activity delay; it still checks focus, enabled state, availability of the close command, and unsaved tabs when protection is enabled. It does not overwrite the saved idle timestamp.

Other commands:

- **Reset Idle Timer** records activity now.
- **Run Cleanup Check** runs a normal check immediately. Bringing a window into focus to run the command also counts as activity.

This is an early release. Empty windows are included. Task/debug-session protection, workspace exclusions, and a grace period are not implemented. Remote-SSH disconnection support depends on the extension being installed locally. A reconnect dialog does not count as user activity by itself; focusing its window does.

## Development

Use Node.js 24 and npm:

```bash
npm ci
npm run format:check
npm test
npm run test:e2e
# Linux: verify the packaged extension and Hot Exit recovery
npm run test:installed
npm audit
npm run package
```

Press `F5` to launch an isolated Extension Development Host. `npm run watch` recompiles during development.

Unit tests cover idle persistence and cleanup decisions. Integration tests use a real VS Code 1.89.1 extension host to verify activation, UI-host placement, commands, quick checks, dirty-tab protection, close failures, status-bar feedback, and the overview. An empty-window host verifies empty-window cleanup and unsaved-note policies. A separate isolated workspace tests closing unsaved notes with Hot Exit and a modal reconnect-style warning, and confirms the window exits. A separate Linux test of the installed VSIX closes a normal workspace window and reopens it to verify the unsaved note is restored. Linux without a display uses `xvfb-run` (install Xvfb first); macOS and Windows launch directly. The modal test models a reconnect warning; it does not establish a live SSH connection.

CI runs formatting, compilation, tests, dependency audit, and secret scanning. Dependabot maintains npm and GitHub Actions dependencies. Report reproducible problems in [Issues](https://github.com/hxy91819/vscode-autoclose/issues), including the extension version, local/SSH context, settings, and relevant redacted output. See [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## 中文说明

这是一个按闲置时间清理 VS Code 工作区窗口的扩展。默认闲置 **24 小时**后关闭，每 **30 分钟**检查一次；正在使用或尚未达到阈值的窗口会保留，空窗口也参与清理。0.0.7 默认允许未保存标签页进入 VS Code 正常关闭流程，由 VS Code 备份或提示保存。

从 [Releases](https://github.com/hxy91819/vscode-autoclose/releases) 下载 VSIX，在**本地**执行 **Extensions: Install from VSIX…**，然后重新加载窗口。Remote-SSH 场景也要装在本地。0.0.5 在远端运行，SSH 断开后无法关闭本地窗口；0.0.6 起改为本地执行。升级后，闲置计时可能从本地安装时重新开始。

运行 **Stale Window Cleaner: Show All Windows** 可查看所有已运行新版插件的窗口，包括空窗口、闲置时间、预计清理时间和保留原因。只汇总本机同一 VS Code 配置文件内的窗口，约每 30 秒刷新；升级后需重新加载已有窗口。状态栏 **Auto Close** 和 **Show Status** 显示当前窗口详情，详细日志位于 **输出 → Stale Window Cleaner**。

快速验证：在所有文件已保存的测试窗口运行 **Stale Window Cleaner: Start 10-Second Test**，立即切换到其他窗口。默认配置下，测试窗口应在 10 秒后关闭。希望只观察时，将 `staleWindowCleaner.action` 设置为 `notify`。

需要保留所有未保存内容窗口时，将 `staleWindowCleaner.protectDirtyEditors` 设为 `true`。希望工作区关闭时使用 Hot Exit，可在本地用户设置中将 `files.hotExit` 设为 `onExitAndWindowClose`。macOS 空窗口里的未保存临时内容仍可能要求确认；插件使用正常关闭命令，不跳过保存或终端提示。当前尚未实现任务/调试会话保护、工作区排除和关闭宽限期。
