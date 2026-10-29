// Verify Fast Refresh on the connected Hermes runtime, without reading app/user data.
// The temporary null component and root import are always restored in finally.
const fs = require('node:fs/promises');
// Metro's locked dependency; Origin is required by its inspector security checks.
const WebSocket = require('ws');
const path = require('node:path');
const assert = require('node:assert/strict');
const appDir = path.resolve(__dirname, '..');
const layoutPath = path.join(appDir, 'src/app/_layout.tsx');
const probePath = path.join(appDir, 'src/components/dev-refresh-probe.tsx');
const port = Number(process.env.ZHIXIAN_DEV_PORT || 8081);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Invalid local development port');
const origin = `http://127.0.0.1:${port}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const probeSource = (revision) => `import { useEffect, useRef } from 'react';
export default function DevRefreshProbe() {
  const mountId = useRef('mount-' + Math.random().toString(36).slice(2));
  useEffect(() => {
    const target = globalThis as typeof globalThis & { __ZHIXIAN_REFRESH_PROBE__?: unknown };
    target.__ZHIXIAN_REFRESH_PROBE__ = { revision: '${revision}', mountId: mountId.current };
    return () => { delete target.__ZHIXIAN_REFRESH_PROBE__; };
  }, []);
  return null;
}
`;
(async () => {
  let original, patched, socket, probeCreated = false;
  const pending = new Map(); let nextId = 1;
  const rpc = (expression) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Hermes evaluation timed out')); }, 8000);
    pending.set(id, (message) => {
      clearTimeout(timeout);
      if (message.error || message.result?.exceptionDetails) reject(new Error('Hermes evaluation failed'));
      else resolve(message.result?.result?.value);
    });
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
  const readProbe = async () => JSON.parse(await rpc('JSON.stringify(globalThis.__ZHIXIAN_REFRESH_PROBE__ ?? null)'));
  const awaitRevision = async (revision) => {
    for (let n = 0; n < 45; n++) { const value = await readProbe(); if (value?.revision === revision) return value; await wait(1000); }
    throw new Error('The phone did not receive revision ' + revision);
  };
  try {
    const targets = await fetch(origin + '/json/list').then((r) => r.json());
    const target = targets.find((item) => JSON.stringify([item.title, item.description, item.appId]).includes('com.zhanghuiwan.zhixian'));
    assert.ok(target?.webSocketDebuggerUrl, '请先启动 dev:android，保持手机开发版在前台并等待首次加载。');
    const socketUrl = new URL(target.webSocketDebuggerUrl);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(socketUrl.hostname), 'Only a local Hermes inspector may be used');
    socketUrl.hostname = '127.0.0.1';
    socket = new WebSocket(socketUrl, { origin });
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('Cannot connect to the local Hermes inspector')), { once: true }); });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    });
    assert.equal(await rpc('typeof __DEV__ !== "undefined" && __DEV__'), true, 'A development runtime is required');
    try { await fs.access(probePath); throw new Error('Temporary probe path already exists; refusing to overwrite it'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    original = await fs.readFile(layoutPath, 'utf8');
    assert.ok(original.includes('<SafeAreaProvider>'), 'Unexpected root layout; refusing to modify it');
    patched = "import DevRefreshProbe from '@/components/dev-refresh-probe';\n" + original.replace('<SafeAreaProvider>', '<SafeAreaProvider><DevRefreshProbe />');
    await fs.writeFile(probePath, probeSource('A')); probeCreated = true;
    await fs.writeFile(layoutPath, patched);
    const first = await awaitRevision('A');
    const changedAt = Date.now();
    await fs.writeFile(probePath, probeSource('B'));
    const second = await awaitRevision('B');
    assert.equal(second.mountId, first.mountId, 'Expected Fast Refresh to preserve the mounted component');
    const report = { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()), app: 'com.zhanghuiwan.zhixian', transport: 'USB to localhost Metro', checked: ['original repository change reached phone Hermes', 'second source edit reached phone automatically', 'component mount identity preserved by Fast Refresh'], refreshMs: Date.now() - changedAt, userDataRead: false };
    await fs.mkdir(path.join(appDir, '.expo'), { recursive: true });
    await fs.writeFile(path.join(appDir, '.expo/android-refresh-verification.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally {
    if (original && patched) {
      const current = await fs.readFile(layoutPath, 'utf8');
      if (current === patched) await fs.writeFile(layoutPath, original);
      else if (current !== original) throw new Error('Root layout changed concurrently; temporary probe import was left for manual review');
    }
    if (probeCreated) await fs.rm(probePath, { force: true });
    if (socket?.readyState === WebSocket.OPEN) { await wait(1500); await rpc('delete globalThis.__ZHIXIAN_REFRESH_PROBE__').catch(() => {}); socket.close(); }
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
