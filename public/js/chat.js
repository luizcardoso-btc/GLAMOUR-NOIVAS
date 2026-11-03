// Vitória — assistente virtual 24h da Glamour Noivas (100% gratuita, roda no navegador)
(() => {
  const $ = s => document.querySelector(s);
  const msgs = $('#chat-msgs'), sug = $('#chat-sugestoes'), input = $('#chat-input');
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s/]/g, ' ').replace(/\s+/g, ' ').trim();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const linkify = s => esc(s).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">abrir link</a>').replace(/\*(.+?)\*/g, '<strong>$1</strong>');

  let fluxo = null; // estado do agendamento pelo chat
  let iniciado = false;

  const SUGESTOES_PADRAO = ['Agendar visita', 'Vestidos de noiva', 'Debutantes', 'Trajes masculinos', 'Valores', 'Endereço', 'Falar com a equipe'];

  function bot(texto, sugestoes = SUGESTOES_PADRAO, html = false) {
    const t = document.createElement('div'); t.className = 'msg bot digitando'; t.textContent = 'digitando…';
    msgs.appendChild(t); rolar(); sug.innerHTML = '';
    setTimeout(() => {
      t.className = 'msg bot';
      t.innerHTML = html ? texto : linkify(texto);
      sug.innerHTML = sugestoes.map(s => `<button type="button">${esc(s)}</button>`).join('');
      rolar();
    }, Math.min(900, 250 + texto.length * 4));
  }
  function eu(texto) { const d = document.createElement('div'); d.className = 'msg eu'; d.textContent = texto; msgs.appendChild(d); rolar(); }
  function rolar() { msgs.scrollTop = msgs.scrollHeight; }

  const horaAcre = () => new Date(Date.now() - 5 * 3600e3);
  const isoAcre = d => d.toISOString().slice(0, 10);
  const lojaAberta = () => {
    const d = horaAcre(), dia = d.getUTCDay(), h = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (dia === 0) return false;
    if (dia === 6) return h >= 8 && h < 13;
    return (h >= 8 && h < 12) || (h >= 14 && h < 18);
  };

  function saudacao() {
    const h = horaAcre().getUTCHours();
    const oi = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    bot(`${oi}. Eu sou a Vitória, assistente virtual da Glamour Noivas. Há mais de vinte anos e mais de 3 mil noivas vestidas em Rio Branco.\n\nPosso esclarecer suas dúvidas e reservar a sua visita agora mesmo, a qualquer hora. Como posso ajudar?`);
  }

  // ---------- interpretação de datas em português ----------
  const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  function lerData(txt) {
    const t = norm(txt), hoje = horaAcre();
    const base = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), 12));
    if (/\bhoje\b/.test(t)) return isoAcre(base);
    if (/depois de amanha/.test(t)) return isoAcre(new Date(base.getTime() + 2 * 864e5));
    if (/\bamanha\b/.test(t)) return isoAcre(new Date(base.getTime() + 864e5));
    const m = t.match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?/) || t.match(/\bdia (\d{1,2})\b/);
    if (m) {
      const dia = +m[1], mes = m[2] ? +m[2] : base.getUTCMonth() + 1;
      let ano = m[3] ? +m[3] : base.getUTCFullYear(); if (ano < 100) ano += 2000;
      let d = new Date(Date.UTC(ano, mes - 1, dia, 12));
      if (!m[3] && d < base) d = m[2] ? new Date(Date.UTC(ano + 1, mes - 1, dia, 12)) : new Date(Date.UTC(ano, mes, dia, 12));
      return d.getUTCDate() === dia ? isoAcre(d) : null;
    }
    const idx = DIAS.findIndex(d => t.includes(d));
    if (idx >= 0) { let diff = (idx - base.getUTCDay() + 7) % 7 || 7; return isoAcre(new Date(base.getTime() + diff * 864e5)); }
    return null;
  }
  const fmt = iso => iso.split('-').reverse().join('/');
  function proximosDiasUteis(n) {
    const out = []; let d = new Date(Date.UTC(horaAcre().getUTCFullYear(), horaAcre().getUTCMonth(), horaAcre().getUTCDate(), 12));
    while (out.length < n) { d = new Date(d.getTime() + 864e5); if (d.getUTCDay() !== 0) out.push(`${DIAS[d.getUTCDay()].replace('terca', 'terça').replace('sabado', 'sábado')} ${fmt(isoAcre(d)).slice(0, 5)}`); }
    return out;
  }

  // ---------- fluxo de agendamento ----------
  function iniciarAgendamento(tipoSugerido) {
    const tipos = GN.config.tiposAtendimento;
    fluxo = { etapa: 'tipo', dados: {} };
    if (tipoSugerido) { fluxo.dados.tipo = tipoSugerido; return pedirData(); }
    bot('Será um prazer receber você. Para começar, qual atendimento você procura?', [...tipos.map(t => t.nome), 'Cancelar']);
  }
  function pedirData() {
    fluxo.etapa = 'data';
    bot('Qual dia fica melhor para você? Pode escrever como preferir, por exemplo "sábado", "amanhã" ou "15/03".', [...proximosDiasUteis(4), 'Cancelar']);
  }
  async function mostrarHorarios(iso) {
    const r = await fetch('/api/horarios?data=' + iso).then(r => r.json()).catch(() => null);
    if (!r) return bot('Não consegui consultar a agenda agora. Tente novamente em instantes, por favor.', ['Cancelar']);
    const livres = (r.horarios || []).filter(h => h.disponivel).map(h => h.hora);
    if (r.fechado || !livres.length) return bot(`Em ${fmt(iso)} não temos horário${r.motivo ? ` (${r.motivo.toLowerCase()})` : ''}. Podemos tentar outro dia?`, [...proximosDiasUteis(4), 'Cancelar']);
    fluxo.dados.data = iso; fluxo.etapa = 'hora'; fluxo.livres = livres;
    bot(`Para ${fmt(iso)}, estes são os horários disponíveis. Qual prefere?`, [...livres, 'Outro dia', 'Cancelar']);
  }
  async function confirmar() {
    const d = fluxo.dados;
    try {
      const r = await fetch('/api/agendamentos', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...d, origem: 'chat', interesse: GN.catalogo.filter(i => GN.favoritos.has(i.id)).map(i => i.nome).join(', ') }) });
      const ag = await r.json();
      if (!r.ok) { if (r.status === 409) { fluxo.etapa = 'data'; return bot(ag.erro, [...proximosDiasUteis(4), 'Cancelar']); } throw new Error(ag.erro); }
      fluxo = null;
      const link = GN.whatsLink(GN.textoConfirmacao(ag));
      bot(`Tudo certo, ${esc(ag.nome.split(' ')[0])}. Sua visita está reservada para <strong>${fmt(ag.data)} às ${ag.hora}</strong>.<br>Código: <strong>${ag.id}</strong><br><br>Para concluir, envie a confirmação pelo nosso WhatsApp:<br><a href="${link}" target="_blank" rel="noopener">Confirmar pelo WhatsApp</a><br><br>Para a prova, venha com lingerie cor da pele e, se possível, traga o sapato com a altura que pretende usar.`, SUGESTOES_PADRAO, true);
    } catch (e) { bot('Não consegui concluir o agendamento agora. Fale com a nossa equipe pelo WhatsApp e finalizamos para você: ' + GN.whatsLink('Olá! Quero agendar uma visita.')); fluxo = null; }
  }

  function tratarFluxo(txt) {
    const t = norm(txt);
    if (/cancel|desist|parar|sair/.test(t)) { fluxo = null; return bot('Tudo bem, o agendamento foi interrompido. Quando quiser, retomamos. Posso ajudar com mais alguma coisa?'); }
    const d = fluxo.dados;
    switch (fluxo.etapa) {
      case 'tipo': {
        const tipos = GN.config.tiposAtendimento;
        const tipo = tipos.find(x => norm(x.nome) === t) || detectarTipo(t);
        if (!tipo) return bot('Não entendi bem. Escolha uma das opções, por favor:', [...tipos.map(x => x.nome), 'Cancelar']);
        d.tipo = typeof tipo === 'string' ? tipo : tipo.id; return pedirData();
      }
      case 'data': {
        const iso = lerData(txt);
        if (!iso) return bot('Não consegui entender a data. Tente, por exemplo, "sábado" ou "20/03".', [...proximosDiasUteis(4), 'Cancelar']);
        return mostrarHorarios(iso);
      }
      case 'hora': {
        if (/outro dia|outra data/.test(t)) return pedirData();
        const m = t.match(/(\d{1,2})(?:[:h ](\d{2}))?/);
        const hora = m && `${m[1].padStart(2, '0')}:${m[2] || '00'}`;
        if (!hora || !fluxo.livres.includes(hora)) return bot('Escolha um dos horários disponíveis, por favor:', [...fluxo.livres, 'Outro dia', 'Cancelar']);
        d.hora = hora; fluxo.etapa = 'nome';
        return bot('Perfeito. Qual é o seu nome completo?', ['Cancelar']);
      }
      case 'nome':
        if (txt.trim().length < 2) return bot('Por gentileza, informe o seu nome.', ['Cancelar']);
        d.nome = txt.trim().slice(0, 80); fluxo.etapa = 'telefone';
        return bot(`É um prazer, ${d.nome.split(' ')[0]}. Qual é o seu WhatsApp com DDD? A confirmação será enviada por ele.`, ['Cancelar']);
      case 'telefone': {
        const n = txt.replace(/\D/g, '');
        if (n.length < 10 || n.length > 13) return bot('Esse número parece incompleto. Envie com DDD, por exemplo 68 99999-9999.', ['Cancelar']);
        d.telefone = n; fluxo.etapa = 'evento';
        return bot('Você já tem a data do evento? Se sim, escreva aqui, por exemplo 12/09/2027. Se ainda não, toque em "Ainda não sei".', ['Ainda não sei', 'Cancelar']);
      }
      case 'evento': {
        if (!/nao sei|ainda nao|sem data|nao/.test(t)) { const iso = lerData(txt); if (iso) d.dataEvento = iso; }
        fluxo.etapa = 'confirmar';
        const tipoNome = GN.config.tiposAtendimento.find(x => x.id === d.tipo)?.nome;
        return bot(`Confira os dados, por favor:\n\n*${tipoNome}*\nDia: ${fmt(d.data)} às ${d.hora}\nNome: ${d.nome}\nWhatsApp: ${d.telefone}${d.dataEvento ? `\nData do evento: ${fmt(d.dataEvento)}` : ''}\n\nPosso confirmar?`, ['Confirmar', 'Mudar o dia', 'Cancelar']);
      }
      case 'confirmar':
        if (/mudar|outro|trocar/.test(t)) return pedirData();
        if (/confirm|sim|pode|isso|ok|certo/.test(t)) return confirmar();
        return bot('Toque em "Confirmar" para eu reservar o horário.', ['Confirmar', 'Mudar o dia', 'Cancelar']);
    }
  }

  function detectarTipo(t) {
    if (/15|quinze|debut/.test(t)) return 'debutante';
    if (/paleto|terno|noivo|pajem|padrinho/.test(t)) return 'trajes-masculinos';
    if (/cerimon|organiz/.test(t)) return 'cerimonial';
    if (/madrinha|festa|mae/.test(t)) return 'madrinhas-festa';
    if (/prova|ajuste/.test(t)) return 'noiva-prova';
    if (/devol|retir/.test(t)) return 'retirada-devolucao';
    if (/noiva|casament|vestido/.test(t)) return 'noiva-primeira';
    return null;
  }

  // ---------- respostas gerais ----------
  function responder(txt) {
    if (fluxo) return tratarFluxo(txt);
    const t = norm(txt);

    if (/agend|marcar|horario disponivel|visita|provar|prova|reserv|atendimento com hora/.test(t) && !/horario de funcionamento/.test(t))
      return iniciarAgendamento(/agendar visita/.test(t) ? null : detectarTipo(t));
    if (/cancelar|desmarcar|remarcar|mudar meu horario|meu agendamento|ja agendei/.test(t)) {
      document.querySelector('#meu-agendamento').scrollIntoView();
      return bot('Claro. Abri a seção "Meu agendamento" para você: basta informar o código recebido e o seu WhatsApp para consultar, cancelar ou pedir para remarcar.', ['Agendar visita', 'Falar com a equipe']);
    }
    if (/atendente|humano|pessoa|whats|falar com|equipe|ligar|telefone|contato/.test(t)) {
      const aviso = lojaAberta() ? 'Nossa equipe está disponível agora.' : 'Estamos fora do horário de atendimento, mas sua mensagem fica registrada e respondemos assim que abrirmos.';
      const cs = GN.config.loja.contatos || [];
      return bot(`${aviso}<br><br>Fale direto com a gente pelo WhatsApp:<br>` + cs.map(c => `<a target="_blank" rel="noopener" href="https://wa.me/${c.whatsapp}?text=${encodeURIComponent('Olá, ' + c.nome + '! Vim pelo site da Glamour Noivas.')}">${esc(c.nome)}</a> · ${esc(c.telefone)} <small>(${esc(c.funcao)})</small>`).join('<br>'), SUGESTOES_PADRAO, true);
    }
    if (/^(oi|ola|bom dia|boa tarde|boa noite|hey|eai|opa)\b/.test(t) && t.length < 25) return saudacao();
    if (/obrigad|valeu|brigad/.test(t)) return bot('Eu que agradeço. Estou à disposição a qualquer hora.');
    if (/^(debutantes?)$/.test(t)) return responder('15 anos');
    if (/^trajes masculinos$/.test(t)) return responder('paleto');
    if (/^(vestidos? de noiva|noiva)/.test(t)) return bot('Nosso acervo de noivas reúne modelos princesa, sereia, evasê, boho, minimalistas e plus size, para aluguel ou venda, sempre com ajustes no ateliê.\n\nGostaria de ver alguns modelos ou prefere agendar sua prova?', ['Agendar visita', 'Ver coleção', 'Valores']);
    if (/ver colecao|colecao|ver catalogo|catalogo|modelos/.test(t)) { document.querySelector('#catalogo').scrollIntoView(); return bot('Abri a coleção para você. Toque no coração dos modelos que encantarem você: eles ficam anotados no seu agendamento.', ['Agendar visita', 'Falar com a equipe']); }

    // FAQ por pontuação de palavras-chave
    let melhor = null, pts = 0;
    for (const f of GN.config.faq) {
      const p = f.chaves.reduce((s, k) => s + (t.includes(norm(k)) ? norm(k).length : 0), 0);
      if (p > pts) { pts = p; melhor = f; }
    }
    if (melhor) return bot(GN.preencher(melhor.resposta), ['Agendar visita', 'Falar com a equipe', 'Outra dúvida']);
    if (/outra duvida/.test(t)) return bot('Fique à vontade para perguntar: valores, prazos, ajustes, acessórios ou cerimonial.');

    fetch('/api/perguntas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: txt }) }).catch(() => {});
    bot(`Não tenho essa resposta ainda, mas a nossa equipe pode ajudar. Escolha um dos assuntos abaixo ou fale conosco pelo WhatsApp: ${GN.whatsLink('Olá! Tenho uma dúvida: ' + txt)}`);
  }

  // ---------- eventos ----------
  function abrir() {
    $('#chat').hidden = false; $('#chat-abrir').hidden = true;
    if (!iniciado) { iniciado = true; const esperar = () => GN.config ? saudacao() : setTimeout(esperar, 200); esperar(); }
    setTimeout(() => input.focus(), 100);
  }
  $('#chat-abrir').addEventListener('click', abrir);
  $('#chat-fechar').addEventListener('click', () => { $('#chat').hidden = true; $('#chat-abrir').hidden = false; });
  $('#chat-form').addEventListener('submit', e => { e.preventDefault(); const v = input.value.trim(); if (!v || !GN.config) return; eu(v); input.value = ''; responder(v); });
  sug.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const v = b.textContent.replace(/^[^\wÀ-ú0-9]+\s*/u, ''); eu(b.textContent); responder(v); });
  window.abrirChat = abrir;
})();
