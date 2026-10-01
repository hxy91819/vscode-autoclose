# Changelog

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
