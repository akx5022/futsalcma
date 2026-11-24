// Carrega o <script> inline do index.html num contexto isolado (vm) com um DOM falso,
// para testar a lógica do app sem navegador. Uso: const app = carregarApp(); app.run('golsA');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extrairScript(html) {
  const blocos = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  if (!blocos.length) throw new Error('Nenhum <script> inline encontrado no index.html');
  return blocos.map(m => m[1]).join('\n;\n');
}

// Elemento falso: aceita qualquer propriedade/chamada sem quebrar e guarda o que for atribuído.
function elementoFalso() {
  const dados = {
    style: { setProperty() {}, removeProperty() {} },
    dataset: {}, innerHTML: '', innerText: '', textContent: '', value: '', className: '', disabled: false
  };
  const classes = new Set();
  dados.classList = {
    add: (...c) => c.forEach(x => classes.add(x)),
    remove: (...c) => c.forEach(x => classes.delete(x)),
    toggle: (c, forcar) => {
      const on = forcar === undefined ? !classes.has(c) : !!forcar;
      if (on) classes.add(c); else classes.delete(c);
      return on;
    },
    contains: c => classes.has(c)
  };
  return new Proxy(function () {}, {
    get(_, k) {
      if (k in dados) return dados[k];
      if (typeof k === 'symbol' || k === 'then' || k === 'toJSON') return undefined;
      return elementoFalso();
    },
    set(_, k, v) { dados[k] = v; return true; },
    apply() { return elementoFalso(); }
  });
}

function semSegurar(t) { if (t && t.unref) t.unref(); return t; }

function carregarApp({ confirmar = true, prompt: respostaPrompt = null, search = '' } = {}) {
  const elementos = new Map();
  const el = id => { if (!elementos.has(id)) elementos.set(id, elementoFalso()); return elementos.get(id); };
  const alertas = [];
  const armazenamento = new Map();

  const ctx = {
    console,
    URLSearchParams,
    location: { search },
    setTimeout: (fn, ms) => semSegurar(setTimeout(fn, ms)),
    clearTimeout,
    setInterval: (fn, ms) => semSegurar(setInterval(fn, ms)),
    clearInterval,
    requestAnimationFrame: fn => semSegurar(setTimeout(fn, 0)),
    alert: msg => alertas.push(String(msg)),
    confirm: () => confirmar,
    prompt: () => respostaPrompt,
    localStorage: {
      getItem: k => (armazenamento.has(k) ? armazenamento.get(k) : null),
      setItem: (k, v) => armazenamento.set(k, String(v)),
      removeItem: k => armazenamento.delete(k)
    },
    navigator: { vibrate: () => true, clipboard: { writeText: () => Promise.resolve() } },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    lucide: { createIcons() {} },
    document: {
      getElementById: el,
      querySelector: () => elementoFalso(),
      querySelectorAll: () => [],
      createElement: () => elementoFalso(),
      addEventListener() {},
      body: elementoFalso(),
      documentElement: elementoFalso(),
      hidden: false
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(extrairScript(HTML), ctx, { filename: 'index.html' });

  const run = codigo => vm.runInContext(codigo, ctx);
  const pegar = expr => {
    const json = run(`JSON.stringify(${expr})`);
    return json === undefined ? undefined : JSON.parse(json);
  };
  return { run, pegar, el, alertas };
}

// 3 times: 1 (azul) e 2 (laranja) em quadra, 3 (verde) na fila.
function montarPartida(run, { modo = '7e2', seguidas = [0, 0] } = {}) {
  run(`
    times = [
      { id: 1, jogadores: ['ANA', 'BIA', 'CAU', 'DUDA'], partidasSeguidas: ${seguidas[0]} },
      { id: 2, jogadores: ['EDU', 'FABI', 'GUI', 'HUGO'], partidasSeguidas: ${seguidas[1]} },
      { id: 3, jogadores: ['IVO', 'JU', 'KAI', 'LEO'], partidasSeguidas: 0 }
    ];
    contadorTimes = 4; modoJogo = '${modo}'; golsA = 0; golsB = 0; coresTimes = {};
    vitoriasTimes = { 1: 0, 2: 0, 3: 0 }; vitoriasJogadores = {}; golsTime = {};
    derrotasTimes = {}; derrotasJogadores = {};
  `);
}

// Troca celebrar() por um espião. Retorna uma função que devolve os eventos comemorados.
function espiarCelebracoes(run) {
  run('var __celebrados = []; celebrar = (e) => { __celebrados.push(e); };');
  return () => JSON.parse(run('JSON.stringify(__celebrados)'));
}

module.exports = { carregarApp, montarPartida, espiarCelebracoes, HTML };
