# Changelog

## 0.0.6

- Run exclusively in the local UI extension host so Remote-SSH disconnections do not remove the cleanup command path. Install this version locally and reload existing windows.
- Add a clickable status-bar indicator with idle progress and cleanup diagnostics, including the last completed check.
- Report unavailable and failed Close Window commands as skipped/failed cleanup rather than returning a close decision; retain the result of the final safety check.
- Test actual window closure with a modal reconnect-style warning open.
- Add development launch configuration, CI, dependency updates, and public installation documentation.

## 0.0.5

- Previous prototype: workspace-host cleanup, a 24-hour idle threshold, unsaved-tab protection, and a 10-second quick test.
