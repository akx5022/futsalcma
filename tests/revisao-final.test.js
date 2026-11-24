const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarApp, montarPartida, espiarCelebracoes } = require('./harness');

// ===== 1. Versão antiga não apaga gols por jogador =====
function appComGols() {
  const app = carregarApp();
  montarPartida(app.run);
  app.run(`golsJogadores = { ANA: 2 }; golsPartida = { ANA: 1 }`);
  return app;
}

test('estado com as chaves de gols aplica normalmente (inclusive {} zera)', () => {
  const app = appComGols();
  app.run(`aplicarEstado({ ...coletarEstado(), golsJogadores: { BIA: 3 }, golsPartida: { BIA: 1 } })`);
  assert.deepEqual(app.pegar('golsJogadores'), { BIA: 3 });
  assert.deepEqual(app.pegar('golsPartida'), { BIA: 1 });
  app.run(`aplicarEstado({ ...coletarEstado(), golsJogadores: {}, golsPartida: {} })`);
  assert.deepEqual(app.pegar('golsJogadores'), {});
  assert.deepEqual(app.pegar('golsPartida'), {});
});

test('estado antigo (sem as chaves), com times e gol: mantém os mapas', () => {
  const app = appComGols();
  app.run(`{ const e = { ...coletarEstado(), golsA: 1, golsB: 0 }; delete e.golsJogadores; delete e.golsPartida; aplicarEstado(e); }`);
  assert.deepEqual(app.pegar('golsJogadores'), { ANA: 2 });
  assert.deepEqual(app.pegar('golsPartida'), { ANA: 1 });
});

test('estado antigo com times e 0 x 0: mantém artilharia, zera golsPartida', () => {
  const app = appComGols();
  app.run(`{ const e = { ...coletarEstado(), golsA: 0, golsB: 0 }; delete e.golsJogadores; delete e.golsPartida; aplicarEstado(e); }`);
  assert.deepEqual(app.pegar('golsJogadores'), { ANA: 2 });
  assert.deepEqual(app.pegar('golsPartida'), {});
});

test('estado antigo sem times zera os dois mapas', () => {
  const app = appComGols();
  app.run(`aplicarEstado({ times: [] })`);
  assert.deepEqual(app.pegar('golsJogadores'), {});
  assert.deepEqual(app.pegar('golsPartida'), {});
});

// ===== 2 e 3 (estáticos) =====
test('sem scrollIntoView e a tremida não tem rotate', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(!html.includes('scrollIntoView'));
  const m = html.match(/@keyframes tremer \{[\s\S]*?\n    \}/);
  assert.ok(m && !/rotate/.test(m[0]));
});

// ===== 4. Sirene para quando outro celular muda o tempo =====
test('tempo mudado por outro celular para a sirene e a borda vermelha', () => {
  const app = carregarApp();
  app.run(`ultimoAlarmeFim = 1000; tempoFinalTimestamp = null; rodando = false; document.body.classList.add('tempo-esgotado'); sincronizarTimerLocal()`);
  assert.equal(app.run(`document.body.classList.contains('tempo-esgotado')`), false);
});

test('atualização com o mesmo timestamp que tocou não para a sirene', () => {
  const app = carregarApp();
  app.run(`ultimoAlarmeFim = 1000; tempoFinalTimestamp = 1000; rodando = false; document.body.classList.add('tempo-esgotado'); sincronizarTimerLocal()`);
  assert.equal(app.run(`document.body.classList.contains('tempo-esgotado')`), true);
});

// ===== 5. Segundo plano não comemora =====
test('aba oculta: registra o evento mas não comemora', () => {
  const app = carregarApp();
  montarPartida(app.run);
  const celebrados = espiarCelebracoes(app.run);
  const estado = ts => `({ ...coletarEstado(), ultimoEvento: { ts: ${ts}, eventos: [{ tipo: 'gol', titulo: 'GOL!', sub: 'x', cor: '#c6ff00' }] } })`;
  app.run(`ultimoEventoVisto = 1000; document.hidden = true; receberEstadoRemoto(${estado(2000)})`);
  assert.equal(celebrados().length, 0);
  assert.equal(app.pegar('ultimoEventoVisto'), 2000);
  app.run(`document.hidden = false; receberEstadoRemoto(${estado(3000)})`);
  assert.equal(celebrados().length, 1);
});

// ===== 6. Nova pelada reseta o motion =====
test('sem jogo, as variáveis do motion voltam a null', () => {
  const app = carregarApp();
  montarPartida(app.run);
  app.run('atualizarTela()');
  assert.notEqual(app.pegar('placarAnterior'), null);
  app.run('aplicarEstado({ times: [] })');
  assert.equal(app.pegar('placarAnterior'), null);
  assert.equal(app.pegar('golsPartidaAnterior'), null);
  assert.equal(app.pegar('chavesVistas'), null);
  assert.equal(app.pegar('quadraAnterior'), null);
});
