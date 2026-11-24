const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarApp, montarPartida } = require('./harness');

test('primeira renderização: só os times entram animados', () => {
  const { run } = carregarApp();
  const novas = JSON.parse(run(`JSON.stringify(chavesNovas(null, ['t:1', 'j:ANA', 't:2']))`));
  assert.deepEqual(novas, ['t:1', 't:2']);
});

test('depois: só o que não existia antes', () => {
  const { run } = carregarApp();
  const novas = JSON.parse(run(`JSON.stringify(chavesNovas(new Set(['t:1', 'j:ANA']), ['t:1', 'j:ANA', 'j:BIA']))`));
  assert.deepEqual(novas, ['j:BIA']);
});

test('atualizarTela continua funcionando com o motion ligado', () => {
  const app = carregarApp();
  montarPartida(app.run);
  app.run('atualizarTela(); golsA = 1; atualizarTela()');
  assert.match(app.el('timesJogando').innerHTML, /id="placarA">1</);
  assert.deepEqual(app.pegar('placarAnterior'), { ids: '1-2', a: 1, b: 0 });
});
