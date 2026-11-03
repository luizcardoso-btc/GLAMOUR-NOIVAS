// Módulo financeiro da Glamour Noivas — rotas do painel (/api/admin/fin/...)
// Guarda lançamentos (contas a pagar/receber), contratos, acervo (estoque patrimonial) e configurações.
const crypto = require('crypto');

const RECEITAS = ['Aluguel de vestido de noiva', 'Aluguel de vestido de debutante', 'Aluguel de traje masculino', 'Aluguel de vestido de festa',
  'Venda de vestido', 'Venda de acessórios', 'Aluguel de acessórios', 'Cerimonial', 'Ajustes e costura', 'Outras receitas'];
const DESPESAS = {
  'Custo variável': ['Lavanderia e higienização', 'Costureira e ajustes', 'Comissões', 'Embalagens', 'Frete e entregas', 'Manutenção de peças'],
  'Despesa fixa': ['Aluguel do imóvel', 'Salários e encargos', 'Pró-labore', 'Energia', 'Água', 'Internet e telefone', 'Contador',
    'Marketing e anúncios', 'Sistemas e assinaturas', 'Manutenção da loja', 'Material de escritório'],
  'Impostos e taxas': ['Impostos (DAS / Simples)', 'Taxas bancárias', 'Alvarás e licenças'],
  'Investimento': ['Investimento em acervo', 'Móveis e equipamentos', 'Reforma'],
  'Financeiro': ['Juros e multas', 'Empréstimo (parcela)', 'Retirada de sócios'],
  'Outras': ['Outras despesas'],
};
const FORMAS = ['pix', 'dinheiro', 'debito', 'credito', 'parcelado', 'boleto', 'transferencia'];

const CONFIG_PADRAO = {
  saldoInicial: 0, dataSaldoInicial: '', capitalSocial: 0,
  aliquotaImposto: 6, // Simples Nacional, anexo I (comércio) começa em 4%; serviços ~6%
  taxas: { pix: 0, dinheiro: 0, debito: 1.99, credito: 3.49, parcelado: 4.99, boleto: 2, transferencia: 0 },
  diasHigienizacao: 2, vidaUtilPadraoMeses: 36, metaMensal: 0, margemMinima: 20, reservaMeses: 3,
  despesasFixas: [],
};

module.exports = function criarFinanceiro({ load, save, send, readBody, clean, todayISO }) {
  const num = v => { const n = Math.round(parseFloat(String(v ?? '').replace(',', '.')) * 100) / 100; return Number.isFinite(n) ? n : 0; };
  const data = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
  const id = () => crypto.randomBytes(5).toString('hex');
  const cfgFin = () => {
    const c = load('fin-config.json', {});
    return { ...CONFIG_PADRAO, ...c, taxas: { ...CONFIG_PADRAO.taxas, ...(c.taxas || {}) }, despesasFixas: c.despesasFixas || [] };
  };
  const taxaDe = (forma, valor) => Math.round(valor * (cfgFin().taxas[forma] || 0)) / 100;
  const somaMeses = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
  const somaDias = (iso, n) => new Date(new Date(iso + 'T12:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);

  function limparLancamento(b) {
    const tipo = b.tipo === 'receita' ? 'receita' : 'despesa';
    const valor = Math.abs(num(b.valor));
    const forma = FORMAS.includes(b.forma) ? b.forma : 'pix';
    const pago = !!b.pago;
    return {
      id: clean(b.id, 20) || id(), tipo, categoria: clean(b.categoria, 60) || (tipo === 'receita' ? 'Outras receitas' : 'Outras despesas'),
      descricao: clean(b.descricao, 160), valor, forma,
      taxa: tipo === 'receita' ? (b.taxa !== undefined && b.taxa !== '' ? Math.abs(num(b.taxa)) : taxaDe(forma, valor)) : 0,
      data: data(b.data) || todayISO(), vencimento: data(b.vencimento) || data(b.data) || todayISO(),
      pago, dataPagamento: pago ? (data(b.dataPagamento) || todayISO()) : '',
      contratoId: clean(b.contratoId, 20), pecaId: clean(b.pecaId, 20), fixoId: clean(b.fixoId, 40),
      criadoEm: b.criadoEm || new Date().toISOString(),
    };
  }
  function limparPeca(b) {
    const st = ['disponivel', 'ajuste', 'vendida', 'baixada'];
    return {
      id: clean(b.id, 20) || id(), nome: clean(b.nome, 80), categoria: clean(b.categoria, 40) || 'Noivas',
      catalogoId: clean(b.catalogoId, 40), fornecedor: clean(b.fornecedor, 80), tamanho: clean(b.tamanho, 30),
      custo: Math.abs(num(b.custo)), dataAquisicao: data(b.dataAquisicao) || todayISO(),
      vidaUtilMeses: Math.max(1, Math.round(num(b.vidaUtilMeses) || cfgFin().vidaUtilPadraoMeses)),
      valorAluguel: Math.abs(num(b.valorAluguel)), valorVenda: Math.abs(num(b.valorVenda)),
      status: st.includes(b.status) ? b.status : 'disponivel', dataBaixa: data(b.dataBaixa), obs: clean(b.obs, 300),
    };
  }
  function limparContrato(b) {
    const tipos = ['aluguel', 'venda', 'cerimonial', 'ajuste'];
    return {
      id: clean(b.id, 20) || id(), cliente: clean(b.cliente, 80), telefone: clean(b.telefone, 20).replace(/\D/g, ''),
      tipo: tipos.includes(b.tipo) ? b.tipo : 'aluguel', categoriaReceita: RECEITAS.includes(b.categoriaReceita) ? b.categoriaReceita : '',
      pecas: (Array.isArray(b.pecas) ? b.pecas : []).map(x => clean(x, 20)).filter(Boolean).slice(0, 20),
      dataContrato: data(b.dataContrato) || todayISO(), dataEvento: data(b.dataEvento), retirada: data(b.retirada), devolucao: data(b.devolucao),
      valorTotal: Math.abs(num(b.valorTotal)), desconto: Math.abs(num(b.desconto)), sinal: Math.abs(num(b.sinal)),
      formaSinal: FORMAS.includes(b.formaSinal) ? b.formaSinal : 'pix', parcelas: Math.min(12, Math.max(0, Math.round(num(b.parcelas)))),
      formaParcelas: FORMAS.includes(b.formaParcelas) ? b.formaParcelas : 'pix',
      status: ['ativo', 'concluido', 'cancelado'].includes(b.status) ? b.status : 'ativo',
      agendamentoId: clean(b.agendamentoId, 12), obs: clean(b.obs, 400), criadoEm: b.criadoEm || new Date().toISOString(),
    };
  }
  const categoriaPadrao = c => c.categoriaReceita || ({ venda: 'Venda de vestido', cerimonial: 'Cerimonial', ajuste: 'Ajustes e costura' }[c.tipo] || 'Aluguel de vestido de noiva');

  // gera as contas a receber de um contrato (sinal + parcelas), preservando o que já foi pago
  function gerarRecebiveis(c, todos) {
    const pagos = todos.filter(l => l.contratoId === c.id && l.pago);
    const resto = todos.filter(l => l.contratoId !== c.id);
    if (c.status === 'cancelado') return [...resto, ...pagos];
    const liquido = Math.max(0, c.valorTotal - c.desconto);
    const jaPago = pagos.reduce((s, l) => s + l.valor, 0);
    let falta = Math.round((liquido - jaPago) * 100) / 100;
    const novos = [];
    const cat = categoriaPadrao(c);
    const desc = `${c.cliente} · contrato ${c.id.slice(0, 6)}`;
    const sinalPago = pagos.some(l => /sinal/i.test(l.descricao));
    if (c.sinal > 0 && !sinalPago && falta > 0) {
      const v = Math.min(c.sinal, falta);
      novos.push(limparLancamento({ tipo: 'receita', categoria: cat, descricao: 'Sinal · ' + desc, valor: v, forma: c.formaSinal, data: c.dataContrato, vencimento: c.dataContrato, contratoId: c.id }));
      falta = Math.round((falta - v) * 100) / 100;
    }
    if (falta > 0) {
      const n = Math.max(1, c.parcelas || 1);
      const limite = c.retirada || c.dataEvento;
      for (let i = 0; i < n; i++) {
        const v = i === n - 1 ? Math.round((falta - Math.round(falta / n * 100) / 100 * (n - 1)) * 100) / 100 : Math.round(falta / n * 100) / 100;
        let venc = somaMeses(c.dataContrato, i + 1);
        if (limite && venc > limite) venc = limite;
        novos.push(limparLancamento({ tipo: 'receita', categoria: cat, descricao: `Parcela ${i + 1}/${n} · ${desc}`, valor: v, forma: c.formaParcelas, data: c.dataContrato, vencimento: venc, contratoId: c.id }));
      }
    }
    return [...resto, ...pagos, ...novos];
  }

  // verifica se alguma peça já está alugada no período (inclui dias de higienização)
  function conflitos(c, contratos, estoque) {
    if (c.tipo !== 'aluguel' || c.status === 'cancelado' || !c.retirada || !c.devolucao) return [];
    const dh = cfgFin().diasHigienizacao;
    const ini = c.retirada, fim = somaDias(c.devolucao, dh);
    const out = [];
    for (const pid of c.pecas) {
      const peca = estoque.find(p => p.id === pid);
      if (peca && ['vendida', 'baixada'].includes(peca.status)) out.push(`${peca.nome} está marcada como ${peca.status}.`);
      for (const o of contratos) {
        if (o.id === c.id || o.status === 'cancelado' || !o.pecas.includes(pid)) continue;
        if (o.tipo === 'venda') { out.push(`${peca ? peca.nome : pid} foi vendida no contrato de ${o.cliente}.`); continue; }
        if (!o.retirada || !o.devolucao) continue;
        const oIni = o.retirada, oFim = somaDias(o.devolucao, dh);
        if (ini <= oFim && oIni <= fim) out.push(`${peca ? peca.nome : pid} já está reservada para ${o.cliente} de ${o.retirada.split('-').reverse().join('/')} a ${o.devolucao.split('-').reverse().join('/')} (+${dh} dias de higienização).`);
      }
    }
    return out;
  }

  const ARQUIVOS_BACKUP = ['agendamentos.json', 'catalogo.json', 'bloqueios.json', 'perguntas.json', 'fin-lancamentos.json', 'fin-contratos.json', 'fin-estoque.json', 'fin-config.json'];

  return async function rotas(req, res, url) {
    const p = url.pathname, m = req.method;
    if (!p.startsWith('/api/admin/fin/') && !p.startsWith('/api/admin/backup')) return false;

    if (p === '/api/admin/fin/tudo' && m === 'GET') {
      return send(res, 200, {
        config: cfgFin(), lancamentos: load('fin-lancamentos.json', []), contratos: load('fin-contratos.json', []),
        estoque: load('fin-estoque.json', []), categorias: { receitas: RECEITAS, despesas: DESPESAS }, formas: FORMAS, hoje: todayISO(),
      }), true;
    }
    if (p === '/api/admin/fin/config' && m === 'POST') {
      const b = await readBody(req); const atual = cfgFin();
      const n = {
        saldoInicial: num(b.saldoInicial), dataSaldoInicial: data(b.dataSaldoInicial), capitalSocial: Math.abs(num(b.capitalSocial)),
        aliquotaImposto: Math.min(40, Math.abs(num(b.aliquotaImposto))), diasHigienizacao: Math.min(15, Math.abs(Math.round(num(b.diasHigienizacao)))),
        vidaUtilPadraoMeses: Math.max(1, Math.round(num(b.vidaUtilPadraoMeses) || 36)), metaMensal: Math.abs(num(b.metaMensal)),
        margemMinima: Math.min(90, Math.abs(num(b.margemMinima))), reservaMeses: Math.min(24, Math.abs(num(b.reservaMeses))),
        taxas: Object.fromEntries(FORMAS.map(f => [f, Math.min(30, Math.abs(num((b.taxas || {})[f])))])),
        despesasFixas: (Array.isArray(b.despesasFixas) ? b.despesasFixas : atual.despesasFixas).slice(0, 60).map(d => ({
          id: clean(d.id, 20) || id(), nome: clean(d.nome, 60), categoria: clean(d.categoria, 60) || 'Outras despesas',
          valor: Math.abs(num(d.valor)), dia: Math.min(28, Math.max(1, Math.round(num(d.dia) || 10))), ativo: d.ativo !== false,
        })).filter(d => d.nome && d.valor > 0),
      };
      save('fin-config.json', n);
      return send(res, 200, n), true;
    }

    // lançamentos
    if (p === '/api/admin/fin/lancamentos' && m === 'POST') {
      const b = await readBody(req);
      const lista = load('fin-lancamentos.json', []);
      const itens = (Array.isArray(b) ? b : [b]).slice(0, 200).map(limparLancamento).filter(l => l.valor > 0);
      if (!itens.length) return send(res, 400, { erro: 'Informe um valor maior que zero.' }), true;
      for (const it of itens) {
        if (it.fixoId && lista.some(l => l.fixoId === it.fixoId && l.id !== it.id)) continue; // não duplica contas fixas do mês
        const i = lista.findIndex(l => l.id === it.id); if (i >= 0) lista[i] = { ...lista[i], ...it }; else lista.push(it);
      }
      save('fin-lancamentos.json', lista);
      return send(res, 200, { ok: true, total: itens.length }), true;
    }
    const mPago = p.match(/^\/api\/admin\/fin\/lancamentos\/(\w+)\/pagar$/);
    if (mPago && m === 'POST') {
      const b = await readBody(req); const lista = load('fin-lancamentos.json', []); const l = lista.find(x => x.id === mPago[1]);
      if (!l) return send(res, 404, { erro: 'Lançamento não encontrado' }), true;
      l.pago = b.pago !== false; l.dataPagamento = l.pago ? (data(b.dataPagamento) || todayISO()) : '';
      if (b.forma && FORMAS.includes(b.forma)) { l.forma = b.forma; if (l.tipo === 'receita') l.taxa = taxaDe(l.forma, l.valor); }
      save('fin-lancamentos.json', lista);
      return send(res, 200, l), true;
    }
    const mDelL = p.match(/^\/api\/admin\/fin\/lancamentos\/(\w+)$/);
    if (mDelL && m === 'DELETE') { save('fin-lancamentos.json', load('fin-lancamentos.json', []).filter(l => l.id !== mDelL[1])); return send(res, 200, { ok: true }), true; }

    // acervo / estoque patrimonial
    if (p === '/api/admin/fin/estoque' && m === 'POST') {
      const b = await readBody(req);
      const itens = (Array.isArray(b.pecas) ? b.pecas : [b]).slice(0, 300).map(limparPeca).filter(x => x.nome);
      if (!itens.length) return send(res, 400, { erro: 'Informe o nome da peça.' }), true;
      const lista = load('fin-estoque.json', []);
      for (const it of itens) { const i = lista.findIndex(x => x.id === it.id); if (i >= 0) lista[i] = it; else lista.push(it); }
      save('fin-estoque.json', lista);
      // compra à vista/parcelada gera a saída de caixa como investimento (não entra como despesa no resultado)
      if (!Array.isArray(b.pecas) && b.gerarPagamento && itens[0].custo > 0) {
        const lanc = load('fin-lancamentos.json', []); const n = Math.min(12, Math.max(1, Math.round(num(b.parcelasCompra) || 1)));
        for (let i = 0; i < n; i++) lanc.push(limparLancamento({ tipo: 'despesa', categoria: 'Investimento em acervo', descricao: `Compra: ${itens[0].nome}${n > 1 ? ` (${i + 1}/${n})` : ''}`,
          valor: Math.round(itens[0].custo / n * 100) / 100, data: itens[0].dataAquisicao, vencimento: somaMeses(itens[0].dataAquisicao, i), pago: i === 0 && !!b.compraPaga, pecaId: itens[0].id }));
        save('fin-lancamentos.json', lanc);
      }
      return send(res, 200, { ok: true, total: itens.length }), true;
    }
    const mDelP = p.match(/^\/api\/admin\/fin\/estoque\/(\w+)$/);
    if (mDelP && m === 'DELETE') { save('fin-estoque.json', load('fin-estoque.json', []).filter(x => x.id !== mDelP[1])); return send(res, 200, { ok: true }), true; }

    // contratos
    if (p === '/api/admin/fin/contratos' && m === 'POST') {
      const b = await readBody(req); const c = limparContrato(b);
      if (!c.cliente) return send(res, 400, { erro: 'Informe o nome da cliente.' }), true;
      if (c.valorTotal <= 0 && c.status !== 'cancelado') return send(res, 400, { erro: 'Informe o valor do contrato.' }), true;
      if (c.tipo === 'aluguel' && c.retirada && c.devolucao && c.devolucao < c.retirada) return send(res, 400, { erro: 'A devolução não pode ser antes da retirada.' }), true;
      const contratos = load('fin-contratos.json', []), estoque = load('fin-estoque.json', []);
      const conf = conflitos(c, contratos, estoque);
      if (conf.length && !b.forcar) return send(res, 409, { erro: 'Conflito de datas', conflitos: conf }), true;
      const i = contratos.findIndex(x => x.id === c.id); if (i >= 0) contratos[i] = { ...c, criadoEm: contratos[i].criadoEm }; else contratos.push(c);
      save('fin-contratos.json', contratos);
      save('fin-lancamentos.json', gerarRecebiveis(c, load('fin-lancamentos.json', [])));
      if (c.tipo === 'venda' && c.status === 'ativo') {
        for (const p2 of estoque) if (c.pecas.includes(p2.id)) { p2.status = 'vendida'; p2.dataBaixa = c.dataContrato; }
        save('fin-estoque.json', estoque);
      }
      return send(res, 200, c), true;
    }
    const mDelC = p.match(/^\/api\/admin\/fin\/contratos\/(\w+)$/);
    if (mDelC && m === 'DELETE') {
      save('fin-contratos.json', load('fin-contratos.json', []).filter(x => x.id !== mDelC[1]));
      save('fin-lancamentos.json', load('fin-lancamentos.json', []).filter(l => l.contratoId !== mDelC[1] || l.pago));
      return send(res, 200, { ok: true }), true;
    }

    // backup completo (baixar e restaurar)
    if (p === '/api/admin/backup' && m === 'GET') {
      const arquivos = Object.fromEntries(ARQUIVOS_BACKUP.map(f => [f, load(f, null)]).filter(([, v]) => v !== null));
      return send(res, 200, { sistema: 'glamour-noivas', versao: 1, geradoEm: new Date().toISOString(), arquivos },
        { 'Content-Disposition': `attachment; filename="backup-glamour-${todayISO()}.json"` }), true;
    }
    if (p === '/api/admin/backup' && m === 'POST') {
      const b = await readBody(req);
      if (b.sistema !== 'glamour-noivas' || typeof b.arquivos !== 'object') return send(res, 400, { erro: 'Arquivo de backup inválido.' }), true;
      let n = 0;
      for (const f of ARQUIVOS_BACKUP) if (b.arquivos[f] !== undefined && b.arquivos[f] !== null && typeof b.arquivos[f] === 'object') { save(f, b.arquivos[f]); n++; }
      return send(res, 200, { ok: true, restaurados: n }), true;
    }
    return send(res, 404, { erro: 'Rota financeira não encontrada' }), true;
  };
};
