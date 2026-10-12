import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const tag = process.env.RELEASE_TAG;
if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '') || tag !== `v${manifest.version}`) {
  throw new Error('Release tag must be vX.Y.Z and match package.json version');
}
if (
  lock.version !== manifest.version ||
  lock.packages[''].version !== manifest.version
) {
  throw new Error('package-lock.json version must match package.json');
}
const changelog = readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.split('\n').includes(`## ${manifest.version}`)) {
  throw new Error(
    'CHANGELOG.md must include a section for the release version',
  );
}
console.log(manifest.version);
