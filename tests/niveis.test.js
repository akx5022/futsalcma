const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarApp, montarPartida } = require('./harness');

test('níveis: ✕ só aparece para quem não está na pelada de hoje', () => {
  const app = carregarApp();
  montarPartida(app.run); // ANA etc. estão nos times
  app.run(`pagamentos = { EDU: 'pago' }; estrelas = { ANA: 4, ZECA: 2 }; atualizarNiveisUI()`);
  const html = app.el('listaNiveis').innerHTML;
  assert.match(html, /removerJogadorNivel\('ZECA'\)/);
  assert.doesNotMatch(html, /removerJogadorNivel\('ANA'\)/);  // joga hoje (está num time)
  assert.doesNotMatch(html, /removerJogadorNivel\('EDU'\)/);  // joga hoje (está nos pagantes)
});

test('remover apaga a nota, com confirmação, e pode ser desfeito', () => {
  const app = carregarApp();
  app.run(`estrelas = { ZECA: 2, LIA: 5 }; removerJogadorNivel('ZECA')`);
  assert.deepEqual(app.pegar('estrelas'), { LIA: 5 });
  app.run('desfazer()');
  assert.deepEqual(app.pegar('estrelas'), { ZECA: 2, LIA: 5 });
});

test('remover não faz nada se o usuário cancelar', () => {
  const app = carregarApp({ confirmar: false });
  app.run(`estrelas = { ZECA: 2 }; removerJogadorNivel('ZECA')`);
  assert.deepEqual(app.pegar('estrelas'), { ZECA: 2 });
});

test('não remove quem está na pelada de hoje', () => {
  const app = carregarApp();
  montarPartida(app.run);
  app.run(`estrelas = { ANA: 4 }; removerJogadorNivel('ANA')`);
  assert.deepEqual(app.pegar('estrelas'), { ANA: 4 });
});
