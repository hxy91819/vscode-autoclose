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
    label: 'close-smoke',
    files: 'out/test/e2e/close.test.js',
    mocha: {
      timeout: 10_000,
    },
  },
]);
