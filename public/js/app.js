// Glamour Noivas — site público
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const App = { config: null, catalogo: [], favoritos: new Set(JSON.parse(localStorage.getItem('gn-favs') || '[]')) };
window.GN = App;

const SILHUETAS = {
  vestido: '<svg viewBox="0 0 100 140" fill="#e7a9ba"><path d="M40 8c0-4 20-4 20 0l-2 14c6 4 8 10 6 18l-4 10c14 22 26 52 34 86H6c8-34 20-64 34-86l-4-10c-2-8 0-14 6-18z"/></svg>',
  paleto: '<svg viewBox="0 0 100 140" fill="#e7a9ba"><path d="M30 10l20 14 20-14 22 10 4 110H4L8 20zM50 24l-8 40 8 10 8-10z" /><path d="M46 26h8l-4 10z" fill="#e8d6b3"/></svg>',
  acessorio: '<svg viewBox="0 0 100 100" fill="#e7a9ba"><path d="M10 70l8-40 16 22 16-34 16 34 16-22 8 40z"/><rect x="10" y="74" width="80" height="10" rx="3"/></svg>'
};
const silhueta = cat => cat === 'Paletós' ? SILHUETAS.paleto : cat === 'Acessórios' ? SILHUETAS.acessorio : SILHUETAS.vestido;

function whatsLink(texto) {
  return `https://wa.me/${App.config.loja.whatsapp}?text=${encodeURIComponent(texto)}`;
}
App.whatsLink = whatsLink;

async function init() {
  const [config, catalogo] = await Promise.all([fetch('/api/config').then(r => r.json()), fetch('/api/catalogo').then(r => r.json())]);
  App.config = config; App.catalogo = catalogo;
  const l = config.loja;

  $('#lista-servicos').innerHTML = config.servicos.map(s => `<article class="servico"><div class="ic">${s.icone}</div><h3>${esc(s.titulo)}</h3><p>${esc(s.texto)}</p></article>`).join('');
  $('#depoimentos').innerHTML = config.depoimentos.map(d => `<blockquote>“${esc(d.texto)}”<cite>${esc(d.nome)} · ${esc(d.evento)}</cite></blockquote>`).join('');
  $('#lista-faq').innerHTML = config.faq.map(f => `<details><summary>${esc(f.pergunta)}</summary><p>${esc(App.preencher(f.resposta))}</p></details>`).join('');
  $('#rod-endereco').textContent = l.endereco;
  $('#rod-horario').textContent = l.horarioTexto;
  $('#rod-contatos').innerHTML = (l.contatos || []).map(c => `<a target="_blank" rel="noopener" href="https://wa.me/${c.whatsapp}?text=${encodeURIComponent('Olá, ' + c.nome + '! Vim pelo site da Glamour Noivas.')}">WhatsApp ${esc(c.nome)} · ${esc(c.telefone)}</a>`).join('');
  $('#rod-insta').href = l.instagram;
  $('#rod-mapa').href = l.mapsUrl;
  $('#ano').textContent = new Date().getFullYear();

  montarCatalogo();
  montarGaleria();
  montarAgendamento();
}

App.preencher = txt => txt.replace(/\{(\w+)\}/g, (_, k) => App.config.loja[k] ?? '');

// ---------- catálogo ----------
function montarCatalogo() {
  const cats = ['Todos', 'Favoritos ❤️', ...new Set(App.catalogo.map(i => i.categoria))];
  $('#filtros').innerHTML = cats.map((c, i) => `<button role="tab" aria-selected="${i === 0}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $('#filtros').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $('#filtros').querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', x === b));
    renderCatalogo(b.dataset.cat);
  });
  $('#grade-catalogo').addEventListener('click', e => {
    const fav = e.target.closest('.fav');
    if (fav) {
      const id = fav.dataset.id;
      App.favoritos.has(id) ? App.favoritos.delete(id) : App.favoritos.add(id);
      localStorage.setItem('gn-favs', JSON.stringify([...App.favoritos]));
      fav.textContent = App.favoritos.has(id) ? '❤️' : '🤍';
      atualizarResumoFavs();
    }
    const zoom = e.target.closest('[data-zoom]');
    if (zoom) { const it = App.catalogo.find(x => x.id === zoom.dataset.zoom); abrirLightbox((it.fotos && it.fotos.length) ? it.fotos : [it.imagem], 0, it.nome); }
    const provar = e.target.closest('.provar');
    if (provar) {
      App.favoritos.add(provar.dataset.id);
      localStorage.setItem('gn-favs', JSON.stringify([...App.favoritos]));
      const item = App.catalogo.find(i => i.id === provar.dataset.id);
      const tipo = { 'Noivas': 'noiva-primeira', '15 Anos': 'debutante', 'Paletós': 'trajes-masculinos', 'Festa': 'madrinhas-festa' }[item.categoria];
      if (tipo) selecionarTipo(tipo);
      atualizarResumoFavs(); renderCatalogo(document.querySelector('#filtros [aria-selected=true]').dataset.cat);
      $('#agendar').scrollIntoView();
    }
  });
  renderCatalogo('Todos');
}
function renderCatalogo(cat) {
  let itens = App.catalogo;
  if (cat === 'Favoritos ❤️') itens = itens.filter(i => App.favoritos.has(i.id));
  else if (cat !== 'Todos') itens = itens.filter(i => i.categoria === cat);
  itens = [...itens].sort((a, b) => b.destaque - a.destaque);
  $('#grade-catalogo').innerHTML = itens.length ? itens.map(i => `
    <article class="peca">
      <div class="foto">${i.imagem ? `<img src="${esc(i.imagem)}" alt="Vestido ${esc(i.nome)}" loading="lazy" data-zoom="${esc(i.id)}">` : silhueta(i.categoria)}</div>
      ${i.destaque ? '<span class="selo">DESTAQUE</span>' : ''}
      ${(i.fotos || []).length > 1 ? `<span class="nfotos">📷 ${i.fotos.length} fotos</span>` : ''}
      <button class="fav" data-id="${esc(i.id)}" aria-label="Favoritar ${esc(i.nome)}">${App.favoritos.has(i.id) ? '❤️' : '🤍'}</button>
      <div class="info">
        <h3>${esc(i.nome)}</h3>
        <div class="meta">${esc(i.categoria)} · ${esc(i.estilo)}</div>
        <p>${esc(i.descricao)}</p>
        <div class="tam">Tamanhos: ${esc(i.tamanhos)} · ${esc(i.cor)}<br>${esc(i.modalidade)}</div>
        <button class="provar" data-id="${esc(i.id)}">Quero provar →</button>
      </div>
    </article>`).join('') : '<p class="sub">Nenhum item aqui ainda. Toque no 🤍 dos modelos que você amar.</p>';
}
function atualizarResumoFavs() {
  const nomes = App.catalogo.filter(i => App.favoritos.has(i.id)).map(i => i.nome);
  $('#fav-resumo').textContent = nomes.length ? `❤️ Seus favoritos irão no agendamento: ${nomes.join(', ')}` : '';
}

// ---------- galeria e fotos ampliadas ----------
function montarGaleria() {
  const fotos = App.catalogo.flatMap(i => (i.fotos || []).map(f => ({ f, nome: i.nome })));
  const sec = $('#galeria');
  if (!fotos.length) { sec.hidden = true; return; }
  $('#galeria-fotos').innerHTML = fotos.map((x, n) => `<button data-n="${n}" aria-label="Ampliar foto do vestido ${esc(x.nome)}"><img src="${esc(x.f.replace(/\.webp$/, '-card.webp'))}" alt="Vestido ${esc(x.nome)}" loading="lazy"></button>`).join('');
  const LIM = 10;
  if (fotos.length > LIM) {
    $('#galeria-fotos').classList.add('recolhida');
    $('#galeria-fotos').insertAdjacentHTML('afterend', `<p style="text-align:center;margin-top:22px"><button class="btn btn-linha" id="ver-mais-fotos">Ver mais fotos (${fotos.length - LIM})</button></p>`);
    $('#ver-mais-fotos').onclick = e => { $('#galeria-fotos').classList.remove('recolhida'); e.target.parentElement.remove(); };
  }
  $('#galeria-fotos').addEventListener('click', e => { const b = e.target.closest('button'); if (b) abrirLightbox(fotos.map(x => x.f), +b.dataset.n, null, fotos.map(x => x.nome)); });
}
let lb = { lista: [], n: 0, nomes: [] };
function abrirLightbox(lista, n, nome, nomes) {
  lb = { lista, n, nomes: nomes || lista.map(() => nome) };
  mostrarLb(); $('#lightbox').hidden = false; document.body.style.overflow = 'hidden';
}
function mostrarLb() {
  $('#lb-img').src = lb.lista[lb.n]; $('#lb-img').alt = 'Vestido ' + (lb.nomes[lb.n] || '');
  $('#lb-legenda').textContent = `${lb.nomes[lb.n] || ''}${lb.lista.length > 1 ? ` · ${lb.n + 1}/${lb.lista.length}` : ''}`;
  $('.lb-ant').hidden = $('.lb-prox').hidden = lb.lista.length < 2;
}
function fecharLb() { $('#lightbox').hidden = true; document.body.style.overflow = ''; }
document.addEventListener('DOMContentLoaded', () => {
  $('.lb-fechar').onclick = fecharLb;
  $('.lb-ant').onclick = () => { lb.n = (lb.n - 1 + lb.lista.length) % lb.lista.length; mostrarLb(); };
  $('.lb-prox').onclick = () => { lb.n = (lb.n + 1) % lb.lista.length; mostrarLb(); };
  $('#lightbox').onclick = e => { if (e.target.id === 'lightbox') fecharLb(); };
  document.addEventListener('keydown', e => { if ($('#lightbox').hidden) return;
    if (e.key === 'Escape') fecharLb(); if (e.key === 'ArrowLeft') $('.lb-ant').click(); if (e.key === 'ArrowRight') $('.lb-prox').click(); });
});

// ---------- agendamento ----------
let horaEscolhida = null;
function selecionarTipo(id) {
  const r = document.querySelector(`input[name=tipo][value="${id}"]`);
  if (r) r.checked = true;
}
App.selecionarTipo = selecionarTipo;

function hojeAcre() { return new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); }

function montarAgendamento() {
  $('#opcoes-tipo').innerHTML = App.config.tiposAtendimento.map(t =>
    `<label><input type="radio" name="tipo" value="${esc(t.id)}"><span>${esc(t.nome)}<small>${esc(t.descricao)}</small></span></label>`).join('');
  const d = $('#ag-data');
  d.min = hojeAcre();
  d.addEventListener('change', () => carregarHorarios(d.value));
  document.querySelectorAll('[data-tipo]').forEach(a => a.addEventListener('click', () => selecionarTipo(a.dataset.tipo)));
  $('#horarios').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    e.preventDefault();
    $('#horarios').querySelectorAll('button').forEach(x => x.classList.toggle('ativo', x === b));
    horaEscolhida = b.dataset.hora;
  });
  $('#ag-tel').addEventListener('input', e => {
    const n = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.value = n.length > 6 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}` : n.length > 2 ? `(${n.slice(0, 2)}) ${n.slice(2)}` : n;
  });
  $('#form-agendar').addEventListener('submit', enviarAgendamento);
  atualizarResumoFavs();

  const menuBtn = $('.menu-btn');
  menuBtn.addEventListener('click', () => { const ab = $('.menu').classList.toggle('aberto'); menuBtn.setAttribute('aria-expanded', ab); });
  $('.menu').addEventListener('click', e => { if (e.target.tagName === 'A') $('.menu').classList.remove('aberto'); });
}

async function carregarHorarios(data) {
  horaEscolhida = null;
  $('#horarios').innerHTML = '<p class="dica">Carregando…</p>';
  const r = await fetch('/api/horarios?data=' + data).then(r => r.json());
  if (r.fechado || !r.horarios?.length) { $('#horarios').innerHTML = `<p class="dica">${esc(r.motivo || r.erro || 'Sem horários neste dia')}. Tente outra data.</p>`; return; }
  const livres = r.horarios.filter(h => h.disponivel).length;
  $('#horarios').innerHTML = r.horarios.map(h => `<button data-hora="${h.hora}" ${h.disponivel ? '' : 'disabled'}>${h.hora}</button>`).join('') +
    (livres ? '' : '<p class="dica">Dia lotado 😔 Escolha outra data.</p>');
}

async function enviarAgendamento(e) {
  e.preventDefault();
  const erro = $('#ag-erro'); erro.textContent = '';
  const tipo = document.querySelector('input[name=tipo]:checked')?.value;
  if (!tipo) return erro.textContent = 'Escolha o que você procura.';
  if (!$('#ag-data').value || !horaEscolhida) return erro.textContent = 'Escolha a data e o horário.';
  const favs = App.catalogo.filter(i => App.favoritos.has(i.id)).map(i => i.nome).join(', ');
  const body = { tipo, data: $('#ag-data').value, hora: horaEscolhida, nome: $('#ag-nome').value, telefone: $('#ag-tel').value,
    dataEvento: $('#ag-evento').value, acompanhantes: $('#ag-acomp').value, interesse: favs, observacoes: $('#ag-obs').value };
  const btn = e.target.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const r = await fetch('/api/agendamentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const ag = await r.json();
    if (!r.ok) { erro.textContent = ag.erro; if (r.status === 409) carregarHorarios(body.data); return; }
    mostrarSucesso(ag);
  } catch { erro.textContent = 'Sem conexão. Tente novamente ou chame no WhatsApp.'; }
  finally { btn.disabled = false; btn.textContent = 'Confirmar agendamento'; }
}

App.textoConfirmacao = ag => {
  const tipo = App.config.tiposAtendimento.find(t => t.id === ag.tipo)?.nome || ag.tipo;
  const [a, m, d] = ag.data.split('-');
  return `Olá! Acabei de agendar pelo site da Glamour Noivas 💍\n\n*Código:* ${ag.id}\n*Nome:* ${ag.nome}\n*Atendimento:* ${tipo}\n*Dia:* ${d}/${m}/${a} às ${ag.hora}` +
    (ag.dataEvento ? `\n*Data do evento:* ${ag.dataEvento.split('-').reverse().join('/')}` : '') +
    (ag.interesse ? `\n*Favoritos:* ${ag.interesse}` : '') + `\n\nPodem confirmar, por favor?`;
};

function mostrarSucesso(ag) {
  const [a, m, d] = ag.data.split('-');
  $('#form-agendar').hidden = true;
  const s = $('#ag-sucesso'); s.hidden = false;
  s.innerHTML = `<h3>Agendamento recebido! 💍</h3>
    <p>${esc(ag.nome.split(' ')[0])}, reservamos <strong>${d}/${m}/${a} às ${ag.hora}</strong> para você.</p>
    <p>Código: <span class="cod">${ag.id}</span></p>
    <p>Para garantir, envie a confirmação no nosso WhatsApp:</p>
    <a class="btn btn-ouro" target="_blank" rel="noopener" href="${whatsLink(App.textoConfirmacao(ag))}">Confirmar pelo WhatsApp</a>
    <p><button class="btn-texto" style="color:var(--ouro-texto)" onclick="GN.baixarIcs(${esc(JSON.stringify(ag)).replace(/"/g, '&quot;')})">📅 Salvar na agenda do celular</button></p>
    <p class="pequeno" style="margin-top:18px">Dica: traga uma lingerie cor da pele e o sapato com a altura que pretende usar.</p>`;
  s.scrollIntoView({ block: 'center' });
}

// ---------- arquivo de agenda (.ics): funciona no Google Agenda, iPhone e Outlook ----------
App.baixarIcs = ag => {
  const tipo = App.config.tiposAtendimento.find(t => t.id === ag.tipo)?.nome || 'Atendimento';
  const ini = ag.data.replace(/-/g, '') + 'T' + ag.hora.replace(':', '') + '00';
  const [h, m] = ag.hora.split(':').map(Number); const fimMin = h * 60 + m + 60;
  const fim = ag.data.replace(/-/g, '') + 'T' + String(Math.floor(fimMin / 60)).padStart(2, '0') + String(fimMin % 60).padStart(2, '0') + '00';
  const l = App.config.loja;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Glamour Noivas//PT', 'BEGIN:VEVENT', `UID:${ag.id}@glamournoivas`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=America/Rio_Branco:${ini}`, `DTEND;TZID=America/Rio_Branco:${fim}`,
    `SUMMARY:${l.nome} – ${tipo}`, `LOCATION:${l.endereco.replace(/,/g, '\\,')}`,
    `DESCRIPTION:Código ${ag.id}. Leve lingerie cor da pele e o sapato do evento.`,
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Amanhã: visita na Glamour Noivas', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'glamour-noivas.ics'; a.click();
};

// ---------- consulta / cancelamento pela cliente ----------
const STATUS_TXT = { pendente: 'Aguardando confirmação', confirmado: 'Confirmado ✅', concluido: 'Visita realizada', fechou: 'Contrato fechado 💍', cancelado: 'Cancelado', faltou: 'Não compareceu' };
async function consultar(acao) {
  const body = { id: $('#mc-id').value.trim(), telefone: $('#mc-tel').value, acao };
  const r = await fetch('/api/meu-agendamento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const ag = await r.json(); const out = $('#mc-resultado');
  if (!r.ok) { out.innerHTML = `<p class="erro" style="color:#a33">${esc(ag.erro)}</p>`; return; }
  const tipo = App.config.tiposAtendimento.find(t => t.id === ag.tipo)?.nome || ag.tipo;
  const futuro = ag.data >= hojeAcre() && ag.status !== 'cancelado';
  out.innerHTML = `<div class="mc-card"><h3>${esc(ag.nome.split(' ')[0])}, ${acao === 'cancelar' ? 'seu horário foi cancelado.' : 'aqui está seu agendamento'}</h3>
    <p><strong>${ag.data.split('-').reverse().join('/')} às ${ag.hora}</strong><br>${esc(tipo)}<br>Status: ${STATUS_TXT[ag.status] || ag.status}</p>
    ${futuro ? `<div class="acoes"><button class="btn btn-ouro" id="mc-ics">📅 Salvar na agenda</button>
      <a class="btn btn-linha" target="_blank" rel="noopener" href="${whatsLink(`Olá! Quero remarcar meu agendamento ${ag.id}.`)}">Remarcar</a></div>
      <p><button class="btn-texto" id="mc-cancelar">Cancelar este horário</button></p>` :
      acao === 'cancelar' ? `<p><a class="btn btn-ouro" href="#agendar">Escolher novo horário</a></p>` : ''}</div>`;
  $('#mc-ics')?.addEventListener('click', () => App.baixarIcs(ag));
  $('#mc-cancelar')?.addEventListener('click', () => { if (confirm('Tem certeza que deseja cancelar? O horário será liberado.')) consultar('cancelar'); });
}
document.addEventListener('DOMContentLoaded', () => {
  $('#form-consulta')?.addEventListener('submit', e => { e.preventDefault(); consultar(); });
  const q = new URLSearchParams(location.search); if (q.get('codigo')) { $('#mc-id').value = q.get('codigo'); $('#meu-agendamento').scrollIntoView(); }
});

init().catch(err => console.error('Falha ao carregar', err));
