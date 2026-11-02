// Glamour Noivas — site público
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const App = { config: null, catalogo: [], favoritos: new Set(JSON.parse(localStorage.getItem('gn-favs') || '[]')) };
window.GN = App;

const SILHUETAS = {
  vestido: '<svg viewBox="0 0 100 140" fill="#5a2f41"><path d="M40 8c0-4 20-4 20 0l-2 14c6 4 8 10 6 18l-4 10c14 22 26 52 34 86H6c8-34 20-64 34-86l-4-10c-2-8 0-14 6-18z"/></svg>',
  paleto: '<svg viewBox="0 0 100 140" fill="#5a2f41"><path d="M30 10l20 14 20-14 22 10 4 110H4L8 20zM50 24l-8 40 8 10 8-10z" /><path d="M46 26h8l-4 10z" fill="#e8d6b3"/></svg>',
  acessorio: '<svg viewBox="0 0 100 100" fill="#5a2f41"><path d="M10 70l8-40 16 22 16-34 16 34 16-22 8 40z"/><rect x="10" y="74" width="80" height="10" rx="3"/></svg>'
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
  $('#rod-whats').href = whatsLink('Olá! Vim pelo site da Glamour Noivas.');
  $('#rod-insta').href = l.instagram;
  $('#rod-mapa').href = l.mapsUrl;
  $('#ano').textContent = new Date().getFullYear();

  montarCatalogo();
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
      <div class="foto">${i.imagem ? `<img src="${esc(i.imagem)}" alt="${esc(i.nome)}" loading="lazy">` : silhueta(i.categoria)}</div>
      ${i.destaque ? '<span class="selo">DESTAQUE</span>' : ''}
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
    <p class="pequeno" style="margin-top:18px">Dica: traga uma lingerie cor da pele e o sapato com a altura que pretende usar.</p>`;
  s.scrollIntoView({ block: 'center' });
}

init().catch(err => console.error('Falha ao carregar', err));
