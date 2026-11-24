const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarApp, HTML } = require('./harness');

test('icone() devolve um SVG com o traçado pedido', () => {
  const { run } = carregarApp();
  const svg = run(`icone('x', 16)`);
  assert.match(svg, /^<svg class="ico" width="16" height="16"/);
  assert.match(svg, /M18 6 6 18/);
});

test('icone() de nome desconhecido devolve string vazia', () => {
  const { run } = carregarApp();
  assert.equal(run(`icone('nao-existe')`), '');
});

test('todos os ícones usados no app existem', () => {
  const { run } = carregarApp();
  for (const nome of ['menu', 'undo', 'x', 'pencil', 'play', 'pause', 'rotate-ccw', 'maximize',
    'minimize', 'alert-triangle', 'copy', 'trash', 'message', 'shuffle', 'bell-off']) {
    assert.notEqual(run(`icone('${nome}')`), '', `faltou o ícone ${nome}`);
  }
});

test('o app não depende mais do Lucide via CDN', () => {
  assert.doesNotMatch(HTML, /unpkg\.com\/lucide/);
  assert.doesNotMatch(HTML, /lucide\.createIcons/);
  assert.doesNotMatch(HTML, /data-lucide=/);
});
