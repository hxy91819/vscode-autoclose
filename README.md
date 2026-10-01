# Stale Window Cleaner

Automatically close idle VS Code workspace windows, including Remote-SSH windows, while keeping windows with unsaved changes open. Runs in the **local UI extension host**, so an SSH disconnect does not remove the cleanup timer or the local Close Window command.

[中文说明](#中文说明) · [Releases](https://github.com/hxy91819/vscode-autoclose/releases) · MIT

## Install

Requires desktop VS Code 1.89 or later.

1. Download the `.vsix` from [Releases](https://github.com/hxy91819/vscode-autoclose/releases).
2. In your **local** VS Code window, run **Extensions: Install from VSIX…** and select the file. For Remote-SSH, install locally rather than on the SSH host.
3. Reload existing windows. The status bar shows **Auto Close**; click it for details.

The extension ID remains `local-poc.stale-window-cleaner` for compatibility with existing installations. This project is distributed as a VSIX; it is not currently published on the VS Code Marketplace.

**Upgrading from 0.0.5:** that version ran on the SSH host and could not clean up a disconnected window. Install 0.0.6 locally and reload. The local extension host uses its own workspace storage, so the idle timer may start fresh after migration.

## Behavior and settings

By default, a workspace must be idle for **24 hours**. Checks run at startup and every **30 minutes**. Entering or leaving a focused/active state records activity. Focusing the window again resets its idle timer. The last activity timestamp persists across restarts in the extension host's workspace storage.

Windows stay open when the extension is disabled, no workspace is open, the window is focused/active, the idle threshold has not elapsed, or an editor tab has unsaved changes. VS Code may also request confirmation before closing, such as for running terminal processes; the extension does not bypass those prompts.

| Setting                                   | Default | Meaning                                 |
| ----------------------------------------- | ------- | --------------------------------------- |
| `staleWindowCleaner.enabled`              | `true`  | Enable cleanup                          |
| `staleWindowCleaner.idleHours`            | `24`    | Idle threshold in hours; minimum `0.01` |
| `staleWindowCleaner.checkIntervalMinutes` | `30`    | Check interval; minimum `1` minute      |
| `staleWindowCleaner.action`               | `close` | `close` or `notify`                     |
| `staleWindowCleaner.protectDirtyEditors`  | `true`  | Preserve windows with unsaved tabs      |

For an observation-only trial:

```json
{
  "staleWindowCleaner.idleHours": 0.01,
  "staleWindowCleaner.checkIntervalMinutes": 1,
  "staleWindowCleaner.action": "notify"
}
```

## Verify and troubleshoot

The status bar shows idle progress, disabled state, unsaved-change protection when a window becomes stale, and unavailable or failed close commands. Its tooltip and **Stale Window Cleaner: Show Status** show the current reason and the most recent completed check. Logs appear in **Output → Stale Window Cleaner**.

To verify quickly, open a disposable workspace window with all files saved, run **Stale Window Cleaner: Start 10-Second Test**, then switch to another application or window. With the default `close` action, the test window should close after 10 seconds. The quick test simulates an elapsed idle threshold and ignores the command's recent-activity delay; it still checks focus, unsaved tabs, enabled state, and availability of the close command. It does not overwrite the saved idle timestamp.

Other commands:

- **Reset Idle Timer** records activity now.
- **Run Cleanup Check** runs a normal check immediately. Bringing a window into focus to run the command also counts as activity.

This is an early release. Empty windows are excluded. Task/debug-session protection, workspace exclusions, and a grace period are not implemented. Remote-SSH disconnection support depends on the extension being installed locally. A reconnect dialog does not count as user activity by itself; focusing its window does.

## Development

Use Node.js 24 and npm:

```bash
npm ci
npm run format:check
npm test
npm run test:e2e
npm audit
npm run package
```

Press `F5` to launch an isolated Extension Development Host. `npm run watch` recompiles during development.

Unit tests cover idle persistence and cleanup decisions. Integration tests use a real VS Code 1.89.1 extension host to verify activation, UI-host placement, commands, quick checks, dirty-tab protection, close failures, and status-bar feedback. A separate isolated window tests actual closing while a modal reconnect-style warning is displayed. Linux without a display uses `xvfb-run` (install Xvfb first); macOS and Windows launch directly. The modal test models a reconnect warning; it does not establish a live SSH connection.

CI runs formatting, compilation, tests, dependency audit, and secret scanning. Dependabot maintains npm and GitHub Actions dependencies. Report reproducible problems in [Issues](https://github.com/hxy91819/vscode-autoclose/issues), including the extension version, local/SSH context, settings, and relevant redacted output. See [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## 中文说明

这是一个按闲置时间清理 VS Code 工作区窗口的扩展。默认闲置 **24 小时**后关闭，每 **30 分钟**检查一次；有未保存内容、正在使用或尚未达到阈值的窗口会保留。

从 [Releases](https://github.com/hxy91819/vscode-autoclose/releases) 下载 VSIX，在**本地**执行 **Extensions: Install from VSIX…**，然后重新加载窗口。Remote-SSH 场景也要装在本地。0.0.5 在远端运行，SSH 断开后无法关闭本地窗口；0.0.6 改为本地执行。升级后，闲置计时可能从本地安装时重新开始。

安装后状态栏会显示 **Auto Close**，点击即可查看闲置时间、配置、保留原因及最近检查结果。详细日志位于 **输出 → Stale Window Cleaner**。

快速验证：在所有文件已保存的测试窗口运行 **Stale Window Cleaner: Start 10-Second Test**，立即切换到其他窗口。默认配置下，测试窗口应在 10 秒后关闭。希望只观察时，将 `staleWindowCleaner.action` 设置为 `notify`。

窗口因未保存内容被保留属于预期行为。终端等组件可能额外要求关闭确认，扩展不会跳过这些提示。当前尚未实现任务/调试会话保护、工作区排除和关闭宽限期。
