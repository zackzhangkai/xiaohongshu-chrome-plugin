import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { NoteStore } from './notes.js';
import { createCollector } from './collector.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const notes = new NoteStore(dataDir);
const app = express();
app.disable('x-powered-by');

// 笔记接口只允许本机页面访问（采集插件走 /api/collector 自己的校验）。
const localPageOnly = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)) return res.status(403).json({ error: '仅允许本机访问' });
  const origin = req.get('origin');
  let same = !origin;
  try { if (origin) same = new URL(origin).host === req.get('host'); } catch {}
  if (!same || req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: '请从本机服务页面访问' });
  next();
};

app.use('/api/collector', createCollector({ dataDir, notes }));

app.get('/api/notes', localPageOnly, (_req, res) => res.json(notes.list()));
app.get('/api/notes/:id', localPageOnly, (req, res) => {
  const note = notes.get(req.params.id);
  if (!note) return res.status(404).json({ error: '笔记不存在' });
  res.json(note);
});
app.delete('/api/notes/:id', localPageOnly, (req, res) => {
  try { res.json({ ok: notes.delete(req.params.id) }); }
  catch { res.status(400).json({ error: '笔记编号无效' }); }
});
app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));

// 图片文件名是内容哈希，可以长缓存。
app.use('/imports', express.static(path.join(dataDir, 'imports'), { maxAge: '30d', immutable: true }));
app.use(express.static(path.join(root, 'public')));

const port = Number(process.env.PORT || 8788);
app.listen(port, '127.0.0.1', () => {
  console.log(`小红书采集助手本地服务已启动：http://127.0.0.1:${port}`);
  console.log(`数据目录：${dataDir}`);
});
