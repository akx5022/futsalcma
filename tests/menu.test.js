const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarApp } = require('./harness');

test('relatório: artilharia com barra proporcional e destaque do artilheiro', () => {
  const app = carregarApp();
  app.run(`golsJogadores = { ANA: 4, BIA: 2 }; atualizarRelatorioUI()`);
  assert.match(app.el('topArtilheiro').innerHTML, /ANA <em>· 4 gols<\/em>/);
  const lista = app.el('rankingArtilhariaList').innerHTML;
  assert.match(lista, /class="ranking-barra"><i style="width:100%">/);
  assert.match(lista, /class="ranking-barra"><i style="width:50%">/);
});

test('relatório sem dados mostra "Sem dados"', () => {
  const app = carregarApp();
  app.run('atualizarRelatorioUI()');
  assert.match(app.el('rankingTimesList').innerHTML, /Sem dados/);
  assert.equal(app.el('topArtilheiro').innerHTML, 'Sem gols ainda');
});

test('derrotas usam a barra vermelha', () => {
  const app = carregarApp();
  app.run(`derrotasJogadores = { EDU: 3 }; atualizarRelatorioUI()`);
  assert.match(app.el('rankingDerrotasJogadoresList').innerHTML, /ranking-barra perigo/);
});

test('pagantes: toggle Pago/Deve e botão de cobrar com contagem', () => {
  const app = carregarApp();
  app.run(`pagamentos = { ANA: 'pago', BIA: 'devendo' }; atualizarListaPagantesUI()`);
  const html = app.el('listaPagantes').innerHTML;
  assert.match(html, /toggle-pago pago/);
  assert.match(html, /toggle-pago devendo/);
  assert.match(app.el('btnCobrar').innerHTML, /Cobrar quem falta pagar \(1\)/);
});

test('alternarPagamento sem o botão re-renderiza a lista', () => {
  const app = carregarApp();
  app.run(`pagamentos = { ANA: 'devendo' }; alternarPagamento('ANA', 'pago')`);
  assert.equal(app.pegar('pagamentos.ANA'), 'pago');
  assert.match(app.el('listaPagantes').innerHTML, /toggle-pago pago/);
});

test('histórico e cobrança usam os novos componentes', () => {
  const app = carregarApp();
  const hist = app.run(`renderItemHistorico({ data: '2026-11-23', resumo: { golsJogadores: { ANA: 3 }, totalGols: 9 } })`);
  assert.match(hist, /class="hist"/);
  assert.match(hist, /23\/11\/2026/);
  assert.match(hist, /ANA \(3 gols\)/);
  const cob = app.run(`renderCobranca([{ id: 'atual', data: 'hoje', pagamentos: { ANA: 'pago', BIA: 'devendo' }, arquivada: false }])`);
  assert.match(cob, /class="cob-btn pago"/);
  assert.match(cob, /class="cob-btn devendo"/);
  assert.doesNotMatch(cob, /✅|❌/);
});

test('níveis: linha com data-nome e sem emoji no botão de ordenar', () => {
  const app = carregarApp();
  app.run(`estrelas = { ANA: 5 }; atualizarNiveisUI()`);
  assert.match(app.el('listaNiveis').innerHTML, /class="nivel-item" data-nome="ANA"/);
  assert.doesNotMatch(app.el('niveisControles').innerHTML, /⭐/);
});
