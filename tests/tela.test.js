const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarApp, montarPartida } = require('./harness');

test('tela principal: placar, cartões com data-chave e botões de encerrar', () => {
  const app = carregarApp();
  montarPartida(app.run);
  app.run('golsA = 1; atualizarTela()');
  const jogo = app.el('timesJogando').innerHTML;
  assert.match(jogo, /class="placar"/);
  assert.match(jogo, /id="placarA">1</);
  assert.match(jogo, /data-chave="t:1"/);
  assert.match(jogo, /data-chave="t:2"/);
  assert.match(app.el('listaFila').innerHTML, /data-chave="t:3"/);
  assert.match(app.el('listaFila').innerHTML, /1º · Verde/);
  const botoes = app.el('botoesVitoria').innerHTML;
  assert.match(botoes, /fimDeJogo\(0\)/);
  assert.match(botoes, /empate\(\)/);
  assert.match(botoes, /fimDeJogo\(1\)/);
  assert.equal(app.el('filaQtd').innerText, '1 time');
});

test('aviso de 3º jogo aparece pela classe "visivel"', () => {
  const app = carregarApp();
  montarPartida(app.run, { seguidas: [2, 0] });
  app.run('atualizarTela()');
  assert.equal(app.el('bannerAlerta3Jogo').classList.contains('visivel'), true);
  assert.match(app.el('timesJogando').innerHTML, /3º jogo · último/);
});

test('cores dos times novas e sem helpers antigos', () => {
  const app = carregarApp();
  assert.deepEqual(app.pegar('CORES.azul'), { nome: 'Azul', dot: '#3b82f6' });
  assert.equal(app.run('typeof getTeamClass'), 'undefined');
  assert.equal(app.run('typeof getBtnColorStyle'), 'undefined');
});

test('botão desfazer some sem histórico e mostra a quantidade com histórico', () => {
  const app = carregarApp();
  app.run('atualizarBotaoDesfazer()');
  assert.equal(app.el('btnDesfazer').classList.contains('oculto'), true);
  montarPartida(app.run);
  app.run('snapshotEstado()');
  assert.equal(app.el('btnDesfazer').classList.contains('oculto'), false);
  assert.equal(app.el('desfazerQtd').innerText, 1);
});

test('cronômetro: último minuto liga a classe "baixo"', () => {
  const app = carregarApp();
  app.run('tempoRestanteSeg = 59; atualizarDisplayTimer()');
  assert.equal(app.el('timerDisplay').classList.contains('baixo'), true);
  app.run('tempoRestanteSeg = 300; atualizarDisplayTimer()');
  assert.equal(app.el('timerDisplay').classList.contains('baixo'), false);
});

test('gaveta do menu e modais abrem e fecham por classe', () => {
  const app = carregarApp();
  montarPartida(app.run);
  app.run('abrirMenu()');
  assert.equal(app.el('menuModal').classList.contains('aberto'), true);
  app.run(`mudarAba('pix')`);
  assert.equal(app.el('tabPixBtn').classList.contains('ativa'), true);
  assert.equal(app.el('abaPixView').classList.contains('ativa'), true);
  assert.equal(app.el('tabPagantesBtn').classList.contains('ativa'), false);
  app.run('fecharMenu(); empate()');
  assert.equal(app.el('menuModal').classList.contains('aberto'), false);
  assert.equal(app.el('empateModal').classList.contains('aberto'), true);
  assert.match(app.el('empateBotoes').innerHTML, /resolverEmpate\(1\)/);
});
