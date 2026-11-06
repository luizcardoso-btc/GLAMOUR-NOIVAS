// Glamour Noivas — servidor sem dependências externas (Node 18+)
// Serve o site, a API de catálogo/agendamento e o painel administrativo.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DOMINIO = (process.env.DOMINIO || 'glamournoivasac.com.br').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'glamour2026';
// Configuração da loja e catálogo inicial vêm do código (pasta data/).
// Dados que mudam com o uso (agendamentos, catálogo editado, folgas, perguntas) ficam em DATA_DIR.
// No Railway, monte um volume e defina DATA_DIR=/data para nada se perder a cada publicação.
const SEED = path.join(__dirname, 'data');
const STARTED = new Date().toISOString();
// O Railway informa sozinho onde o volume está montado; isso tem prioridade sobre DATA_DIR.
const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH || '';
const DATA = VOLUME || process.env.DATA_DIR || SEED;
fs.mkdirSync(DATA, { recursive: true });
if (DATA !== SEED && !fs.existsSync(path.join(DATA, 'catalogo.json'))) {
  fs.copyFileSync(path.join(SEED, 'catalogo.json'), path.join(DATA, 'catalogo.json'));
  console.log('Catálogo inicial copiado para', DATA);
}
// Peças novas adicionadas no código (ex.: fotos reais) entram no catálogo do volume sem apagar o que foi editado no painel.
if (DATA !== SEED) {
  try {
    const seed = JSON.parse(fs.readFileSync(path.join(SEED, 'catalogo.json'), 'utf8'));
    const atual = JSON.parse(fs.readFileSync(path.join(DATA, 'catalogo.json'), 'utf8'));
    const ids = new Set(atual.map(i => i.id));
    const novos = seed.filter(i => !ids.has(i.id));
    // fotos novas de peças que já existem também entram (sem apagar as que foram colocadas pelo painel)
    let fotosNovas = 0;
    for (const sd of seed) {
      const it = atual.find(i => i.id === sd.id);
      // peça revisada no código (rev maior): substitui a versão salva
      if (it && (sd.rev || 0) > (it.rev || 0)) { Object.assign(it, sd); fotosNovas++; continue; }
      if (!it || !Array.isArray(sd.fotos)) continue;
      const faltam = sd.fotos.filter(f => !(it.fotos || []).includes(f));
      if (faltam.length) { it.fotos = [...(it.fotos || []), ...faltam]; fotosNovas += faltam.length; }
    }
    if (novos.length || fotosNovas) {
      fs.writeFileSync(path.join(DATA, 'catalogo.json'), JSON.stringify([...novos, ...atual], null, 2));
      console.log(`Catálogo: ${novos.length} peça(s) e ${fotosNovas} foto(s) novas`);
    }
  } catch (e) { console.error('Falha ao mesclar catálogo', e.message); }
}
const config = () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(SEED, 'config.json'), 'utf8'));
  cfg.agenda.datasBloqueadas = load('bloqueios.json', cfg.agenda.datasBloqueadas || []);
  return cfg;
};
const PUBLIC = path.join(__dirname, 'public');

// ---------- armazenamento simples em JSON (gravação atômica) ----------
function load(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); }
  catch { return fallback; }
}
function save(name, value) {
  const file = path.join(DATA, name);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

// ---------- utilidades ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', ...headers });
  res.end(status === 204 ? undefined : isObj ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 8e6) { reject(new Error('payload')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('json')); } });
  });
}
const clean = (s, max = 200) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, max);

// Data/hora no fuso do Acre (UTC-5, sem horário de verão)
function nowAcre() { return new Date(Date.now() - 5 * 3600 * 1000); }
function todayISO() { return nowAcre().toISOString().slice(0, 10); }

// ---------- regras de agenda ----------
function slotsFor(dateISO) {
  const cfg = config();
  const ag = cfg.agenda;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { erro: 'Data inválida' };
  if (dateISO < todayISO()) return { data: dateISO, fechado: true, motivo: 'Data já passou', horarios: [] };
  const maxDate = new Date(nowAcre().getTime() + ag.antecedenciaMaximaDias * 864e5).toISOString().slice(0, 10);
  if (dateISO > maxDate) return { data: dateISO, fechado: true, motivo: `Agendamos com até ${ag.antecedenciaMaximaDias} dias de antecedência`, horarios: [] };
  if ((ag.datasBloqueadas || []).includes(dateISO)) return { data: dateISO, fechado: true, motivo: 'Loja fechada nesta data', horarios: [] };

  const weekday = new Date(dateISO + 'T12:00:00Z').getUTCDay(); // 0=domingo
  const periodos = ag.funcionamento[String(weekday)] || [];
  if (!periodos.length) return { data: dateISO, fechado: true, motivo: 'Não abrimos neste dia da semana', horarios: [] };

  const bookings = load('agendamentos.json', []).filter(b => b.data === dateISO && b.status !== 'cancelado');
  const nowMin = dateISO === todayISO() ? nowAcre().getUTCHours() * 60 + nowAcre().getUTCMinutes() + 60 : -1;
  const horarios = [];
  for (const [ini, fim] of periodos) {
    const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    for (let t = toMin(ini); t + ag.duracaoMinutos <= toMin(fim); t += ag.duracaoMinutos) {
      const hhmm = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      const ocupados = bookings.filter(b => b.hora === hhmm).length;
      horarios.push({ hora: hhmm, vagas: Math.max(0, ag.atendimentosSimultaneos - ocupados), disponivel: t > nowMin && ocupados < ag.atendimentosSimultaneos });
    }
  }
  return { data: dateISO, fechado: false, horarios };
}

// ---------- autenticação do painel ----------
const sessions = new Map(); // token -> expira
function isAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const exp = sessions.get(token);
  return exp && exp > Date.now();
}
const loginAttempts = new Map();

// ---------- rotas da API ----------
async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/health') return send(res, 200, { ok: true, volumeRailway: VOLUME || null, pastaDados: DATA, dadosPermanentes: !!VOLUME || (!process.env.RAILWAY_ENVIRONMENT && DATA !== SEED), iniciadoEm: STARTED });
  if (p === '/api/config' && m === 'GET') {
    const cfg = config();
    return send(res, 200, { loja: cfg.loja, servicos: cfg.servicos, faq: cfg.faq, tiposAtendimento: cfg.tiposAtendimento, depoimentos: cfg.depoimentos });
  }
  if (p === '/api/catalogo' && m === 'GET') {
    return send(res, 200, load('catalogo.json', []).filter(i => i.ativo !== false));
  }
  if (p === '/api/horarios' && m === 'GET') {
    return send(res, 200, slotsFor(url.searchParams.get('data') || todayISO()));
  }
  if (p === '/api/agendamentos' && m === 'POST') {
    const b = await readBody(req);
    const nome = clean(b.nome, 80), telefone = clean(b.telefone, 20).replace(/\D/g, '');
    const tipo = clean(b.tipo, 60), data = clean(b.data, 10), hora = clean(b.hora, 5);
    if (nome.length < 2) return send(res, 400, { erro: 'Informe seu nome.' });
    if (telefone.length < 10) return send(res, 400, { erro: 'Informe um WhatsApp com DDD.' });
    const cfg = config();
    if (!cfg.tiposAtendimento.some(t => t.id === tipo)) return send(res, 400, { erro: 'Escolha o tipo de atendimento.' });
    const dia = slotsFor(data);
    const slot = dia.horarios?.find(h => h.hora === hora);
    if (!slot || !slot.disponivel) return send(res, 409, { erro: 'Este horário acabou de ser preenchido ou não está disponível. Escolha outro, por favor.' });
    const ag = {
      id: crypto.randomBytes(4).toString('hex').toUpperCase(),
      nome, telefone, tipo, data, hora,
      dataEvento: clean(b.dataEvento, 10), acompanhantes: Math.min(10, Math.max(0, parseInt(b.acompanhantes) || 0)),
      interesse: clean(b.interesse, 120), observacoes: clean(b.observacoes, 500),
      origem: b.origem === 'chat' ? 'chat' : 'site', status: 'pendente', criadoEm: new Date().toISOString()
    };
    const all = load('agendamentos.json', []);
    all.push(ag);
    save('agendamentos.json', all);
    console.log(`[agendamento] ${ag.id} ${ag.data} ${ag.hora} ${ag.nome}`);
    return send(res, 201, ag);
  }

  // ---- cliente consulta/cancela o próprio agendamento (código + WhatsApp) ----
  if (p === '/api/meu-agendamento' && m === 'POST') {
    const b = await readBody(req);
    const id = clean(b.id, 12).toUpperCase(), tel = clean(b.telefone, 20).replace(/\D/g, '');
    const all = load('agendamentos.json', []);
    const ag = all.find(a => a.id === id && tel.length >= 8 && a.telefone.endsWith(tel.slice(-8)));
    if (!ag) return send(res, 404, { erro: 'Não encontramos esse agendamento. Confira o código e o WhatsApp.' });
    if (b.acao === 'cancelar') {
      if (ag.data < todayISO()) return send(res, 400, { erro: 'Esse agendamento já passou.' });
      if (ag.status === 'cancelado') return send(res, 400, { erro: 'Esse agendamento já estava cancelado.' });
      ag.status = 'cancelado'; ag.canceladoPelaCliente = true; ag.atualizadoEm = new Date().toISOString();
      save('agendamentos.json', all);
      console.log(`[cancelamento] ${ag.id} pela cliente`);
    }
    const { id: i, nome, tipo, data, hora, status } = ag;
    return send(res, 200, { id: i, nome, tipo, data, hora, status });
  }

  // ---- perguntas que a assistente não soube responder (para melhorar o FAQ) ----
  if (p === '/api/perguntas' && m === 'POST') {
    const { texto } = await readBody(req);
    const t = clean(texto, 300);
    if (t.length >= 3) {
      const all = load('perguntas.json', []);
      all.push({ texto: t, em: new Date().toISOString() });
      save('perguntas.json', all.slice(-1000));
    }
    return send(res, 204, '');
  }

  // ---- painel ----
  if (p === '/api/admin/login' && m === 'POST') {
    const ip = req.socket.remoteAddress;
    const tries = loginAttempts.get(ip) || { n: 0, t: Date.now() };
    if (Date.now() - tries.t > 15 * 60e3) { tries.n = 0; tries.t = Date.now(); }
    if (tries.n >= 10) return send(res, 429, { erro: 'Muitas tentativas. Aguarde 15 minutos.' });
    const { senha } = await readBody(req);
    const a = Buffer.from(String(senha || '')), bpw = Buffer.from(ADMIN_PASSWORD);
    if (a.length !== bpw.length || !crypto.timingSafeEqual(a, bpw)) {
      tries.n++; loginAttempts.set(ip, tries);
      return send(res, 401, { erro: 'Senha incorreta' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, Date.now() + 12 * 3600e3);
    return send(res, 200, { token });
  }
  if (p.startsWith('/api/admin/') && !isAdmin(req)) return send(res, 401, { erro: 'Não autorizado' });
  if (await financeiro(req, res, url)) return;

  if (p === '/api/admin/agendamentos' && m === 'GET') {
    const all = load('agendamentos.json', []).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
    return send(res, 200, all);
  }
  const mStatus = p.match(/^\/api\/admin\/agendamentos\/([A-F0-9]+)$/);
  if (mStatus && m === 'PATCH') {
    const { status } = await readBody(req);
    if (!['pendente', 'confirmado', 'concluido', 'fechou', 'cancelado', 'faltou'].includes(status)) return send(res, 400, { erro: 'Status inválido' });
    const all = load('agendamentos.json', []);
    const item = all.find(a => a.id === mStatus[1]);
    if (!item) return send(res, 404, { erro: 'Não encontrado' });
    item.status = status; item.atualizadoEm = new Date().toISOString();
    save('agendamentos.json', all);
    return send(res, 200, item);
  }
  if (p === '/api/admin/agendamentos.csv' && m === 'GET') {
    const all = load('agendamentos.json', []);
    const cols = ['id', 'data', 'hora', 'nome', 'telefone', 'tipo', 'dataEvento', 'acompanhantes', 'interesse', 'observacoes', 'status', 'origem', 'criadoEm'];
    const csv = [cols.join(';'), ...all.map(a => cols.map(c => `"${String(a[c] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
    return send(res, 200, '﻿' + csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="agendamentos.csv"' });
  }
  if (p === '/api/admin/perguntas' && m === 'GET') return send(res, 200, load('perguntas.json', []).slice().reverse());
  if (p === '/api/admin/perguntas' && m === 'DELETE') { save('perguntas.json', []); return send(res, 200, { ok: true }); }
  if (p === '/api/admin/catalogo' && m === 'GET') return send(res, 200, load('catalogo.json', []));
  if (p === '/api/admin/catalogo' && m === 'POST') {
    const b = await readBody(req);
    const all = load('catalogo.json', []);
    const item = {
      id: clean(b.id, 40) || crypto.randomBytes(3).toString('hex'),
      nome: clean(b.nome, 80), categoria: clean(b.categoria, 30), estilo: clean(b.estilo, 40),
      tamanhos: clean(b.tamanhos, 60), cor: clean(b.cor, 40), descricao: clean(b.descricao, 400),
      modalidade: clean(b.modalidade, 40) || 'Aluguel', imagem: clean(b.imagem, 300), fotos: (Array.isArray(b.fotos) ? b.fotos : String(b.fotos || '').split(',')).map(f => clean(f, 300)).filter(Boolean).slice(0, 12), destaque: !!b.destaque, ativo: b.ativo !== false
    };
    if (!item.nome || !item.categoria) return send(res, 400, { erro: 'Nome e categoria são obrigatórios' });
    const idx = all.findIndex(i => i.id === item.id);
    if (idx >= 0) all[idx] = item; else all.push(item);
    save('catalogo.json', all);
    return send(res, 200, item);
  }
  const mCat = p.match(/^\/api\/admin\/catalogo\/([\w-]+)$/);
  if (mCat && m === 'DELETE') {
    save('catalogo.json', load('catalogo.json', []).filter(i => i.id !== mCat[1]));
    return send(res, 200, { ok: true });
  }
  if (p === '/api/admin/bloqueios' && m === 'POST') {
    const { data, bloquear } = await readBody(req);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return send(res, 400, { erro: 'Data inválida' });
    const set = new Set(config().agenda.datasBloqueadas);
    bloquear ? set.add(data) : set.delete(data);
    const lista = [...set].sort();
    save('bloqueios.json', lista);
    return send(res, 200, { datasBloqueadas: lista });
  }
  if (p === '/api/admin/bloqueios' && m === 'GET') return send(res, 200, { datasBloqueadas: config().agenda.datasBloqueadas || [] });

  return send(res, 404, { erro: 'Rota não encontrada' });
}

const financeiro = require('./financeiro')({ load, save, send, readBody, clean, todayISO });

// ---------- arquivos estáticos ----------
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  if (rel === '/admin') rel = '/admin.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Proibido');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Página não encontrada');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' });
    res.end(buf);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // domínio oficial: www → sem www, e http → https (o Railway informa o protocolo original no x-forwarded-proto)
  const host = String(req.headers.host || '').toLowerCase().split(':')[0];
  if (host.endsWith(DOMINIO) && url.pathname !== '/api/health') {
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    if (host !== DOMINIO || proto === 'http') {
      res.writeHead(301, { Location: `https://${DOMINIO}${req.url}` }); return res.end();
    }
    res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  }
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    send(res, 400, { erro: 'Requisição inválida' });
  }
}).listen(PORT, () => {
  console.log(`Dados em: ${DATA}${DATA === SEED ? '  (⚠️ sem volume: no Railway os agendamentos se perdem a cada publicação)' : ''}`);
  console.log(`Glamour Noivas rodando em http://localhost:${PORT}  (painel: /admin)`);
  if (!process.env.ADMIN_PASSWORD) console.log('⚠️  Defina ADMIN_PASSWORD antes de publicar. Senha padrão: glamour2026');
});
