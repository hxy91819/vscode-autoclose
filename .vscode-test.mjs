import { defineConfig } from '@vscode/test-cli';

const common = {
  version: '1.89.1',
  workspaceFolder: './test/fixtures/workspace',
  launchArgs: [
    '--disable-extensions',
    '--skip-welcome',
    '--skip-release-notes',
  ],
};

export default defineConfig([
  {
    ...common,
    label: 'integration',
    files: 'out/test/e2e/extension.test.js',
    mocha: {
      timeout: 20_000,
    },
  },
  {
    ...common,
    label: 'empty-window',
    workspaceFolder: undefined,
    launchArgs: [
      ...common.launchArgs,
      '--new-window',
      '--user-data-dir',
      process.env.STALE_WINDOW_CLEANER_EMPTY_DATA_DIR ??
        './.vscode-test/empty-profile',
    ],
    files: 'out/test/e2e/emptyWindow.test.js',
    mocha: { timeout: 20_000 },
  },
  {
    ...common,
    label: 'close-smoke',
    launchArgs: [
      ...common.launchArgs,
      '--user-data-dir',
      process.env.STALE_WINDOW_CLEANER_CLOSE_PROFILE ??
        './.vscode-test/close-profile',
    ],
    files: 'out/test/e2e/close.test.js',
    mocha: {
      timeout: 10_000,
    },
  },
]);
