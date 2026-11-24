const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarApp, montarPartida, espiarCelebracoes } = require('./harness');

test('app carrega sem erro e expõe as funções principais', () => {
  const { run } = carregarApp();
  assert.equal(run('typeof atualizarTela'), 'function');
  assert.equal(run('typeof celebrar'), 'function');
  assert.equal(run('typeof receberEstadoRemoto'), 'function');
});

test('modo offline: ?offline liga a flag e usa outra chave de armazenamento', () => {
  assert.equal(carregarApp().pegar('MODO_OFFLINE'), false);
  const app = carregarApp({ search: '?offline' });
  assert.equal(app.pegar('MODO_OFFLINE'), true);
  assert.equal(app.pegar('STORAGE_KEY'), 'futsalcma_estado_teste');
});

test('vitória no tempo comemora "AZUL VENCEU" com a cor do time e sem alert', () => {
  const app = carregarApp();
  montarPartida(app.run);
  const celebrados = espiarCelebracoes(app.run);
  app.run('golsA = 1; fimDeJogo(0)');
  const evs = celebrados();
  assert.equal(evs.length, 1);
  assert.equal(evs[0].tipo, 'vitoria');
  assert.equal(evs[0].titulo, 'AZUL VENCEU');
  assert.match(evs[0].sub, /1 × 0/);
  assert.equal(evs[0].cor, app.pegar('CORES.azul.dot'));
  assert.deepEqual(app.alertas, []);
  assert.equal(app.pegar('ultimoEvento.eventos[0].tipo'), 'vitoria');
});

test('3ª vitória seguida vira subtítulo da comemoração (sem alert)', () => {
  const app = carregarApp();
  montarPartida(app.run, { seguidas: [2, 0] });
  const celebrados = espiarCelebracoes(app.run);
  app.run('fimDeJogo(0)');
  assert.match(celebrados()[0].sub, /3 vitórias seguidas/);
  assert.deepEqual(app.alertas, []);
});

test('gol que fecha a partida (7e2) comemora GOL e depois VENCEU', () => {
  const app = carregarApp();
  montarPartida(app.run);
  const celebrados = espiarCelebracoes(app.run);
  app.run('golsA = 1; marcarGolJogador(0, 0)');
  assert.deepEqual(celebrados().map(e => e.tipo), ['gol', 'vitoria']);
  assert.deepEqual(app.pegar('ultimoEvento.eventos.map(e => e.tipo)'), ['gol', 'vitoria']);
  assert.deepEqual(app.alertas, []);
});

test('empate comemora EMPATE', () => {
  const app = carregarApp();
  montarPartida(app.run);
  const celebrados = espiarCelebracoes(app.run);
  app.run('resolverEmpate(0)');
  assert.deepEqual(celebrados().map(e => e.tipo), ['empate']);
});

test('estado remoto com evento mais novo comemora; repetido ou mais antigo não', () => {
  const app = carregarApp();
  montarPartida(app.run);
  const celebrados = espiarCelebracoes(app.run);
  const estado = ts => `({ ...coletarEstado(), ultimoEvento: { ts: ${ts}, eventos: [{ tipo: 'gol', titulo: 'GOL!', sub: 'x', cor: '#c6ff00' }] } })`;
  app.run(`ultimoEventoVisto = 1000; receberEstadoRemoto(${estado(2000)})`);
  assert.equal(celebrados().length, 1);
  app.run(`receberEstadoRemoto(${estado(2000)})`); // eco do mesmo evento
  app.run(`receberEstadoRemoto(${estado(1500)})`); // desfazer trouxe um evento antigo
  assert.equal(celebrados().length, 1);
});

test('abrir a página só registra o evento existente, sem comemorar', () => {
  const app = carregarApp();
  const celebrados = espiarCelebracoes(app.run);
  app.run(`marcarEventoVisto({ ts: 5000, eventos: [{ tipo: 'gol' }] })`);
  assert.equal(app.pegar('ultimoEventoVisto'), 5000);
  assert.equal(celebrados().length, 0);
});

test('evento local sempre fica mais novo que o último visto (relógio atrasado)', () => {
  const app = carregarApp();
  app.run('ultimoEventoVisto = Date.now() + 60000');
  const antes = app.pegar('ultimoEventoVisto');
  app.run(`celebrar = () => {}; registrarEventos([{ tipo: 'gol', titulo: 'GOL!', sub: '', cor: '#c6ff00' }])`);
  assert.equal(app.pegar('ultimoEvento.ts'), antes + 1);
  assert.equal(app.pegar('ultimoEventoVisto'), antes + 1);
});

test('estado antigo (sem ultimoEvento) é aplicado sem erro', () => {
  const app = carregarApp();
  app.run(`aplicarEstado({ times: [{ id: 1, jogadores: ['ANA'], partidasSeguidas: 0 }], golsA: 0, golsB: 0 })`);
  assert.equal(app.pegar('ultimoEvento'), null);
});

test('motor de comemoração roda e termina no DOM falso', () => {
  const app = carregarApp();
  app.run(`celebrar({ tipo: 'gol', titulo: 'GOL!', sub: 'ANA', cor: '#c6ff00' })`);
  assert.equal(app.pegar('celebrando'), true);
  app.run('pularCelebracao()');
  assert.equal(app.pegar('celebrando'), false);
});

test('cor do texto: preto em fundo claro, branco em fundo escuro', () => {
  const app = carregarApp();
  assert.equal(app.run(`corDoTexto('#c6ff00')`), '#000');
  assert.equal(app.run(`corDoTexto('#3b82f6')`), '#fff');
});
