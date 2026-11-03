// Glamour Noivas — Financeiro / Contador virtual (painel administrativo)
// Usa do admin.html: api(), esc(), $()
(() => {
  const F = { d: null, aba: 'visao', mes: '' };
  window.FIN = F;
  const R$ = v => (v < 0 ? '-' : '') + 'R$ ' + Math.abs(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const R0 = v => (v < 0 ? '-' : '') + 'R$ ' + Math.abs(Math.round(v || 0)).toLocaleString('pt-BR');
  const pct = v => (Number.isFinite(v) ? (Math.abs(v) < 0.05 ? 0 : v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0') + '%';
  const br = iso => iso ? iso.split('-').reverse().join('/') : '';
  const ym = iso => (iso || '').slice(0, 7);
  const ultimoDia = m => { const [a, b] = m.split('-').map(Number); return new Date(Date.UTC(a, b, 0)).toISOString().slice(0, 10); };
  const addMes = (m, n) => { const [a, b] = m.split('-').map(Number); const d = new Date(Date.UTC(a, b - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const nomeMes = m => { const [a, b] = m.split('-').map(Number); return new Date(Date.UTC(a, b - 1, 15)).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace('.', ''); };
  const nomeMesLongo = m => { const [a, b] = m.split('-').map(Number); return new Date(Date.UTC(a, b - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
  const mesesEntre = (a, b) => { const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0); };
  const soma = (arr, f = x => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);
  const ROTULO_FORMA = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito à vista', parcelado: 'Crédito parcelado', boleto: 'Boleto', transferencia: 'Transferência' };
  const ROTULO_TIPO = { aluguel: 'Aluguel', venda: 'Venda', cerimonial: 'Cerimonial', ajuste: 'Ajustes' };
  const ROTULO_STATUS_PECA = { disponivel: 'Disponível', ajuste: 'Em ajuste', vendida: 'Vendida', baixada: 'Baixada' };

  // ---------------------------------------------------------------- dados
  async function carregar() {
    F.d = await api('/api/admin/fin/tudo');
    F.mes = F.mes || ym(F.d.hoje);
    render();
  }
  const grupoDe = cat => Object.entries(F.d.categorias.despesas).find(([, l]) => l.includes(cat))?.[0] || 'Outras';
  const FORA_DO_RESULTADO = ['Investimento em acervo', 'Móveis e equipamentos', 'Reforma', 'Empréstimo (parcela)', 'Retirada de sócios'];

  // ---------------------------------------------------------------- contabilidade
  function depNoMes(p, m) { // depreciação do acervo em um mês
    if (!p.custo) return 0;
    const ini = ym(p.dataAquisicao); if (m < ini) return 0;
    if (p.dataBaixa && ['vendida', 'baixada'].includes(p.status) && m > ym(p.dataBaixa)) return 0;
    const idx = (Number(m.slice(0, 4)) - Number(ini.slice(0, 4))) * 12 + Number(m.slice(5)) - Number(ini.slice(5));
    return idx < p.vidaUtilMeses ? p.custo / p.vidaUtilMeses : 0;
  }
  function depAcumulada(p, ate) {
    if (!p.custo || p.dataAquisicao > ate) return 0;
    return Math.min(p.custo, (p.custo / p.vidaUtilMeses) * Math.max(0, mesesEntre(p.dataAquisicao, ate) + 1));
  }
  function dre(mIni, mFim) {
    const L = F.d.lancamentos.filter(l => ym(l.data) >= mIni && ym(l.data) <= mFim);
    const rec = L.filter(l => l.tipo === 'receita'), des = L.filter(l => l.tipo === 'despesa');
    const receitaBruta = soma(rec, l => l.valor);
    const porCat = {}; rec.forEach(l => porCat[l.categoria] = (porCat[l.categoria] || 0) + l.valor);
    const das = soma(des.filter(l => l.categoria === 'Impostos (DAS / Simples)'), l => l.valor);
    const impostoEstimado = receitaBruta * F.d.config.aliquotaImposto / 100;
    const impostos = das > 0 ? das : impostoEstimado;
    const taxas = soma(rec, l => l.taxa) + soma(des.filter(l => l.categoria === 'Taxas bancárias'), l => l.valor);
    const g = nome => des.filter(l => grupoDe(l.categoria) === nome && !FORA_DO_RESULTADO.includes(l.categoria));
    const custoVar = soma(g('Custo variável'), l => l.valor);
    let fixasPrevistas = 0;
    for (let m = mIni; m <= mFim; m = addMes(m, 1)) if (m >= ym(F.d.hoje)) fixasPrevistas += soma(fixasProjetadas(m), f => f.valor);
    const fixas = soma(g('Despesa fixa'), l => l.valor) + soma(g('Impostos e taxas').filter(l => !['Impostos (DAS / Simples)', 'Taxas bancárias', 'Alvarás e licenças'].includes(l.categoria)), l => l.valor) + fixasPrevistas;
    const outrasImp = soma(des.filter(l => l.categoria === 'Alvarás e licenças'), l => l.valor);
    const financeiras = soma(des.filter(l => l.categoria === 'Juros e multas'), l => l.valor);
    const outras = soma(g('Outras'), l => l.valor);
    let deprec = 0; for (let m = mIni; m <= mFim; m = addMes(m, 1)) deprec += soma(F.d.estoque, p => depNoMes(p, m));
    const receitaLiquida = receitaBruta - impostos - taxas;
    const margemContrib = receitaLiquida - custoVar;
    const resultado = margemContrib - fixas - outrasImp - outras - deprec - financeiras;
    const investido = soma(des.filter(l => ['Investimento em acervo', 'Móveis e equipamentos', 'Reforma'].includes(l.categoria)), l => l.valor);
    return { fixasPrevistas, receitaBruta, porCat, impostos, impostoEstimado: das <= 0, taxas, receitaLiquida, custoVar, margemContrib, fixas, outrasImp, outras, deprec, financeiras, resultado,
      margem: receitaBruta ? resultado / receitaBruta * 100 : 0, investido, nRec: rec.length,
      despesasPorCat: Object.entries(des.reduce((o, l) => (o[l.categoria] = (o[l.categoria] || 0) + l.valor, o), {})).sort((a, b) => b[1] - a[1]) };
  }
  function inicioCaixa(l) { const di = F.d.config.dataSaldoInicial; return !di || (l.dataPagamento || '') >= di; }
  function caixaEm(dt) {
    const c = F.d.config;
    return c.saldoInicial + soma(F.d.lancamentos.filter(l => l.pago && l.dataPagamento <= dt && inicioCaixa(l)), l => l.tipo === 'receita' ? l.valor - l.taxa : -l.valor);
  }
  function balanco(dt) {
    const L = F.d.lancamentos;
    const caixa = caixaEm(dt);
    const receber = soma(L.filter(l => l.tipo === 'receita' && l.data <= dt && (!l.pago || l.dataPagamento > dt)), l => l.valor - l.taxa);
    const pagar = soma(L.filter(l => l.tipo === 'despesa' && l.data <= dt && (!l.pago || l.dataPagamento > dt)), l => l.valor);
    const ativos = F.d.estoque.filter(p => p.dataAquisicao <= dt && !(['vendida', 'baixada'].includes(p.status) && p.dataBaixa && p.dataBaixa <= dt));
    const acervoBruto = soma(ativos, p => p.custo), depAc = soma(ativos, p => depAcumulada(p, dt));
    const mes = ym(dt), d = dre(mes, mes);
    const impostosRecolher = d.impostoEstimado ? d.impostos : 0;
    const ativoCirc = caixa + receber, ativoNaoCirc = acervoBruto - depAc;
    const passivo = pagar + impostosRecolher;
    const pl = ativoCirc + ativoNaoCirc - passivo;
    return { caixa, receber, acervoBruto, depAc, acervoLiquido: ativoNaoCirc, ativoCirc, ativoTotal: ativoCirc + ativoNaoCirc, pagar, impostosRecolher, passivo,
      capital: F.d.config.capitalSocial, lucrosAcumulados: pl - F.d.config.capitalSocial, pl, liquidezCorrente: passivo ? ativoCirc / passivo : Infinity, nPecas: ativos.length };
  }
  function fixasProjetadas(m) { // despesas fixas configuradas ainda não lançadas no mês
    return F.d.config.despesasFixas.filter(f => f.ativo !== false && !F.d.lancamentos.some(l => l.fixoId === `${f.id}-${m}`))
      .map(f => ({ ...f, vencimento: `${m}-${String(f.dia).padStart(2, '0')}` }));
  }
  function fluxo(meses = 3) {
    const hoje = F.d.hoje, base = ym(hoje);
    let saldo = caixaEm(hoje);
    const abertos = F.d.lancamentos.filter(l => !l.pago);
    const linhas = [];
    const atrasRec = soma(abertos.filter(l => l.tipo === 'receita' && l.vencimento < hoje), l => l.valor - l.taxa);
    const atrasPag = soma(abertos.filter(l => l.tipo === 'despesa' && l.vencimento < hoje), l => l.valor);
    linhas.push({ rotulo: 'Em atraso', entradas: atrasRec, saidas: atrasPag });
    for (let i = 0; i < meses; i++) {
      const m = addMes(base, i);
      const no = l => ym(l.vencimento) === m && l.vencimento >= hoje;
      const fixas = soma(fixasProjetadas(m).filter(f => f.vencimento >= hoje), f => f.valor);
      linhas.push({ rotulo: nomeMesLongo(m), entradas: soma(abertos.filter(l => l.tipo === 'receita' && no(l)), l => l.valor - l.taxa),
        saidas: soma(abertos.filter(l => l.tipo === 'despesa' && no(l)), l => l.valor) + fixas, fixas });
    }
    const inicial = saldo;
    for (const l of linhas) { saldo += l.entradas - l.saidas; l.saldo = saldo; }
    return { inicial, linhas };
  }
  function custoFixoMensal() {
    const conf = soma(F.d.config.despesasFixas.filter(f => f.ativo !== false), f => f.valor);
    const ult = [1, 2, 3].map(i => dre(addMes(ym(F.d.hoje), -i), addMes(ym(F.d.hoje), -i)).fixas);
    return Math.max(conf, soma(ult) / 3);
  }
  function indicadores() {
    const hoje = ym(F.d.hoje), ms = [1, 2, 3, 4, 5, 6].map(i => addMes(hoje, -i)).concat([hoje]);
    const recAlug = F.d.contratos.filter(c => c.status !== 'cancelado' && ms.includes(ym(c.dataContrato)));
    const ticket = recAlug.length ? soma(recAlug, c => c.valorTotal - c.desconto) / recAlug.length : 0;
    const d6 = dre(ms[5], hoje);
    const varPct = d6.receitaBruta ? d6.custoVar / d6.receitaBruta * 100 : 8;
    const taxaPct = d6.receitaBruta ? d6.taxas / d6.receitaBruta * 100 : 2;
    const fixo = custoFixoMensal();
    const mcUnit = ticket * (1 - (F.d.config.aliquotaImposto + taxaPct + varPct) / 100);
    const pe = mcUnit > 0 ? fixo / mcUnit : 0;
    const contratosMes = F.d.contratos.filter(c => c.status !== 'cancelado' && ym(c.dataContrato) === hoje).length;
    return { ticket, varPct, taxaPct, fixo, mcUnit, pe, contratosMes, contratos6: recAlug.length / 7 };
  }
  function statsPeca(p) {
    const cs = F.d.contratos.filter(c => c.status !== 'cancelado' && c.pecas.includes(p.id));
    const receita = soma(cs, c => (c.valorTotal - c.desconto) / Math.max(1, c.pecas.length));
    const ultimo = cs.map(c => c.retirada || c.dataContrato).sort().pop() || '';
    const roi = p.custo ? (receita - p.custo) / p.custo * 100 : null;
    const valorContabil = p.custo - depAcumulada(p, F.d.hoje);
    const alugueisPayback = p.valorAluguel > 0 && p.custo > receita ? Math.ceil((p.custo - receita) / (p.valorAluguel * (1 - (F.d.config.aliquotaImposto + 10) / 100))) : 0;
    const parada = ['disponivel', 'ajuste'].includes(p.status) && (!ultimo ? mesesEntre(p.dataAquisicao, F.d.hoje) >= 6 : mesesEntre(ultimo, F.d.hoje) >= 6);
    return { usos: cs.length, receita, ultimo, roi, valorContabil, alugueisPayback, pago: p.custo > 0 && receita >= p.custo, parada };
  }
  function alugadaAgora(p) {
    const h = F.d.hoje;
    return F.d.contratos.find(c => c.status === 'ativo' && c.tipo === 'aluguel' && c.pecas.includes(p.id) && c.retirada && c.devolucao && c.retirada <= h && h <= c.devolucao);
  }

  // ---------------------------------------------------------------- contador virtual
  function alertas() {
    const out = [], c = F.d.config, hoje = F.d.hoje, m = ym(hoje);
    const add = (nivel, titulo, texto) => out.push({ nivel, titulo, texto });
    const L = F.d.lancamentos.filter(l => !l.pago);
    const vencRec = L.filter(l => l.tipo === 'receita' && l.vencimento < hoje), vencPag = L.filter(l => l.tipo === 'despesa' && l.vencimento < hoje);
    if (vencPag.length) add('critico', `${vencPag.length} conta(s) a pagar vencida(s)`, `Total de ${R$(soma(vencPag, l => l.valor))}. Pague ou renegocie para evitar juros e multas.`);
    if (vencRec.length) add('atencao', `${vencRec.length} recebimento(s) em atraso`, `${R$(soma(vencRec, l => l.valor))} de clientes. Cobre antes da retirada das peças: ${[...new Set(vencRec.map(l => l.descricao.split('·')[1]?.trim() || l.descricao))].slice(0, 3).join(', ')}.`);
    const prox = L.filter(l => l.tipo === 'despesa' && l.vencimento >= hoje && l.vencimento <= new Date(Date.parse(hoje) + 7 * 864e5).toISOString().slice(0, 10));
    if (prox.length) add('agenda', `${prox.length} conta(s) vencem nos próximos 7 dias`, `${R$(soma(prox, l => l.valor))}: ${prox.slice(0, 4).map(l => `${l.descricao || l.categoria} (${br(l.vencimento)})`).join('; ')}.`);
    const fx = fixasProjetadas(m);
    if (fx.length) add('agenda', 'Contas fixas do mês ainda não lançadas', `${fx.map(f => f.nome).join(', ')}. Use "Gerar contas fixas do mês" em Lançamentos.`);
    const d = dre(m, m), dAnt = dre(addMes(m, -1), addMes(m, -1));
    if (d.receitaBruta || d.fixas) {
      if (d.resultado < 0) add('critico', 'O mês está no prejuízo', `Resultado de ${R$(d.resultado)} até agora. Faltam ${R$(-d.resultado)} de lucro para equilibrar. Priorize fechar contratos e adie gastos que não são essenciais.`);
      else if (d.margem < c.margemMinima) add('atencao', `Margem abaixo da meta (${pct(d.margem)} de ${pct(c.margemMinima)})`, 'Reveja descontos, o preço dos aluguéis mais procurados e os custos de lavanderia e costura.');
      else add('ok', `Mês em superávit: ${R$(d.resultado)}`, `Margem líquida de ${pct(d.margem)}, acima da meta de ${pct(c.margemMinima)}.`);
    }
    if (dAnt.receitaBruta) {
      const cats = {}; d.despesasPorCat.forEach(([k, v]) => cats[k] = v);
      const ant = Object.fromEntries(dAnt.despesasPorCat);
      const sub = Object.entries(cats).filter(([k, v]) => ant[k] && v > ant[k] * 1.3 && v - ant[k] > 100 && !FORA_DO_RESULTADO.includes(k)).sort((a, b) => (b[1] - ant[b[0]]) - (a[1] - ant[a[0]]))[0];
      if (sub) add('atencao', `${sub[0]} subiu ${pct((sub[1] / ant[sub[0]] - 1) * 100)} em relação ao mês passado`, `${R$(ant[sub[0]])} → ${R$(sub[1])}. Vale conferir o motivo.`);
    }
    if (c.metaMensal > 0) {
      const p = d.receitaBruta / c.metaMensal * 100;
      add(p >= 100 ? 'ok' : 'info', `Meta de faturamento: ${pct(p)} atingida`, `${R$(d.receitaBruta)} de ${R$(c.metaMensal)} em ${nomeMesLongo(m)}.`);
    }
    const fl = fluxo(3), neg = fl.linhas.find(l => l.saldo < 0);
    if (neg) add('critico', `Caixa projetado negativo em ${neg.rotulo}`, `Saldo previsto de ${R$(neg.saldo)}. Antecipe recebimentos (sinais), negocie prazos com fornecedores ou adie compras de peças.`);
    const ind = indicadores(), caixa = caixaEm(hoje);
    if (ind.fixo > 0) {
      const meses = caixa / ind.fixo;
      if (meses < c.reservaMeses) add('atencao', `Reserva de emergência cobre ${meses.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mês(es)`, `O ideal são ${c.reservaMeses} meses de custo fixo (${R$(ind.fixo * c.reservaMeses)}). Separe parte do lucro de cada mês até chegar lá.`);
      if (ind.pe > 0) add(ind.contratosMes >= ind.pe ? 'ok' : 'info', `Ponto de equilíbrio: ${Math.ceil(ind.pe)} contratos por mês`, `Com ticket médio de ${R$(ind.ticket)} e custo fixo de ${R$(ind.fixo)}. Neste mês: ${ind.contratosMes} contrato(s).`);
    }
    const st = F.d.estoque.filter(p => !['vendida', 'baixada'].includes(p.status)).map(p => ({ p, s: statsPeca(p) }));
    const paradas = st.filter(x => x.s.parada);
    if (paradas.length) add('dica', `${paradas.length} peça(s) paradas há mais de 6 meses`, `${paradas.slice(0, 4).map(x => x.p.nome).join(', ')}. Considere destacar no Instagram, oferecer como "pronta-entrega" para venda ou fazer um ajuste de modelagem.`);
    const campeas = st.filter(x => x.s.pago).sort((a, b) => b.s.roi - a.s.roi).slice(0, 3);
    if (campeas.length) add('ok', 'Peças que já se pagaram', campeas.map(x => `${x.p.nome} (retorno de ${pct(x.s.roi)})`).join(', ') + '. Bons modelos para investir em similares.');
    if (!F.d.estoque.length) add('dica', 'Cadastre o acervo', 'Em Acervo, importe as peças da coleção e informe o custo de cada uma. Assim o sistema calcula o patrimônio, a depreciação e o retorno de cada vestido.');
    if (!c.saldoInicial && !c.dataSaldoInicial) add('dica', 'Informe o saldo inicial do caixa', 'Em Configurações, coloque quanto há hoje em conta e no caixa. Sem isso o balanço começa do zero.');
    const ret = F.d.contratos.filter(x => x.status === 'ativo' && x.tipo === 'aluguel' && ((x.retirada >= hoje && x.retirada <= addDias(hoje, 7)) || (x.devolucao >= hoje && x.devolucao <= addDias(hoje, 7))));
    if (ret.length) add('agenda', `${ret.length} retirada(s) ou devolução(ões) nesta semana`, ret.slice(0, 5).map(x => `${x.cliente}: ${x.retirada >= hoje && x.retirada <= addDias(hoje, 7) ? 'retira ' + br(x.retirada) : 'devolve ' + br(x.devolucao)}`).join('; ') + '.');
    const ordem = { critico: 0, atencao: 1, agenda: 2, info: 3, ok: 4, dica: 5 };
    return out.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
  }
  const addDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

  // ---------------------------------------------------------------- gráfico (receitas x despesas, 6 meses)
  function grafico() {
    const m = F.mes, meses = [-5, -4, -3, -2, -1, 0].map(i => addMes(m, i));
    const dados = meses.map(x => { const d = dre(x, x); const des = d.impostos + d.taxas + d.custoVar + d.fixas + d.outrasImp + d.outras + d.deprec + d.financeiras; return { m: x, rec: d.receitaBruta, des, res: d.resultado }; });
    const max = Math.max(1, ...dados.flatMap(d => [d.rec, d.des]));
    const passo = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); return [1, 2, 2.5, 5, 10].map(k => k * p).find(v => max / v <= 4); })();
    const topo = Math.ceil(max / passo) * passo;
    const W = 640, H = 240, ml = 64, mr = 8, mt = 12, mb = 28, gw = (W - ml - mr) / dados.length, bw = Math.min(26, gw / 3);
    const y = v => mt + (H - mt - mb) * (1 - v / topo);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e despesas nos últimos 6 meses" class="fin-chart">`;
    for (let v = 0; v <= topo + 1e-6; v += passo) svg += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" class="grade"/><text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end" class="eixo">${R0(v).replace('R$ ', '')}</text>`;
    const barra = (x, v, cls) => { const h = Math.max(0, y(0) - y(v)); if (h <= 0) return ''; const r = Math.min(4, h); return `<path class="${cls}" d="M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + bw - r} Q${x + bw},${y(v)} ${x + bw},${y(v) + r} V${y(0)} Z"/>`; };
    dados.forEach((d, i) => {
      const cx = ml + gw * i + gw / 2;
      svg += barra(cx - bw - 1, d.rec, 'b-rec') + barra(cx + 1, d.des, 'b-des');
      svg += `<text x="${cx}" y="${H - 8}" text-anchor="middle" class="eixo${d.m === m ? ' atual' : ''}">${nomeMes(d.m)}</text>`;
      svg += `<rect x="${ml + gw * i}" y="${mt}" width="${gw}" height="${H - mt - mb}" class="hit" data-i="${i}"/>`;
    });
    svg += `<line x1="${ml}" x2="${W - mr}" y1="${y(0)}" y2="${y(0)}" class="base"/></svg>`;
    F.grafDados = dados;
    return `<div class="fin-graf"><div class="legenda"><span><i class="sw rec"></i>Receitas</span><span><i class="sw des"></i>Despesas (inclui impostos, taxas e depreciação)</span></div>${svg}<div class="tooltip" hidden></div></div>`;
  }
  function ligarGrafico(raiz) {
    const g = raiz.querySelector('.fin-graf'); if (!g) return;
    const tip = g.querySelector('.tooltip');
    g.querySelectorAll('.hit').forEach(r => {
      const mostra = () => {
        const d = F.grafDados[+r.dataset.i];
        tip.innerHTML = `<b>${nomeMesLongo(d.m)}</b><span><i class="sw rec"></i>Receitas <b>${R$(d.rec)}</b></span><span><i class="sw des"></i>Despesas <b>${R$(d.des)}</b></span><span>Resultado <b class="${d.res < 0 ? 'neg' : 'pos'}">${R$(d.res)}</b></span>`;
        tip.hidden = false;
        const gb = g.getBoundingClientRect(), rb = r.getBoundingClientRect();
        tip.style.left = Math.min(gb.width - 220, Math.max(0, rb.left - gb.left + rb.width / 2 - 110)) + 'px';
        g.querySelectorAll('.hit').forEach(x => x.classList.toggle('on', x === r));
      };
      r.addEventListener('mouseenter', mostra); r.addEventListener('click', mostra);
    });
    g.addEventListener('mouseleave', () => { tip.hidden = true; g.querySelectorAll('.hit').forEach(x => x.classList.remove('on')); });
  }

  // ---------------------------------------------------------------- telas
  const ABAS = [['visao', 'Visão geral'], ['lanc', 'Lançamentos'], ['contratos', 'Contratos'], ['acervo', 'Acervo'], ['relatorios', 'DRE e balanço'], ['simulador', 'Simulador'], ['config', 'Configurações']];
  function render() {
    const raiz = $('#aba-financeiro');
    raiz.innerHTML = `<div class="fin-topo"><nav class="fin-abas">${ABAS.map(([k, n]) => `<button data-fa="${k}" class="${F.aba === k ? 'ativo' : ''}">${n}</button>`).join('')}</nav>
      <label class="fin-mes">Mês de referência <input type="month" id="fin-mes" value="${F.mes}"></label></div><div id="fin-corpo"></div>`;
    raiz.querySelectorAll('[data-fa]').forEach(b => b.onclick = () => { F.aba = b.dataset.fa; render(); });
    $('#fin-mes').onchange = e => { if (e.target.value) { F.mes = e.target.value; render(); } };
    ({ visao, lanc, contratos, acervo, relatorios, simulador, config })[F.aba]();
  }
  const corpo = html => { $('#fin-corpo').innerHTML = html; return $('#fin-corpo'); };
  const kpi = (rotulo, valor, sub = '', cls = '') => `<div class="card fin-kpi ${cls}"><span>${rotulo}</span><b>${valor}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;

  function visao() {
    const m = F.mes, d = dre(m, m), b = balanco(F.mes === ym(F.d.hoje) ? F.d.hoje : ultimoDia(m)), ind = indicadores(), al = alertas();
    const aReceber = soma(F.d.lancamentos.filter(l => l.tipo === 'receita' && !l.pago), l => l.valor - l.taxa);
    const aPagar = soma(F.d.lancamentos.filter(l => l.tipo === 'despesa' && !l.pago), l => l.valor);
    const r = corpo(`
      <div class="cards">
        ${kpi('Faturamento do mês', R$(d.receitaBruta), nomeMesLongo(m))}
        ${kpi(d.fixasPrevistas ? 'Resultado previsto do mês' : 'Resultado do mês', R$(d.resultado), `Margem ${pct(d.margem)}${d.fixasPrevistas ? ' · com contas fixas previstas' : ''}`, d.resultado < 0 ? 'neg' : 'pos')}
        ${kpi('Caixa hoje', R$(caixaEm(F.d.hoje)), 'Contas e dinheiro em espécie')}
        ${kpi('A receber', R$(aReceber), 'Parcelas e sinais em aberto')}
        ${kpi('A pagar', R$(aPagar), 'Contas em aberto')}
        ${kpi('Patrimônio líquido', R$(b.pl), `Acervo vale ${R$(b.acervoLiquido)}`)}
      </div>
      <div class="fin-duas">
        <div class="fin-bloco"><h3>Contador virtual</h3><ul class="fin-alertas">${al.length ? al.map(a => `<li class="${a.nivel}"><b>${esc(a.titulo)}</b><span>${esc(a.texto)}</span></li>`).join('') : '<li class="ok"><b>Tudo em ordem</b><span>Nenhum ponto de atenção no momento.</span></li>'}</ul></div>
        <div class="fin-bloco"><h3>Receitas e despesas</h3>${grafico()}
          <div class="fin-mini">${kpi('Ticket médio', R$(ind.ticket), 'por contrato')}${kpi('Ponto de equilíbrio', ind.pe ? Math.ceil(ind.pe) + ' contratos' : '—', 'por mês')}${kpi('Custo fixo', R$(ind.fixo), 'por mês')}</div>
        </div>
      </div>`);
    ligarGrafico(r);
  }

  // ---------- lançamentos
  function opcoesCategorias(tipo, sel = '') {
    if (tipo === 'receita') return F.d.categorias.receitas.map(c => `<option${c === sel ? ' selected' : ''}>${c}</option>`).join('');
    return Object.entries(F.d.categorias.despesas).map(([g, l]) => `<optgroup label="${g}">${l.map(c => `<option${c === sel ? ' selected' : ''}>${c}</option>`).join('')}</optgroup>`).join('');
  }
  const opcoesFormas = sel => F.d.formas.map(f => `<option value="${f}"${f === sel ? ' selected' : ''}>${ROTULO_FORMA[f]}</option>`).join('');
  function lanc() {
    F.filtroL = F.filtroL || { tipo: '', situacao: '' };
    const m = F.mes, fl = F.filtroL;
    let lista = F.d.lancamentos.filter(l => ym(l.vencimento) === m || ym(l.data) === m || (!l.pago && l.vencimento < F.d.hoje && fl.situacao === 'atrasado'));
    if (fl.tipo) lista = lista.filter(l => l.tipo === fl.tipo);
    if (fl.situacao === 'aberto') lista = lista.filter(l => !l.pago);
    if (fl.situacao === 'pago') lista = lista.filter(l => l.pago);
    if (fl.situacao === 'atrasado') lista = F.d.lancamentos.filter(l => !l.pago && l.vencimento < F.d.hoje && (!fl.tipo || l.tipo === fl.tipo));
    lista.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const fx = fixasProjetadas(m);
    const r = corpo(`
      <details class="fin-bloco fin-form" ${F.editL ? 'open' : ''}><summary>${F.editL ? 'Editar lançamento' : 'Novo lançamento'}</summary>
        <form id="f-lanc" class="grid-form">
          <input type="hidden" name="id">
          <label>Tipo<select name="tipo"><option value="receita">Receita (entrada)</option><option value="despesa" selected>Despesa (saída)</option></select></label>
          <label>Categoria<select name="categoria">${opcoesCategorias('despesa')}</select></label>
          <label>Descrição<input name="descricao" maxlength="160" placeholder="Ex.: Conta de energia de março"></label>
          <label>Valor (R$)<input name="valor" inputmode="decimal" required placeholder="0,00"></label>
          <label>Forma<select name="forma">${opcoesFormas('pix')}</select></label>
          <label>Competência<input type="date" name="data" value="${F.d.hoje}"></label>
          <label>Vencimento<input type="date" name="vencimento" value="${F.d.hoje}"></label>
          <label>Repetir por<select name="repetir"><option value="1">Só este mês</option>${[2, 3, 4, 5, 6, 10, 12].map(n => `<option value="${n}">${n} meses</option>`).join('')}</select></label>
          <label class="chk"><input type="checkbox" name="pago"> Já foi pago / recebido</label>
          <div class="fin-acoes-form"><button class="btn">Salvar</button> <button type="button" class="btn leve" id="l-limpar">Limpar</button></div>
        </form></details>
      <div class="barra">
        <select id="fl-tipo"><option value="">Receitas e despesas</option><option value="receita">Só receitas</option><option value="despesa">Só despesas</option></select>
        <select id="fl-sit"><option value="">Todas</option><option value="aberto">Em aberto</option><option value="pago">Pagas / recebidas</option><option value="atrasado">Atrasadas (todos os meses)</option></select>
        ${fx.length ? `<button class="btn leve" id="gerar-fixas">Gerar contas fixas do mês (${fx.length})</button>` : ''}
      </div>
      <div class="fin-mini">${kpi('Entradas no mês', R$(soma(lista.filter(l => l.tipo === 'receita'), l => l.valor)))}${kpi('Saídas no mês', R$(soma(lista.filter(l => l.tipo === 'despesa'), l => l.valor)))}${kpi('Em aberto', R$(soma(lista.filter(l => !l.pago), l => l.tipo === 'receita' ? l.valor : -l.valor)), 'receber menos pagar')}</div>
      <table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
      ${lista.length ? lista.map(l => {
        const atras = !l.pago && l.vencimento < F.d.hoje;
        return `<tr><td data-l="Vencimento">${br(l.vencimento)}</td><td data-l="Descrição">${esc(l.descricao || '—')}<br><small>${ROTULO_FORMA[l.forma] || ''}${l.taxa ? ` · taxa ${R$(l.taxa)}` : ''}</small></td>
          <td data-l="Categoria"><small>${esc(l.categoria)}</small></td>
          <td data-l="Valor" class="${l.tipo === 'receita' ? 'pos' : 'neg'}"><b>${l.tipo === 'receita' ? '+' : '−'} ${R$(l.valor)}</b></td>
          <td data-l="Situação"><span class="st ${l.pago ? 'confirmado' : atras ? 'cancelado' : 'pendente'}">${l.pago ? (l.tipo === 'receita' ? 'Recebido ' : 'Pago ') + br(l.dataPagamento) : atras ? 'Atrasado' : 'Em aberto'}</span></td>
          <td data-l="Ações"><div class="acoes">${l.pago ? `<button data-desfaz="${l.id}">desfazer</button>` : `<button data-paga="${l.id}">${l.tipo === 'receita' ? 'recebido' : 'pago'}</button>`}<button data-edl="${l.id}">editar</button><button data-dell="${l.id}">excluir</button></div></td></tr>`;
      }).join('') : '<tr><td colspan="6" class="vazio">Nenhum lançamento neste filtro.</td></tr>'}</tbody></table>`);
    $('#fl-tipo').value = fl.tipo; $('#fl-sit').value = fl.situacao;
    $('#fl-tipo').onchange = e => { fl.tipo = e.target.value; lanc(); };
    $('#fl-sit').onchange = e => { fl.situacao = e.target.value; lanc(); };
    const f = $('#f-lanc');
    f.tipo.onchange = () => { f.categoria.innerHTML = opcoesCategorias(f.tipo.value); };
    if (F.editL) { const l = F.d.lancamentos.find(x => x.id === F.editL); if (l) { f.tipo.value = l.tipo; f.categoria.innerHTML = opcoesCategorias(l.tipo, l.categoria);
      ['id', 'descricao', 'forma', 'data', 'vencimento'].forEach(k => f[k].value = l[k] || ''); f.valor.value = String(l.valor).replace('.', ','); f.pago.checked = l.pago; f.repetir.disabled = true; } }
    $('#l-limpar').onclick = () => { F.editL = null; lanc(); };
    f.onsubmit = async e => {
      e.preventDefault();
      const b = Object.fromEntries(new FormData(f)); b.pago = f.pago.checked;
      const n = +(b.repetir || 1), itens = [];
      for (let i = 0; i < n; i++) itens.push({ ...b, id: i === 0 ? b.id : '', data: i ? addMesData(b.data, i) : b.data, vencimento: i ? addMesData(b.vencimento, i) : b.vencimento, pago: i === 0 && b.pago,
        descricao: n > 1 ? `${b.descricao || b.categoria} (${i + 1}/${n})` : b.descricao });
      const r2 = await api('/api/admin/fin/lancamentos', { method: 'POST', body: JSON.stringify(itens) });
      if (r2.erro) return alert(r2.erro);
      F.editL = null; await carregar();
    };
    if ($('#gerar-fixas')) $('#gerar-fixas').onclick = async () => {
      await api('/api/admin/fin/lancamentos', { method: 'POST', body: JSON.stringify(fx.map(x => ({ tipo: 'despesa', categoria: x.categoria, descricao: x.nome, valor: x.valor, data: `${m}-01`, vencimento: x.vencimento, fixoId: `${x.id}-${m}` }))) });
      await carregar();
    };
    r.querySelector('tbody').onclick = async e => {
      const t = e.target.dataset;
      if (t.paga) { await api(`/api/admin/fin/lancamentos/${t.paga}/pagar`, { method: 'POST', body: JSON.stringify({ pago: true, dataPagamento: F.d.hoje }) }); return carregar(); }
      if (t.desfaz) { await api(`/api/admin/fin/lancamentos/${t.desfaz}/pagar`, { method: 'POST', body: JSON.stringify({ pago: false }) }); return carregar(); }
      if (t.edl) { F.editL = t.edl; lanc(); scrollTo(0, 0); }
      if (t.dell && confirm('Excluir este lançamento?')) { await api('/api/admin/fin/lancamentos/' + t.dell, { method: 'DELETE' }); carregar(); }
    };
  }
  const addMesData = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); const dia = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const ult = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(dia, ult)); return d.toISOString().slice(0, 10); };

  // ---------- contratos
  function contratos() {
    const lista = [...F.d.contratos].sort((a, b) => (b.dataEvento || b.dataContrato).localeCompare(a.dataEvento || a.dataContrato));
    const pecas = F.d.estoque.filter(p => !['baixada'].includes(p.status));
    const pref = F.preContrato || {};
    const r = corpo(`
      <details class="fin-bloco fin-form" ${F.editC || F.preContrato ? 'open' : ''}><summary>${F.editC ? 'Editar contrato' : 'Novo contrato'}</summary>
        <form id="f-contr" class="grid-form">
          <input type="hidden" name="id"><input type="hidden" name="agendamentoId">
          <label>Cliente<input name="cliente" required maxlength="80"></label>
          <label>WhatsApp<input name="telefone" inputmode="tel"></label>
          <label>Tipo<select name="tipo">${Object.entries(ROTULO_TIPO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>Categoria da receita<select name="categoriaReceita"><option value="">Automática</option>${opcoesCategorias('receita')}</select></label>
          <label>Data do contrato<input type="date" name="dataContrato" value="${F.d.hoje}"></label>
          <label>Data do evento<input type="date" name="dataEvento"></label>
          <label>Retirada<input type="date" name="retirada"></label>
          <label>Devolução<input type="date" name="devolucao"></label>
          <label>Valor total (R$)<input name="valorTotal" inputmode="decimal" required></label>
          <label>Desconto (R$)<input name="desconto" inputmode="decimal" placeholder="0,00"></label>
          <label>Sinal (R$)<input name="sinal" inputmode="decimal" placeholder="0,00"></label>
          <label>Forma do sinal<select name="formaSinal">${opcoesFormas('pix')}</select></label>
          <label>Restante em<select name="parcelas">${[1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => `<option value="${n}">${n}x mensal</option>`).join('')}</select></label>
          <label>Forma das parcelas<select name="formaParcelas">${opcoesFormas('pix')}</select></label>
          <label>Situação<select name="status"><option value="ativo">Ativo</option><option value="concluido">Concluído</option><option value="cancelado">Cancelado</option></select></label>
          <fieldset class="fin-pecas"><legend>Peças do contrato ${pecas.length ? '' : '(cadastre em Acervo)'}</legend>${pecas.map(p => `<label class="chk"><input type="checkbox" name="pecas" value="${p.id}"> ${esc(p.nome)}${p.tamanho ? ' · ' + esc(p.tamanho) : ''}</label>`).join('')}</fieldset>
          <textarea name="obs" rows="2" placeholder="Observações (ajustes combinados, acessórios inclusos...)"></textarea>
          <div class="fin-acoes-form"><button class="btn">Salvar contrato</button> <button type="button" class="btn leve" id="c-limpar">Limpar</button></div>
          <p class="fin-aviso" id="c-conflito" hidden></p>
        </form>
        <p class="fin-nota">Ao salvar, o sistema cria as contas a receber (sinal e parcelas) e bloqueia as peças no período de retirada e devolução, somando ${F.d.config.diasHigienizacao} dia(s) de higienização.</p>
      </details>
      <table><thead><tr><th>Evento</th><th>Cliente</th><th>Peças</th><th>Valor</th><th>Recebido</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
      ${lista.length ? lista.map(c => {
        const ls = F.d.lancamentos.filter(l => l.contratoId === c.id), rec = soma(ls.filter(l => l.pago), l => l.valor), liq = c.valorTotal - c.desconto;
        const nomes = c.pecas.map(id => F.d.estoque.find(p => p.id === id)?.nome).filter(Boolean);
        return `<tr><td data-l="Evento">${br(c.dataEvento) || '—'}<br><small>${ROTULO_TIPO[c.tipo]}${c.retirada ? ` · retira ${br(c.retirada)}` : ''}${c.devolucao ? ` · devolve ${br(c.devolucao)}` : ''}</small></td>
          <td data-l="Cliente">${esc(c.cliente)}${c.telefone ? `<br><small>${esc(c.telefone)}</small>` : ''}</td>
          <td data-l="Peças"><small>${esc(nomes.join(', ') || '—')}</small></td>
          <td data-l="Valor">${R$(liq)}${c.desconto ? `<br><small>desconto ${R$(c.desconto)}</small>` : ''}</td>
          <td data-l="Recebido">${R$(rec)}<div class="fin-barra"><span style="width:${liq ? Math.min(100, rec / liq * 100) : 0}%"></span></div></td>
          <td data-l="Situação"><span class="st ${c.status === 'ativo' ? 'confirmado' : c.status === 'concluido' ? 'concluido' : 'cancelado'}">${c.status}</span></td>
          <td data-l="Ações"><div class="acoes"><button data-edc="${c.id}">editar</button>${c.telefone ? `<a target="_blank" href="https://wa.me/55${c.telefone.replace(/^55/, '')}">WhatsApp</a>` : ''}<button data-delc="${c.id}">excluir</button></div></td></tr>`;
      }).join('') : '<tr><td colspan="7" class="vazio">Nenhum contrato ainda. Cadastre o primeiro acima.</td></tr>'}</tbody></table>`);
    const f = $('#f-contr');
    const preencher = c => { for (const [k, v] of Object.entries(c)) if (f[k] && k !== 'pecas' && f[k].type !== 'checkbox') f[k].value = typeof v === 'number' ? String(v).replace('.', ',') : (v ?? ''); f.querySelectorAll('[name=pecas]').forEach(x => x.checked = (c.pecas || []).includes(x.value)); };
    if (F.editC) { const c = F.d.contratos.find(x => x.id === F.editC); if (c) preencher(c); }
    else if (F.preContrato) { preencher(pref); F.preContrato = null; }
    $('#c-limpar').onclick = () => { F.editC = null; contratos(); };
    const enviar = async forcar => {
      const b = Object.fromEntries(new FormData(f)); b.pecas = [...f.querySelectorAll('[name=pecas]:checked')].map(x => x.value); b.forcar = forcar;
      const resp = await fetch('/api/admin/fin/contratos', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(b) });
      const j = await resp.json();
      if (resp.status === 409) {
        const av = $('#c-conflito'); av.hidden = false;
        av.innerHTML = `<b>Atenção: peça indisponível no período.</b><br>${j.conflitos.map(esc).join('<br>')}<br><button type="button" class="btn leve" id="c-forcar">Salvar mesmo assim</button>`;
        $('#c-forcar').onclick = () => enviar(true); return;
      }
      if (!resp.ok) return alert(j.erro || 'Não foi possível salvar.');
      F.editC = null; await carregar();
    };
    f.onsubmit = e => { e.preventDefault(); enviar(false); };
    r.querySelector('tbody').onclick = async e => {
      const t = e.target.dataset;
      if (t.edc) { F.editC = t.edc; contratos(); scrollTo(0, 0); }
      if (t.delc && confirm('Excluir o contrato? As parcelas em aberto também serão excluídas; as já recebidas ficam no caixa.')) { await api('/api/admin/fin/contratos/' + t.delc, { method: 'DELETE' }); carregar(); }
    };
  }
  window.finNovoContrato = a => {
    F.aba = 'contratos'; F.editC = null;
    F.preContrato = { cliente: a.nome, telefone: a.telefone, dataEvento: a.dataEvento || '', agendamentoId: a.id, tipo: a.tipo === 'cerimonial' ? 'cerimonial' : 'aluguel',
      categoriaReceita: { debutante: 'Aluguel de vestido de debutante', 'trajes-masculinos': 'Aluguel de traje masculino', 'madrinhas-festa': 'Aluguel de vestido de festa', cerimonial: 'Cerimonial' }[a.tipo] || 'Aluguel de vestido de noiva' };
    document.querySelector('nav [data-aba="financeiro"]').click();
  };

  // ---------- acervo
  function acervo() {
    const lista = F.d.estoque.map(p => ({ p, s: statsPeca(p), alug: alugadaAgora(p) }));
    const ativos = lista.filter(x => !['vendida', 'baixada'].includes(x.p.status));
    const custoTotal = soma(ativos, x => x.p.custo), contabil = soma(ativos, x => x.s.valorContabil), receita = soma(lista, x => x.s.receita);
    const r = corpo(`
      <div class="cards">${kpi('Peças no acervo', ativos.length)}${kpi('Investido no acervo', R$(custoTotal))}${kpi('Valor contábil hoje', R$(contabil), 'custo menos depreciação')}${kpi('Receita gerada', R$(receita), custoTotal ? `retorno de ${pct((receita - custoTotal) / custoTotal * 100)}` : '')}</div>
      <details class="fin-bloco fin-form" ${F.editP ? 'open' : ''}><summary>${F.editP ? 'Editar peça' : 'Nova peça (investimento)'}</summary>
        <form id="f-peca" class="grid-form">
          <input type="hidden" name="id"><input type="hidden" name="catalogoId">
          <label>Nome da peça<input name="nome" required maxlength="80"></label>
          <label>Categoria<select name="categoria">${['Noivas', '15 Anos', 'Paletós', 'Festa', 'Acessórios'].map(c => `<option>${c}</option>`).join('')}</select></label>
          <label>Tamanho<input name="tamanho" maxlength="30"></label>
          <label>Fornecedor<input name="fornecedor" maxlength="80"></label>
          <label>Custo de aquisição (R$)<input name="custo" inputmode="decimal"></label>
          <label>Data da compra<input type="date" name="dataAquisicao" value="${F.d.hoje}"></label>
          <label>Vida útil (meses)<input name="vidaUtilMeses" inputmode="numeric" value="${F.d.config.vidaUtilPadraoMeses}"></label>
          <label>Preço do aluguel (R$)<input name="valorAluguel" inputmode="decimal"></label>
          <label>Preço de venda (R$)<input name="valorVenda" inputmode="decimal"></label>
          <label>Situação<select name="status">${Object.entries(ROTULO_STATUS_PECA).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>Data da baixa / venda<input type="date" name="dataBaixa"></label>
          <label class="chk"><input type="checkbox" name="gerarPagamento" checked> Lançar a compra no caixa</label>
          <label>Pagamento da compra<select name="parcelasCompra">${[1, 2, 3, 4, 5, 6, 10, 12].map(n => `<option value="${n}">${n === 1 ? 'À vista' : n + 'x'}</option>`).join('')}</select></label>
          <label class="chk"><input type="checkbox" name="compraPaga" checked> Primeira parcela já paga</label>
          <textarea name="obs" rows="2" placeholder="Observações"></textarea>
          <div class="fin-acoes-form"><button class="btn">Salvar peça</button> <button type="button" class="btn leve" id="p-limpar">Limpar</button></div>
        </form>
        <p class="fin-nota">A compra de peças é um investimento: sai do caixa, mas entra no patrimônio e é descontada aos poucos no resultado como depreciação, ao longo da vida útil.</p>
      </details>
      <div class="barra"><button class="btn leve" id="importar">Importar peças da coleção do site</button></div>
      <table><thead><tr><th>Peça</th><th>Custo</th><th>Usos</th><th>Receita gerada</th><th>Retorno</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
      ${lista.length ? lista.sort((a, b) => b.s.receita - a.s.receita).map(({ p, s, alug }) => `<tr>
        <td data-l="Peça"><b>${esc(p.nome)}</b><br><small>${esc(p.categoria)}${p.tamanho ? ' · ' + esc(p.tamanho) : ''}${p.valorAluguel ? ' · aluguel ' + R$(p.valorAluguel) : ''}</small></td>
        <td data-l="Custo">${p.custo ? R$(p.custo) : '<small>informar</small>'}<br><small>contábil ${R$(s.valorContabil)}</small></td>
        <td data-l="Usos">${s.usos}${s.ultimo ? `<br><small>último ${br(s.ultimo)}</small>` : ''}</td>
        <td data-l="Receita gerada">${R$(s.receita)}</td>
        <td data-l="Retorno">${s.roi === null ? '—' : `<b class="${s.roi >= 0 ? 'pos' : 'neg'}">${pct(s.roi)}</b>`}<br><small>${s.pago ? 'já se pagou' : s.alugueisPayback ? `faltam ~${s.alugueisPayback} aluguéis` : ''}</small></td>
        <td data-l="Situação"><span class="st ${alug ? 'pendente' : p.status === 'disponivel' ? 'confirmado' : p.status === 'ajuste' ? 'concluido' : 'cancelado'}">${alug ? 'Alugada até ' + br(alug.devolucao) : ROTULO_STATUS_PECA[p.status]}</span>${s.parada ? '<br><small>parada há 6+ meses</small>' : ''}</td>
        <td data-l="Ações"><div class="acoes"><button data-edp="${p.id}">editar</button><button data-delp="${p.id}">excluir</button></div></td></tr>`).join('') : '<tr><td colspan="7" class="vazio">Nenhuma peça cadastrada. Use "Importar peças da coleção do site" para começar.</td></tr>'}
      </tbody></table>`);
    const f = $('#f-peca');
    if (F.editP) { const p = F.d.estoque.find(x => x.id === F.editP); if (p) { for (const [k, v] of Object.entries(p)) if (f[k] && f[k].type !== 'checkbox') f[k].value = typeof v === 'number' ? String(v).replace('.', ',') : (v ?? ''); f.gerarPagamento.checked = false; } }
    $('#p-limpar').onclick = () => { F.editP = null; acervo(); };
    f.onsubmit = async e => {
      e.preventDefault();
      const b = Object.fromEntries(new FormData(f)); b.gerarPagamento = f.gerarPagamento.checked; b.compraPaga = f.compraPaga.checked;
      const r2 = await api('/api/admin/fin/estoque', { method: 'POST', body: JSON.stringify(b) });
      if (r2.erro) return alert(r2.erro);
      F.editP = null; carregar();
    };
    $('#importar').onclick = async () => {
      const cat = await api('/api/admin/catalogo');
      const ja = new Set(F.d.estoque.map(p => p.catalogoId).filter(Boolean));
      const novas = cat.filter(i => i.ativo !== false && !ja.has(i.id)).map(i => ({ nome: i.nome, categoria: i.categoria, catalogoId: i.id, custo: 0, dataAquisicao: F.d.hoje, status: 'disponivel' }));
      if (!novas.length) return alert('Todas as peças da coleção já estão no acervo.');
      if (!confirm(`Importar ${novas.length} peça(s)? Depois, edite cada uma para informar o custo e o preço do aluguel.`)) return;
      await api('/api/admin/fin/estoque', { method: 'POST', body: JSON.stringify({ pecas: novas }) }); carregar();
    };
    r.querySelector('tbody').onclick = async e => {
      const t = e.target.dataset;
      if (t.edp) { F.editP = t.edp; acervo(); scrollTo(0, 0); }
      if (t.delp && confirm('Excluir esta peça do acervo? Se ela foi vendida ou descartada, prefira mudar a situação para "Vendida" ou "Baixada".')) { await api('/api/admin/fin/estoque/' + t.delp, { method: 'DELETE' }); carregar(); }
    };
  }

  // ---------- relatórios
  function relatorios() {
    F.periodo = F.periodo || 'mes';
    const m = F.mes, ini = F.periodo === 'ano' ? m.slice(0, 4) + '-01' : F.periodo === 'tri' ? addMes(m, -2) : m;
    const d = dre(ini, m);
    const dt = m === ym(F.d.hoje) ? F.d.hoje : ultimoDia(m), b = balanco(dt), fl = fluxo(3);
    const linha = (rot, v, cls = '', nivel = 0) => `<tr class="${cls}"><td style="padding-left:${12 + nivel * 18}px">${rot}</td><td class="num">${R$(v)}</td><td class="num">${d.receitaBruta ? pct(v / d.receitaBruta * 100) : ''}</td></tr>`;
    corpo(`
      <div class="barra"><select id="per"><option value="mes">DRE do mês</option><option value="tri">Últimos 3 meses</option><option value="ano">Ano até o mês</option></select><button class="btn leve" onclick="print()">Imprimir</button></div>
      <div class="fin-duas">
      <div class="fin-bloco"><h3>DRE · ${F.periodo === 'mes' ? nomeMesLongo(m) : nomeMes(ini) + ' a ' + nomeMes(m)}</h3><p class="fin-nota">Demonstração do Resultado do Exercício, por competência.</p>
        <table class="fin-rel"><thead><tr><th>Conta</th><th class="num">Valor</th><th class="num">% da receita</th></tr></thead><tbody>
        ${linha('Receita bruta', d.receitaBruta, 'forte')}
        ${Object.entries(d.porCat).sort((a, c) => c[1] - a[1]).map(([k, v]) => linha(esc(k), v, 'sub', 1)).join('')}
        ${linha(`(−) Impostos${d.impostoEstimado ? ` estimados (${pct(F.d.config.aliquotaImposto)})` : ' (DAS)'}`, -d.impostos)}
        ${linha('(−) Taxas de cartão e bancárias', -d.taxas)}
        ${linha('= Receita líquida', d.receitaLiquida, 'forte')}
        ${linha('(−) Custos variáveis (lavanderia, costura, comissões)', -d.custoVar)}
        ${linha('= Margem de contribuição', d.margemContrib, 'forte')}
        ${linha(`(−) Despesas fixas${d.fixasPrevistas ? ` <small>(inclui ${R$(d.fixasPrevistas)} previstas, ainda não lançadas)</small>` : ''}`, -d.fixas)}
        ${linha('(−) Depreciação do acervo', -d.deprec)}
        ${d.outrasImp ? linha('(−) Alvarás e licenças', -d.outrasImp) : ''}${d.financeiras ? linha('(−) Juros e multas', -d.financeiras) : ''}${d.outras ? linha('(−) Outras despesas', -d.outras) : ''}
        ${linha('= Resultado líquido', d.resultado, 'total ' + (d.resultado < 0 ? 'neg' : 'pos'))}
        </tbody></table>
        ${d.investido ? `<p class="fin-nota">Investimentos no período (fora do resultado): ${R$(d.investido)}.</p>` : ''}
      </div>
      <div class="fin-bloco"><h3>Balanço patrimonial · ${br(dt)}</h3><p class="fin-nota">Ativo = Passivo + Patrimônio líquido.</p>
        <table class="fin-rel"><tbody>
          <tr class="forte"><td>Ativo</td><td class="num">${R$(b.ativoTotal)}</td></tr>
          <tr class="sub"><td style="padding-left:24px">Caixa e bancos</td><td class="num">${R$(b.caixa)}</td></tr>
          <tr class="sub"><td style="padding-left:24px">Contas a receber de clientes</td><td class="num">${R$(b.receber)}</td></tr>
          <tr class="sub"><td style="padding-left:24px">Acervo de peças (${b.nPecas}) ao custo</td><td class="num">${R$(b.acervoBruto)}</td></tr>
          <tr class="sub"><td style="padding-left:24px">(−) Depreciação acumulada</td><td class="num">${R$(-b.depAc)}</td></tr>
          <tr class="forte"><td>Passivo</td><td class="num">${R$(b.passivo)}</td></tr>
          <tr class="sub"><td style="padding-left:24px">Contas a pagar</td><td class="num">${R$(b.pagar)}</td></tr>
          <tr class="sub"><td style="padding-left:24px">Impostos a recolher (estimado)</td><td class="num">${R$(b.impostosRecolher)}</td></tr>
          <tr class="forte"><td>Patrimônio líquido</td><td class="num">${R$(b.pl)}</td></tr>
          <tr class="sub"><td style="padding-left:24px">Capital social</td><td class="num">${R$(b.capital)}</td></tr>
          <tr class="sub"><td style="padding-left:24px">Lucros (prejuízos) acumulados</td><td class="num">${R$(b.lucrosAcumulados)}</td></tr>
        </tbody></table>
        <div class="fin-mini">${kpi('Liquidez corrente', Number.isFinite(b.liquidezCorrente) ? b.liquidezCorrente.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : 'sem dívidas', 'acima de 1 é saudável')}${kpi('Endividamento', b.ativoTotal ? pct(b.passivo / b.ativoTotal * 100) : '0%', 'passivo ÷ ativo')}</div>
      </div></div>
      <div class="fin-bloco"><h3>Fluxo de caixa projetado</h3><p class="fin-nota">A partir do caixa de hoje (${R$(fl.inicial)}), somando o que há para receber e pagar, inclusive as contas fixas ainda não lançadas.</p>
        <table class="fin-rel"><thead><tr><th>Período</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo projetado</th></tr></thead><tbody>
        ${fl.linhas.map(l => `<tr><td>${l.rotulo}</td><td class="num pos">${R$(l.entradas)}</td><td class="num neg">${R$(l.saidas)}</td><td class="num"><b class="${l.saldo < 0 ? 'neg' : ''}">${R$(l.saldo)}</b></td></tr>`).join('')}
        </tbody></table></div>
      <div class="fin-bloco"><h3>Despesas por categoria</h3><table class="fin-rel"><tbody>${d.despesasPorCat.length ? d.despesasPorCat.map(([k, v]) => `<tr><td>${esc(k)}${FORA_DO_RESULTADO.includes(k) ? ' <small>(fora do resultado)</small>' : ''}</td><td class="num">${R$(v)}</td></tr>`).join('') : '<tr><td class="vazio">Sem despesas no período.</td></tr>'}</tbody></table></div>`);
    $('#per').value = F.periodo; $('#per').onchange = e => { F.periodo = e.target.value; relatorios(); };
  }

  // ---------- simulador
  function simulador() {
    const ind = indicadores(), c = F.d.config;
    const s = F.sim = F.sim || { ticket: Math.round(ind.ticket) || 900, qtd: Math.max(1, Math.round(ind.contratos6)) || 10, fixo: Math.round(ind.fixo) || 5000,
      varPct: Math.round(ind.varPct) || 8, taxaPct: Math.round(ind.taxaPct * 10) / 10 || 2, imposto: c.aliquotaImposto, cresc: 3,
      pCusto: 2500, pAluguel: 800, pUsos: 1.5, pCustoUso: 80 };
    const campos = [['ticket', 'Ticket médio por contrato (R$)'], ['qtd', 'Contratos por mês'], ['fixo', 'Custo fixo mensal (R$)'], ['varPct', 'Custos variáveis (% da receita)'],
      ['taxaPct', 'Taxas de cartão (% da receita)'], ['imposto', 'Impostos (% da receita)'], ['cresc', 'Crescimento mensal esperado (%)']];
    const campos2 = [['pCusto', 'Custo da peça nova (R$)'], ['pAluguel', 'Preço do aluguel (R$)'], ['pUsos', 'Aluguéis por mês'], ['pCustoUso', 'Custo por aluguel: lavanderia e ajuste (R$)']];
    corpo(`
      <div class="fin-duas">
        <div class="fin-bloco"><h3>Simulação do negócio</h3><p class="fin-nota">Valores iniciais calculados a partir dos seus dados. Altere e veja o resultado na hora.</p>
          <div class="fin-sim">${campos.map(([k, n]) => `<label>${n}<input data-s="${k}" inputmode="decimal" value="${String(s[k]).replace('.', ',')}"></label>`).join('')}</div>
          <div id="sim-res"></div></div>
        <div class="fin-bloco"><h3>Vale a pena comprar esta peça?</h3>
          <div class="fin-sim">${campos2.map(([k, n]) => `<label>${n}<input data-s="${k}" inputmode="decimal" value="${String(s[k]).replace('.', ',')}"></label>`).join('')}</div>
          <div id="sim-peca"></div></div>
      </div>
      <div class="fin-bloco"><h3>Projeção de 12 meses</h3><div id="sim-tab"></div></div>`);
    const calc = () => {
      const n = k => s[k];
      const receita = n('ticket') * n('qtd'), dedu = receita * (n('imposto') + n('taxaPct') + n('varPct')) / 100;
      const mc = receita - dedu, lucro = mc - n('fixo') - soma(F.d.estoque.filter(p => !['vendida', 'baixada'].includes(p.status)), p => depNoMes(p, ym(F.d.hoje)));
      const mcUnit = n('ticket') * (1 - (n('imposto') + n('taxaPct') + n('varPct')) / 100), pe = mcUnit > 0 ? n('fixo') / mcUnit : Infinity;
      const precoMin = n('qtd') > 0 ? (n('fixo') / n('qtd')) / (1 - (n('imposto') + n('taxaPct') + n('varPct')) / 100) : 0;
      $('#sim-res').innerHTML = `<div class="fin-mini">${kpi('Faturamento', R$(receita))}${kpi('Lucro mensal', R$(lucro), (receita ? 'margem ' + pct(lucro / receita * 100) + ' · ' : '') + 'após depreciação', lucro < 0 ? 'neg' : 'pos')}${kpi('Ponto de equilíbrio', Number.isFinite(pe) ? Math.ceil(pe) + ' contratos' : '—')}${kpi('Ticket mínimo', R$(precoMin), `para empatar com ${n('qtd')} contratos`)}</div>
        <p class="fin-nota">${lucro >= 0 ? `Com esses números o negócio fica em superávit. Cada contrato além de ${Math.ceil(pe)} por mês adiciona cerca de ${R$(mcUnit)} ao lucro.` : `Faltam ${Math.ceil(pe - n('qtd'))} contrato(s) por mês, ou um ticket médio de ${R$(precoMin)}, para sair do prejuízo.`}</p>`;
      const lucroUso = n('pAluguel') * (1 - (n('imposto') + n('taxaPct')) / 100) - n('pCustoUso');
      const porMes = lucroUso * n('pUsos'), payback = porMes > 0 ? n('pCusto') / porMes : Infinity, roi24 = n('pCusto') ? (porMes * 24 - n('pCusto')) / n('pCusto') * 100 : 0;
      $('#sim-peca').innerHTML = `<div class="fin-mini">${kpi('Lucro por aluguel', R$(lucroUso))}${kpi('Retorno do investimento', Number.isFinite(payback) ? `${Math.ceil(payback)} meses` : 'não se paga', `${Math.ceil(n('pCusto') / Math.max(1, lucroUso))} aluguéis`)}${kpi('Retorno em 2 anos', pct(roi24), '', roi24 < 0 ? 'neg' : 'pos')}</div>
        <p class="fin-nota">${!Number.isFinite(payback) ? 'O preço do aluguel não cobre os custos de cada uso. Não compre por esse valor.' : payback <= 6 ? 'Excelente investimento: a peça se paga em até 6 meses.' : payback <= 12 ? 'Bom investimento: a peça se paga em até 1 ano.' : payback <= 24 ? 'Investimento razoável. Negocie um preço de compra menor, se possível.' : 'Retorno lento. Só vale se for uma peça de vitrine ou de alta procura.'}</p>`;
      let acum = 0, q = n('qtd'), linhas = '';
      for (let i = 1; i <= 12; i++) {
        const rec = n('ticket') * q, l = rec * (1 - (n('imposto') + n('taxaPct') + n('varPct')) / 100) - n('fixo'); acum += l;
        linhas += `<tr><td>${nomeMesLongo(addMes(ym(F.d.hoje), i))}</td><td class="num">${q.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td><td class="num">${R$(rec)}</td><td class="num ${l < 0 ? 'neg' : 'pos'}">${R$(l)}</td><td class="num"><b class="${acum < 0 ? 'neg' : ''}">${R$(acum)}</b></td></tr>`;
        q = q * (1 + n('cresc') / 100);
      }
      $('#sim-tab').innerHTML = `<table class="fin-rel"><thead><tr><th>Mês</th><th class="num">Contratos</th><th class="num">Faturamento</th><th class="num">Lucro (antes da depreciação)</th><th class="num">Acumulado</th></tr></thead><tbody>${linhas}</tbody></table>`;
    };
    $('#fin-corpo').querySelectorAll('[data-s]').forEach(i => i.oninput = () => { s[i.dataset.s] = parseFloat(i.value.replace(/\./g, '').replace(',', '.')) || 0; calc(); });
    calc();
  }

  // ---------- configurações
  function config() {
    const c = F.d.config;
    const r = corpo(`
      <form id="f-cfg">
      <div class="fin-bloco"><h3>Caixa e patrimônio</h3><div class="grid-form">
        <label>Saldo inicial em caixa e bancos (R$)<input name="saldoInicial" inputmode="decimal" value="${String(c.saldoInicial).replace('.', ',')}"></label>
        <label>Data do saldo inicial<input type="date" name="dataSaldoInicial" value="${c.dataSaldoInicial}"></label>
        <label>Capital social (R$)<input name="capitalSocial" inputmode="decimal" value="${String(c.capitalSocial).replace('.', ',')}"></label>
        <label>Meta de faturamento mensal (R$)<input name="metaMensal" inputmode="decimal" value="${String(c.metaMensal).replace('.', ',')}"></label>
        <label>Margem líquida mínima (%)<input name="margemMinima" inputmode="decimal" value="${c.margemMinima}"></label>
        <label>Reserva de emergência (meses de custo fixo)<input name="reservaMeses" inputmode="decimal" value="${c.reservaMeses}"></label>
      </div></div>
      <div class="fin-bloco"><h3>Impostos, taxas e operação</h3><div class="grid-form">
        <label>Alíquota de imposto sobre o faturamento (%)<input name="aliquotaImposto" inputmode="decimal" value="${String(c.aliquotaImposto).replace('.', ',')}"></label>
        ${F.d.formas.map(f => `<label>Taxa ${ROTULO_FORMA[f]} (%)<input name="taxa_${f}" inputmode="decimal" value="${String(c.taxas[f] || 0).replace('.', ',')}"></label>`).join('')}
        <label>Dias de higienização entre aluguéis<input name="diasHigienizacao" inputmode="numeric" value="${c.diasHigienizacao}"></label>
        <label>Vida útil padrão das peças (meses)<input name="vidaUtilPadraoMeses" inputmode="numeric" value="${c.vidaUtilPadraoMeses}"></label>
      </div><p class="fin-nota">Confirme a alíquota com o contador. No Simples Nacional ela varia conforme o anexo e o faturamento dos últimos 12 meses.</p></div>
      <div class="fin-bloco"><h3>Despesas fixas mensais</h3><p class="fin-nota">Usadas na projeção de caixa, no ponto de equilíbrio e no botão "Gerar contas fixas do mês".</p>
        <table class="fin-rel"><thead><tr><th>Despesa</th><th>Categoria</th><th class="num">Valor (R$)</th><th class="num">Dia</th><th></th></tr></thead><tbody id="fixas">
        ${[...c.despesasFixas, {}].map((d, i) => `<tr data-i="${i}"><td><input data-k="nome" value="${esc(d.nome || '')}" placeholder="Ex.: Aluguel do imóvel"><input type="hidden" data-k="id" value="${d.id || ''}"></td>
          <td><select data-k="categoria">${Object.entries(F.d.categorias.despesas).filter(([g]) => g !== 'Investimento').map(([g, l]) => `<optgroup label="${g}">${l.map(x => `<option${x === d.categoria ? ' selected' : ''}>${x}</option>`).join('')}</optgroup>`).join('')}</select></td>
          <td class="num"><input data-k="valor" inputmode="decimal" value="${d.valor ? String(d.valor).replace('.', ',') : ''}" style="width:110px"></td>
          <td class="num"><input data-k="dia" inputmode="numeric" value="${d.dia || 10}" style="width:60px"></td>
          <td>${d.nome ? `<button type="button" class="btn leve" data-rm="${i}">remover</button>` : ''}</td></tr>`).join('')}
        </tbody></table><p class="fin-nota">Para incluir mais de uma, salve e uma nova linha aparece.</p></div>
      <p><button class="btn">Salvar configurações</button></p></form>
      <div class="fin-bloco"><h3>Backup dos dados</h3><p class="fin-nota">Baixe uma cópia de tudo (agendamentos, coleção e financeiro) toda semana e guarde no Google Drive. Use "Restaurar" só para recuperar dados.</p>
        <div class="barra"><button class="btn" id="bk-baixar">Baixar backup</button><label class="btn leve">Restaurar backup<input type="file" id="bk-arq" accept="application/json" hidden></label></div></div>`);
    const lerFixas = () => [...r.querySelectorAll('#fixas tr')].map(tr => Object.fromEntries([...tr.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.value]))).filter(d => d.nome && d.valor);
    r.querySelector('#fixas').onclick = e => { if (e.target.dataset.rm !== undefined) e.target.closest('tr').remove(); };
    $('#f-cfg').onsubmit = async e => {
      e.preventDefault();
      const b = Object.fromEntries(new FormData(e.target));
      b.taxas = Object.fromEntries(F.d.formas.map(f => [f, b['taxa_' + f]]));
      b.despesasFixas = lerFixas();
      const res = await api('/api/admin/fin/config', { method: 'POST', body: JSON.stringify(b) });
      if (res.erro) return alert(res.erro);
      await carregar(); alert('Configurações salvas.');
    };
    $('#bk-baixar').onclick = async () => {
      const resp = await fetch('/api/admin/backup', { headers: { Authorization: 'Bearer ' + token } });
      const a = document.createElement('a'); a.href = URL.createObjectURL(await resp.blob()); a.download = `backup-glamour-${F.d.hoje}.json`; a.click();
    };
    $('#bk-arq').onchange = async e => {
      const arq = e.target.files[0]; if (!arq) return;
      if (!confirm('Restaurar este backup? Os dados atuais serão substituídos pelos do arquivo.')) return;
      const res = await api('/api/admin/backup', { method: 'POST', body: await arq.text() });
      if (res.erro) return alert(res.erro);
      alert(`Backup restaurado (${res.restaurados} arquivos).`); location.reload();
    };
  }

  F.abrir = carregar;
})();
