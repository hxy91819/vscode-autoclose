import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const cliName =
  process.platform === 'win32' ? 'vscode-test.cmd' : 'vscode-test';
const cliPath = path.join(projectRoot, 'node_modules', '.bin', cliName);
const needsVirtualDisplay =
  process.platform === 'linux' && !process.env.DISPLAY;
const command = needsVirtualDisplay ? 'xvfb-run' : cliPath;
const commandPrefix = needsVirtualDisplay ? ['-a', cliPath] : [];

function runConfiguration(label, env = process.env, timeout) {
  return spawnSync(command, [...commandPrefix, '--label', label], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
    timeout,
  });
}

const integrationResult = runConfiguration('integration');

if (integrationResult.error || integrationResult.status !== 0) {
  if (integrationResult.error) {
    console.error(
      `Failed to start VS Code end-to-end tests: ${integrationResult.error.message}`,
    );
  }
  process.exitCode = integrationResult.status ?? 1;
} else {
  const markerDirectory = mkdtempSync(
    path.join(os.tmpdir(), 'stale-window-cleaner-e2e-'),
  );
  const markerPath = path.join(markerDirectory, 'close-invoked');

  try {
    const closeResult = runConfiguration(
      'close-smoke',
      {
        ...process.env,
        STALE_WINDOW_CLEANER_CLOSE_MARKER: markerPath,
      },
      20_000,
    );
    const markerCreated = existsSync(markerPath);

    if (closeResult.error || closeResult.status !== 0 || !markerCreated) {
      if (closeResult.error) {
        console.error(`Close smoke failed: ${closeResult.error.message}`);
      }
      if (!markerCreated) {
        console.error('Close smoke did not reach the extension close command.');
      }
      process.exitCode = closeResult.status ?? 1;
    } else {
      console.log('Close smoke passed: the isolated VS Code window exited.');
      process.exitCode = 0;
    }
  } finally {
    rmSync(markerDirectory, { recursive: true, force: true });
  }
}
