# Changelog

## 0.0.9

- Add VS Code Marketplace publication of the tested release VSIX using the existing `MasonHuang` publisher and repository `VSCE_PAT` secret.
- Change the extension ID to `MasonHuang.stale-window-cleaner`. Uninstall the old `local-poc.stale-window-cleaner` extension before installing this version; settings persist, but idle timers and window reports start fresh.

## 0.0.8

- Automatically build, test, and publish VSIX downloads and SHA-256 checksums to GitHub Releases on `vX.Y.Z` tags, with manual reruns for existing tags.

- Automatically enable local `files.hotExit: "onExitAndWindowClose"` when auto-close is enabled and before closing, allowing workspace windows to back up unsaved editors without a save prompt. The setting persists after disabling or uninstalling the extension; empty-window and terminal confirmations can still occur.
- Verify automatic Hot Exit configuration and installed-extension recovery starting with Hot Exit disabled.

## 0.0.7

- Add **Show All Windows**, with a live overview of local-profile windows, last activity, predicted cleanup, next checks, and protection reasons. Reports use local files and independent identities for duplicate/empty windows.
- Include empty windows in idle cleanup using the same focus and activity rules.
- Default `protectDirtyEditors` to `false`: let VS Code handle unsaved editors through normal Hot Exit/save confirmation. Set it to `true` to preserve the previous behavior. The extension does not change `files.hotExit`.
- Show unsaved-tab protection and Hot Exit settings in current-window status.
- Test concurrent window reporting, empty-window cleanup, both unsaved-editor policies, and recovery of unsaved notes after a real Hot Exit close.

## 0.0.6

- Run exclusively in the local UI extension host so Remote-SSH disconnections do not remove the cleanup command path. Install this version locally and reload existing windows.
- Add a clickable status-bar indicator with idle progress and cleanup diagnostics, including the last completed check.
- Report unavailable and failed Close Window commands as skipped/failed cleanup rather than returning a close decision; retain the result of the final safety check.
- Test actual window closure with a modal reconnect-style warning open.
- Add development launch configuration, CI, dependency updates, and public installation documentation.

## 0.0.5

- Previous prototype: workspace-host cleanup, a 24-hour idle threshold, unsaved-tab protection, and a 10-second quick test.
