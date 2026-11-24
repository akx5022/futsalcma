const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarApp, montarPartida, espiarCelebracoes } = require('./harness');

test('gol no jogador soma no placar do time, na artilharia e na partida', () => {
  const app = carregarApp();
  montarPartida(app.run);
  const celebrados = espiarCelebracoes(app.run);
  app.run('marcarGolJogador(1, 2)'); // GUI, do time 2 (laranja)
  assert.equal(app.pegar('golsB'), 1);
  assert.deepEqual(app.pegar('golsJogadores'), { GUI: 1 });
  assert.deepEqual(app.pegar('golsPartida'), { GUI: 1 });
  const ev = celebrados()[0];
  assert.equal(ev.tipo, 'gol');
  assert.match(ev.sub, /^GUI · Time Laranja · 0 × 1$/);
});

test('quem está na fila não marca gol', () => {
  const app = carregarApp();
  montarPartida(app.run);
  app.run('marcarGolJogador(2, 0)');
  assert.equal(app.pegar('golsA + golsB'), 0);
  assert.deepEqual(app.pegar('golsJogadores'), {});
});

test('2 gols no modo 7e2 encerram a partida; golsPartida zera e a artilharia fica', () => {
  const app = carregarApp();
  montarPartida(app.run);
  const celebrados = espiarCelebracoes(app.run);
  app.run('marcarGolJogador(0, 0); marcarGolJogador(0, 0)'); // ANA 2x
  assert.equal(app.pegar('vitoriasTimes[1]'), 1);
  assert.equal(app.pegar('golsA'), 0);
  assert.deepEqual(app.pegar('golsPartida'), {});
  assert.deepEqual(app.pegar('golsJogadores'), { ANA: 2 });
  assert.deepEqual(celebrados().map(e => e.tipo), ['gol', 'gol', 'vitoria']);
});

test('no modo 10 min · 2 gols, 2 gols (de jogadores diferentes) também encerram a partida', () => {
  const app = carregarApp();
  montarPartida(app.run, { modo: '10min' });
  const celebrados = espiarCelebracoes(app.run);
  app.run('marcarGolJogador(0, 0); marcarGolJogador(0, 1)');
  assert.equal(app.pegar('vitoriasTimes[1]'), 1);
  assert.equal(app.pegar('golsA'), 0);
  assert.deepEqual(app.pegar('times.slice(0, 2).map(t => t.id)'), [1, 3]); // laranja saiu, verde entrou
  assert.deepEqual(celebrados().map(e => e.tipo), ['gol', 'gol', 'vitoria']);
});

test('seletor de modo: "7 min · 2 gols" e "10 min · 2 gols" (sem modo corrido)', () => {
  const app = carregarApp();
  app.run(`modoJogo = '10min'; atualizarSeletorModo()`);
  const sel = app.el('seletorModo').innerHTML;
  assert.match(sel, /7 min · 2 gols/);
  assert.match(sel, /10 min · 2 gols/);
  assert.doesNotMatch(sel, /corrido/);
  assert.equal(app.el('modoLegenda').innerText, '10 minutos ou 2 gols encerram a partida');
});

test('desfazer depois do gol volta placar e artilharia', () => {
  const app = carregarApp();
  montarPartida(app.run);
  app.run('celebrar = () => {}; marcarGolJogador(0, 1); desfazer()');
  assert.equal(app.pegar('golsA'), 0);
  assert.deepEqual(app.pegar('golsJogadores'), {});
  assert.deepEqual(app.pegar('golsPartida'), {});
});

test('editar o nome leva os gols junto', () => {
  const app = carregarApp({ prompt: 'aninha' });
  montarPartida(app.run);
  app.run('celebrar = () => {}; marcarGolJogador(0, 0); editarJogador(0, 0)');
  assert.deepEqual(app.pegar('golsJogadores'), { ANINHA: 1 });
  assert.deepEqual(app.pegar('golsPartida'), { ANINHA: 1 });
});

test('empate zera os gols da partida mas mantém a artilharia', () => {
  const app = carregarApp();
  montarPartida(app.run);
  app.run('celebrar = () => {}; marcarGolJogador(0, 0); resolverEmpate(0)');
  assert.deepEqual(app.pegar('golsPartida'), {});
  assert.deepEqual(app.pegar('golsJogadores'), { ANA: 1 });
});

test('jogador que sai mantém os gols e o placar do time não muda', () => {
  const app = carregarApp();
  montarPartida(app.run, { modo: '10min' });
  app.run('celebrar = () => {}; marcarGolJogador(0, 0); removerJogador(0, 0)');
  assert.equal(app.pegar('golsA'), 1);
  assert.deepEqual(app.pegar('golsJogadores'), { ANA: 1 });
});

test('estado antigo sem os campos de gols abre com mapas vazios', () => {
  const app = carregarApp();
  app.run(`aplicarEstado({ times: [{ id: 1, jogadores: ['ANA'], partidasSeguidas: 0 }] })`);
  assert.deepEqual(app.pegar('golsJogadores'), {});
  assert.deepEqual(app.pegar('golsPartida'), {});
});

test('linha do jogador: ⚽ só em quadra, selo com os gols da partida', () => {
  const app = carregarApp();
  montarPartida(app.run);
  app.run(`golsPartida = { BIA: 2 }`);
  const quadra = app.run('renderListaJogadores(0)');
  assert.match(quadra, /marcarGolJogador\(0, 0\)/);
  assert.match(quadra, /data-chave="j:BIA"/);
  assert.match(quadra, /class="selo-gol" data-gols="2">⚽ 2</);
  const fila = app.run('renderListaJogadores(2)');
  assert.doesNotMatch(fila, /marcarGolJogador/);
  assert.match(fila, /editarJogador\(2, 0\)/);
  assert.match(fila, /removerJogador\(2, 0\)/);
});

test('ordenarPorValor: maior primeiro, empate em ordem alfabética, ignora zero', () => {
  const app = carregarApp();
  assert.deepEqual(app.pegar(`ordenarPorValor({ LEO: 1, ANA: 3, BIA: 3, ZE: 0 })`), ['ANA', 'BIA', 'LEO']);
});

test('histórico mostra o artilheiro da pelada', () => {
  const app = carregarApp();
  const html = app.run(`renderItemHistorico({ data: '2026-11-23', resumo: { golsJogadores: { ANA: 3, BIA: 1 } } })`);
  assert.match(html, /Artilheiro/);
  assert.match(html, /ANA \(3 gols\)/);
});

test('o placar do time não tem mais "+Gol / −"', () => {
  const app = carregarApp();
  assert.equal(app.run('typeof marcarGol'), 'undefined');
  assert.equal(app.run('typeof tirarGol'), 'undefined');
  assert.equal(app.run('typeof renderControleGols'), 'undefined');
});
