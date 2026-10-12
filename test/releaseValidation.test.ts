import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve(__dirname, '../../scripts/validateRelease.mjs');

for (const scenario of [
  { label: 'matching release metadata', tag: 'v0.0.8', ok: true },
  { label: 'a different tag version', tag: 'v0.0.7', ok: false },
  { label: 'a branch name instead of a version tag', tag: 'master', ok: false },
  { label: 'a missing tag', tag: '', ok: false },
  {
    label: 'a mismatched lockfile version',
    tag: 'v0.0.8',
    lock: '0.0.7',
    ok: false,
  },
  {
    label: 'a mismatched root package version',
    tag: 'v0.0.8',
    root: '0.0.7',
    ok: false,
  },
  {
    label: 'a missing changelog entry',
    tag: 'v0.0.8',
    changelog: '',
    ok: false,
  },
]) {
  test(`release validation ${scenario.ok ? 'accepts' : 'rejects'} ${scenario.label}`, () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'autoclose-release-'));
    try {
      writeFileSync(
        path.join(directory, 'package.json'),
        JSON.stringify({ version: '0.0.8' }),
      );
      writeFileSync(
        path.join(directory, 'package-lock.json'),
        JSON.stringify({
          version: scenario.lock ?? '0.0.8',
          packages: { '': { version: scenario.root ?? '0.0.8' } },
        }),
      );
      writeFileSync(
        path.join(directory, 'CHANGELOG.md'),
        scenario.changelog ?? '# Changelog\n\n## 0.0.8\n',
      );
      const result = spawnSync(process.execPath, [script], {
        cwd: directory,
        env: { ...process.env, RELEASE_TAG: scenario.tag },
        encoding: 'utf8',
      });
      assert.equal(result.status === 0, scenario.ok, result.stderr);
      if (scenario.ok) assert.equal(result.stdout.trim(), '0.0.8');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
