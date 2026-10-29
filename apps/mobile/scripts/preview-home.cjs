// Isolated UI fixtures, localhost only. Never proxies requests to real accounts or AI.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../dist/home-preview');
const port = Number(process.env.ZHIXIAN_PREVIEW_PORT || 8085);
const city = { id: 1796236, name: '上海', country: '中国', admin1: '上海', latitude: 31.23, longitude: 121.47 };
const user = { id: 999901, email: 'preview@example.invalid', nickname: '界面验证', daily_new_words: 10, timezone: 'Asia/Shanghai', selected_wordbook_id: 1, selected_collection_id: null };
const stats = { chat: [], weather: 0, search: 0, requests: [] };
const messages = [];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.ttf': 'font/ttf' };

function fixtureBootstrap() {
  const q = new URLSearchParams(location.search);
  const params = ['theme', 'hour', 'motion', 'fresh', 'weather', 'city', 'fast', 'mood'];
  const saved = sessionStorage.getItem('home-fixture-config');
  const config = saved ? JSON.parse(saved) : {};
  for (const key of params) if (q.has(key)) config[key] = q.get(key);
  sessionStorage.setItem('home-fixture-config', JSON.stringify(config));
  localStorage.setItem('zhixian_access_token', 'fixture-only-no-production-access');
  localStorage.setItem('zhixian.appearance.v1', JSON.stringify({ theme: config.theme || 'light', companionEnabled: true, reduceMotion: config.motion !== 'full', reduceTransparency: true }));
  if (q.get('fresh') === '1') {
    localStorage.removeItem('zhixian.companion-context.v1');
    const selected = config.city === '1' ? { id: '1796236', name: '上海', country: '中国', admin1: '上海', latitude: 31.23, longitude: 121.47 } : null;
    localStorage.setItem('zhixian.companion-context.v1', JSON.stringify({ mood: config.mood || 'auto', city: selected }));
  }
  const NativeDate = Date;
  const startedAt = NativeDate.now();
  const anchor = new NativeDate(); anchor.setHours(Number(config.hour || 9), 0, 0, 0);
  class PreviewDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [anchor.getTime() + NativeDate.now() - startedAt])); }
    static now() { return anchor.getTime() + NativeDate.now() - startedAt; }
  }
  window.Date = PreviewDate;
  const originalTimeout = window.setTimeout.bind(window);
  if (config.fast === '1') {
    window.setTimeout = (fn, delay, ...args) => originalTimeout(fn, delay >= 28000 && delay <= 46000 ? delay / 20 : delay, ...args);
  }
  const network = window.fetch.bind(window);
  window.fetch = (resource, options) => {
    const target = new URL(typeof resource === 'string' ? resource : resource.url, location.href);
    if (target.hostname === 'api.open-meteo.com' || target.hostname === 'geocoding-api.open-meteo.com') {
      const weather = new URL('/fixture/' + (target.hostname.startsWith('geocoding') ? 'search' : 'weather'), location.origin);
      weather.search = target.search; weather.searchParams.set('scenario', config.weather || 'rain');
      weather.searchParams.set('now', String(Math.floor(Date.now() / 1000)));
      return network(weather, options);
    }
    if (target.origin !== location.origin) return Promise.reject(new Error('Isolated preview blocked an external request'));
    return network(resource, options);
  };
}
function json(res, data, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
async function body(req) {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { return {}; }
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/fixture/stats') return json(res, stats);
    if (url.pathname === '/fixture/reset') { stats.chat = []; stats.weather = 0; stats.search = 0; stats.requests = []; messages.length = 0; return json(res, { reset: true }); }
    if (url.pathname === '/fixture/search') {
      stats.search++;
      if (url.searchParams.get('name') === '网络失败') return json(res, {}, 503);
      return json(res, { results: url.searchParams.get('name') === '不存在的城市' ? [] : [city] });
    }
    if (url.pathname === '/fixture/weather') {
      stats.weather++;
      const scenario = url.searchParams.get('scenario');
      if (scenario === 'error') return json(res, {}, 503);
      const code = { rain: 61, clear: 0, snow: 73, cloudy: 3, storm: 95 }[scenario] ?? 61;
      return json(res, { current: { weather_code: code, time: Number(url.searchParams.get('now')) - (scenario === 'stale' ? 7200 : 0) } });
    }
    if (url.pathname.startsWith('/api/v1/')) {
      const route = url.pathname.slice('/api/v1'.length); stats.requests.push(route);
      if (route === '/users/me') return json(res, user);
      if (route === '/ai/conversations/today') return json(res, messages.length ? { id: 9901, title: '验证对话' } : null);
      if (route === '/ai/conversations/9901/messages') return json(res, messages);
      if (route === '/ai/chat/stream') {
        const data = await body(req); stats.chat.push(data.message);
        const content = '这里是隔离验证回复。今天先练两句英语。';
        messages.push({ id: 99000 + messages.length, role: 'user', content: data.message, actions: [] }, { id: 99001 + messages.length, role: 'assistant', content, actions: [] });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
        res.end([['conversation.created', { conversation_id: 9901 }], ['message.delta', { content }], ['message.completed', { message_id: messages[messages.length - 1].id, content, actions: [] }]].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(''));
        return;
      }
      if (route === '/dashboard') return json(res, { due_today: 0, studied_today: 0, mastered_words: 0, vocabulary_count: 0, streak_days: 0, current_wordbook: null, recent_activity: [] });
      if (route === '/records') return json(res, { month: '2026-10', timezone: 'Asia/Shanghai', today: '2026-10-29', days: [] });
      if (route === '/ai/providers' || route === '/ai/providers/catalog' || route === '/library') return json(res, []);
      return json(res, {}, 404);
    }
    const pathname = decodeURIComponent(url.pathname);
    let file = path.resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) return json(res, {}, 403);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(root, 'index.html');
    if (!fs.existsSync(file)) return json(res, { error: 'Run the fixture web export first' }, 503);
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (ext === '.html') {
      const script = `<script>(${fixtureBootstrap.toString()})();</script>`;
      res.end(fs.readFileSync(file, 'utf8').replace('<head>', '<head>' + script));
    } else fs.createReadStream(file).pipe(res);
  } catch { if (!res.headersSent) json(res, { error: 'Fixture request failed' }, 500); else res.end(); }
});
server.listen(port, '127.0.0.1', () => console.log(`Isolated home preview http://127.0.0.1:${port}; fictional account and local weather; never production`));
