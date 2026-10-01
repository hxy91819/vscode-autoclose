import { spawn, spawnSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  readdir,
  readFile,
} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
if (process.platform !== 'linux')
  throw new Error('This UI smoke test requires Linux and Xvfb');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
).version;
const portServer = createServer();
await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));
const debugPort = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));
const taskDirectory = await mkdtemp(
  path.join(os.tmpdir(), 'autoclose-installed-'),
);
const profile = path.join(taskDirectory, 'profile');
const extensions = path.join(taskDirectory, 'extensions');
const workspace = path.join(taskDirectory, 'workspace');
await mkdir(path.join(profile, 'User'), { recursive: true });
await mkdir(workspace);
await writeFile(
  path.join(profile, 'User/settings.json'),
  JSON.stringify({
    'files.hotExit': 'onExitAndWindowClose',
    'security.workspace.trust.enabled': false,
    'update.mode': 'none',
    'workbench.startupEditor': 'none',
  }),
);
const binary = await downloadAndUnzipVSCode('1.89.1');
const cli = path.join(path.dirname(binary), 'bin', 'code');
const installed = spawnSync(
  cli,
  [
    '--no-sandbox',
    '--user-data-dir',
    profile,
    '--extensions-dir',
    extensions,
    '--install-extension',
    path.join(root, `stale-window-cleaner-${version}.vsix`),
  ],
  { encoding: 'utf8' },
);
if (installed.status !== 0) throw new Error(installed.stderr);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let child;
let focusHelper;
async function start() {
  child = spawn(
    binary,
    [
      '--no-sandbox',
      '--disable-gpu',
      '--user-data-dir',
      profile,
      '--extensions-dir',
      extensions,
      `--remote-debugging-port=${debugPort}`,
      '--skip-welcome',
      '--skip-release-notes',
      workspace,
    ],
    {
      stdio: 'ignore',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    },
  );
  let target;
  for (let i = 0; i < 150; i++) {
    try {
      const pages = await (
        await fetch(`http://127.0.0.1:${debugPort}/json`)
      ).json();
      target = pages.find(
        (p) => p.type === 'page' && p.url.includes('workbench'),
      );
      if (target) break;
    } catch {}
    await delay(100);
  }
  if (!target) throw Error('workbench target missing');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    socket.onopen = r;
    socket.onerror = j;
  });
  let serial = 0;
  const pending = new Map();
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error
        ? p?.reject(Error(JSON.stringify(m.error)))
        : p?.resolve(m.result);
    }
  };
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) =>
    (await call('Runtime.evaluate', { expression, returnByValue: true })).result
      .value;
  for (let i = 0; i < 150; i++) {
    if (await evaluate('!!document.querySelector(".monaco-workbench")')) break;
    await delay(100);
  }
  await delay(2500);
  const key = async (key, code, keyCode, modifiers = 0) => {
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      modifiers,
    });
    await call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      modifiers,
    });
  };
  const command = async (title) => {
    await key('P', 'KeyP', 80, 2 | 8);
    await delay(200);
    await call('Input.insertText', { text: title });
    await delay(400);
    await key('Enter', 'Enter', 13);
    await delay(500);
  };
  return { socket, call, evaluate, key, command, target };
}
try {
  let page = await start();
  await page.key('n', 'KeyN', 78, 2);
  await delay(500);
  await page.call('Input.insertText', {
    text: 'autoclose installed recovery proof',
  });
  await page.command('Stale Window Cleaner: Show All Windows');
  const errored = await page.evaluate(
    'document.body.innerText.includes("not found")',
  );
  if (errored) throw Error('published command not registered');
  if (
    !(await page.evaluate('document.body.innerText')).includes(
      'Stale Window Cleaner: All Windows',
    )
  )
    throw Error('all-window overview did not open');
  await page.key('w', 'KeyW', 87, 2);
  await delay(300);
  await page.command('Stale Window Cleaner: Start 10-Second Test');
  focusHelper = spawn(
    'python3',
    [
      '-c',
      `import ctypes,time
x=ctypes.CDLL('libX11.so.6')
x.XOpenDisplay.restype=ctypes.c_void_p
x.XDefaultRootWindow.argtypes=[ctypes.c_void_p];x.XDefaultRootWindow.restype=ctypes.c_ulong
x.XCreateSimpleWindow.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_int,ctypes.c_int,ctypes.c_uint,ctypes.c_uint,ctypes.c_uint,ctypes.c_ulong,ctypes.c_ulong];x.XCreateSimpleWindow.restype=ctypes.c_ulong
x.XMapWindow.argtypes=[ctypes.c_void_p,ctypes.c_ulong]
x.XSetInputFocus.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_int,ctypes.c_ulong]
x.XFlush.argtypes=[ctypes.c_void_p]
d=x.XOpenDisplay(None);w=x.XCreateSimpleWindow(d,x.XDefaultRootWindow(d),0,0,100,100,0,0,0);x.XMapWindow(d,w);x.XFlush(d);time.sleep(0.5)
x.XSetInputFocus(d,w,2,0);x.XFlush(d);time.sleep(20)`,
    ],
    { stdio: 'inherit' },
  );
  await delay(13000);
  if (child.exitCode === null) {
    console.log(
      'After quick test:',
      (await page.evaluate('document.body.innerText')).slice(-1000),
    );
    for (const file of await readdir(profile, { recursive: true })) {
      if (
        file.endsWith('Stale Window Cleaner.log') ||
        (file.endsWith('.json') &&
          file.includes('local-poc.stale-window-cleaner/windows'))
      ) {
        console.log(file, await readFile(path.join(profile, file), 'utf8'));
      }
    }
    throw Error('window did not close after quick test');
  }
  console.log(
    'Installed VSIX command activation and dirty workspace closure passed',
  );
  page = await start();
  let found = false;
  for (let i = 0; i < 60; i++) {
    const text = await page.evaluate(
      `Array.from(document.querySelectorAll('.monaco-editor .view-lines')).map(element=>element.textContent.replaceAll('\u00a0',' ')).join(' ')`,
    );
    if (text.includes('autoclose installed recovery proof')) {
      found = true;
      break;
    }
    await delay(100);
  }
  if (!found) throw Error('unsaved content was not restored');
  console.log(
    'Installed VSIX Hot Exit recovery passed: unsaved note restored after reopening',
  );
  page.socket.close();
} finally {
  focusHelper?.kill();
  if (child?.exitCode === null) {
    child.kill('SIGTERM');
    await delay(500);
  }
  await rm(taskDirectory, { recursive: true, force: true });
}
