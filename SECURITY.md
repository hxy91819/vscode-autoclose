# Security

Report vulnerabilities privately through [GitHub security advisories](https://github.com/hxy91819/vscode-autoclose/security/advisories/new). Please include the affected version and a minimal reproduction without credentials or private workspace content.

The latest release receives fixes. This extension runs in the local UI extension host and can invoke VS Code's Close Window command. It stores the last activity timestamp in workspace storage and local window-status records (workspace label, timing, and cleanup configuration) in the profile’s extension storage; it does not send telemetry or workspace content to a server.

Do not commit credentials, private keys, local logs, or machine-specific configuration. Development dependencies are checked with `npm audit`; CI also scans for accidentally committed secrets.
