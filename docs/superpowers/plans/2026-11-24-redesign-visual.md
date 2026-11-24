# Redesign visual + motion + gols por jogador — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o visual "esportivo minimalista" no app inteiro, com comemoração em tela cheia (gol, vitória, empate) sincronizada entre celulares, e trocar o gol por time pelo gol por jogador (artilharia).

**Architecture:** Tudo continua no `index.html` único (HTML + `<style>` + um `<script>` inline). As animações usam só CSS e JS nativo, sem biblioteca. A lógica do jogo não muda, só ganha ganchos: `registrarEventos()` grava um `ultimoEvento` no estado sincronizado, e `celebrar()` mostra o overlay. Os testes ficam em `tests/` e carregam o `<script>` do `index.html` num `vm` do Node com DOM falso.

**Tech Stack:** HTML/CSS/JS puro, Supabase JS v2 (CDN, já existente), Google Fonts (Space Grotesk), `node:test` (Node 22) para os testes.

**Spec:** `docs/superpowers/specs/2026-11-24-redesign-visual-design.md`

## Global Constraints

- Um arquivo só: `index.html`. Nada de build, bundler, `package.json` ou biblioteca de animação.
- Cores: `--bg #000`, `--s1 #0d0d0d`, `--s2 #161616`, `--ln #222`, `--tx #f5f5f5`, `--mu #8a8a8a`, `--di #525252`, `--ac #c6ff00` (texto sobre ele `#000`), `--dg #ff4d4d`, `--wr #ffb020`.
- Fonte: Space Grotesk 500/700 (Google Fonts). Números com `font-variant-numeric: tabular-nums`.
- Cores de time (`CORES[x].dot`): azul `#3b82f6`, laranja `#f97316`, verde `#22c55e`, vermelho `#ef4444`, cinza `#9ca3af`.
- Comemoração: ~1,6s (1,2s com movimento reduzido), some com um toque, vibração gol `[60,40,60]`, vitória `[80,50,80,50,160]`. Nenhum som novo.
- `ultimoEvento = { ts, eventos: [{ tipo, titulo, sub, cor }] }`, com `ts = Math.max(Date.now(), ultimoEventoVisto + 1)`.
- Corrigir gol só pelo Desfazer (não existe "−"). Não existe gol contra.
- Emojis saem da interface, mas ficam nas mensagens de WhatsApp e no ⚽ (botão e selo de gol).
- Textos da interface em português.
- **Nunca testar no navegador sem `?offline`**: sem ele, o app grava na pelada real (Supabase `pelada.id = 1`), que todos compartilham.
- Git: esta máquina não tem `user.name`/`user.email` configurados. Use o mesmo autor dos commits anteriores (`git log -1 --format='%an <%ae>'`) via `git -c user.name=... -c user.email=... commit`. Termine cada mensagem com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Rodar testes: `node --test "tests/**/*.test.js"` (no Bash).

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | App inteiro (modificado em todas as tarefas) |
| `tests/harness.js` | Carrega o `<script>` inline do `index.html` num `vm` com DOM falso; helpers de teste (criado na Tarefa 1) |
| `tests/eventos.test.js` | Comemoração, eventos sincronizados, modo offline (Tarefa 1) |
| `tests/icones.test.js` | Ícones inline (Tarefa 2) |
| `tests/gols.test.js` | Gols por jogador e artilharia (Tarefa 3) |
| `tests/tela.test.js` | Renderização da tela principal (Tarefa 4) |
| `tests/menu.test.js` | Renderização do conteúdo do menu (Tarefa 5) |
| `tests/motion.test.js` | Lógica de "o que é novo" do motion (Tarefa 6) |

## Como testar no navegador (todas as tarefas)

```bash
cd "c:/Users/gabri/Downloads/futsalcma" && npx --yes http-server -p 5173 -c-1 .
```

Abrir **http://localhost:5173/index.html?offline**. O badge de sync deve dizer "Modo teste (offline)". Se preferir, use o skill `run`, mas sempre com `?offline`.

---

### Tarefa 1: Testes, modo offline, motor de comemoração e eventos sincronizados

**Files:**
- Create: `tests/harness.js`
- Create: `tests/eventos.test.js`
- Modify: `index.html` (constantes da nuvem, estado, `coletarEstado`, `aplicarEstado`, `iniciarNuvem`, `marcarGol`, `fimDeJogo`, `resolverEmpate`, `<style>`, HTML do overlay)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `tests/harness.js`: `carregarApp({ confirmar?: boolean, prompt?: string|null, search?: string }) → { run(codigo): any, pegar(expr): any (cópia via JSON), el(id): ElementoFalso, alertas: string[] }`, `montarPartida(run, { modo?: '7e2'|'10min', seguidas?: [n, n] })`, `espiarCelebracoes(run) → () => evento[]`
  - `index.html` (globais): `MODO_OFFLINE: boolean`, `ultimoEvento`, `ultimoEventoVisto: number`, `celebrar(evento)`, `pularCelebracao()`, `registrarEventos(lista)`, `marcarEventoVisto(ultimoEvento)`, `comemorarSeNovo(ultimoEvento)`, `receberEstadoRemoto(estado)`, `fimDeJogo(indexVencedor, eventosAntes = [])`, `corDoTexto(hex) → '#000'|'#fff'`, `celebrando: boolean`
  - Formato do evento: `{ tipo: 'gol'|'vitoria'|'empate', titulo: string, sub: string, cor: string }`

- [ ] **Passo 1: Criar o harness de testes**

`tests/harness.js`:

```js
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
```

- [ ] **Passo 2: Escrever os testes (vão falhar)**

`tests/eventos.test.js`:

```js
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
  app.run('golsA = 1; marcarGol(0)');
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
```

- [ ] **Passo 3: Rodar e ver falhar**

Run: `cd "c:/Users/gabri/Downloads/futsalcma" && node --test "tests/**/*.test.js"`
Expected: FAIL. O primeiro teste falha com `typeof celebrar` igual a `'undefined'`, e os demais com `ReferenceError` / `alert` capturado.

- [ ] **Passo 4: Modo offline**

Em `index.html`, troque a linha `const STORAGE_KEY = 'futsalcma_estado';` por:

```js
    // ?offline na URL: não conecta na nuvem e usa outro armazenamento local
    // (para testar no navegador sem mexer na pelada real, que é compartilhada)
    const MODO_OFFLINE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('offline');
    const STORAGE_KEY = MODO_OFFLINE ? 'futsalcma_estado_teste' : 'futsalcma_estado';
```

- [ ] **Passo 5: Estado do evento**

Logo depois de `let alarmeTimeout = null;`, adicione:

```js

    // ===== COMEMORAÇÕES (gol / vitória / empate) =====
    // Último evento comemorável: vai junto no estado da nuvem para os outros celulares comemorarem.
    // Formato: { ts, eventos: [{ tipo: 'gol'|'vitoria'|'empate', titulo, sub, cor }] }
    let ultimoEvento = null;
    let ultimoEventoVisto = 0;   // ts do último evento já comemorado/registrado neste aparelho
```

Em `coletarEstado()`, troque a linha
`        golsTime, derrotasTimes, derrotasJogadores, coresTimes, modoJogo, estrelas,`
por
`        golsTime, derrotasTimes, derrotasJogadores, coresTimes, modoJogo, estrelas, ultimoEvento,`

Em `aplicarEstado(estado)`, logo depois de `estrelas = estado.estrelas || {};`, adicione:

```js
      ultimoEvento = estado.ultimoEvento || null;
```

- [ ] **Passo 6: Motor de comemoração e eventos**

Logo antes da linha `// ===== DESFAZER (Ctrl+Z / botão) =====`, adicione:

```js
    // ===== MOTOR DE COMEMORAÇÃO (overlay em tela cheia) =====
    const DURACAO_CELEBRACAO = 1600;
    let filaCelebracao = [];      // comemorações esperando a vez (não se sobrepõem)
    let celebrando = false;
    let celebracaoTimer = null;
    let ultimoToque = null;       // onde o dedo tocou por último (a comemoração local nasce dali)

    document.addEventListener('pointerdown', (e) => {
      ultimoToque = { x: e.clientX, y: e.clientY, t: Date.now() };
    }, { passive: true });

    function movimentoReduzido() {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function vibrar(padrao) {
      try { if (navigator.vibrate) navigator.vibrate(padrao); } catch (e) {}
    }

    // Texto preto em fundo claro, branco em fundo escuro
    function corDoTexto(hex) {
      const h = String(hex || '').replace('#', '');
      if (h.length !== 6) return '#000';
      const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
      return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#000' : '#fff';
    }

    function gerarParticulas(n) {
      let html = '';
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
        const dist = 120 + Math.random() * 90;
        const x = Math.round(Math.cos(ang) * dist), y = Math.round(Math.sin(ang) * dist);
        html += `<i style="--x:${x}px;--y:${y}px;--r:${Math.round(Math.random() * 360)}deg"></i>`;
      }
      return html;
    }

    function celebrar(evento) {
      if (!evento) return;
      filaCelebracao.push(evento);
      if (!celebrando) proximaCelebracao();
    }

    function proximaCelebracao() {
      const el = document.getElementById('celebracao');
      const pagina = document.getElementById('mainContainer');
      const ev = filaCelebracao.shift();
      if (!ev) {
        celebrando = false;
        el.className = 'celebracao';
        if (pagina) pagina.classList.remove('tremendo');
        return;
      }
      celebrando = true;
      const reduzido = movimentoReduzido();
      const cor = ev.cor || '#c6ff00';
      const toqueRecente = ev._local && ultimoToque && (Date.now() - ultimoToque.t) < 2000;

      document.getElementById('celTitulo').innerText = ev.titulo || '';
      document.getElementById('celSub').innerText = ev.sub || '';
      document.getElementById('celParticulas').innerHTML =
        (reduzido || ev.tipo === 'empate') ? '' : gerarParticulas(10);
      el.style.setProperty('--cel-cor', cor);
      el.style.setProperty('--cel-tinta', corDoTexto(cor));
      el.style.setProperty('--cel-origem', toqueRecente ? `${ultimoToque.x}px ${ultimoToque.y}px` : '50% 50%');

      el.className = 'celebracao';
      void el.offsetWidth; // força o navegador a recomeçar as animações
      el.className = `celebracao ativa cel-${ev.tipo}${reduzido ? ' reduzido' : ''}`;

      if (pagina && !reduzido && ev.tipo !== 'empate') {
        pagina.classList.remove('tremendo');
        void pagina.offsetWidth;
        pagina.classList.add('tremendo');
      }
      vibrar(ev.tipo === 'vitoria' ? [80, 50, 80, 50, 160] : ev.tipo === 'gol' ? [60, 40, 60] : [40]);

      clearTimeout(celebracaoTimer);
      celebracaoTimer = setTimeout(proximaCelebracao, reduzido ? 1200 : DURACAO_CELEBRACAO);
    }

    // Um toque na comemoração pula para a próxima (ou fecha)
    function pularCelebracao() {
      clearTimeout(celebracaoTimer);
      proximaCelebracao();
    }

    // Ação feita AQUI: grava o evento (vai pra nuvem no próximo salvarEstado) e comemora na hora.
    // O ts sempre avança, mesmo se o relógio deste celular estiver atrasado em relação aos outros.
    function registrarEventos(lista) {
      const ts = Math.max(Date.now(), ultimoEventoVisto + 1);
      ultimoEvento = { ts, eventos: lista };
      ultimoEventoVisto = ts;
      lista.forEach(e => celebrar({ ...e, _local: true }));
    }

    // Ao abrir a página: só registra o evento que já existe (não comemora coisa velha)
    function marcarEventoVisto(ev) {
      if (ev && typeof ev.ts === 'number') ultimoEventoVisto = Math.max(ultimoEventoVisto, ev.ts);
    }

    // Chegou estado de outro celular: comemora só se o evento é mais novo que o último visto
    // (o eco da própria ação e o "desfazer", que traz um evento antigo, não comemoram)
    function comemorarSeNovo(ev) {
      if (!ev || typeof ev.ts !== 'number' || ev.ts <= ultimoEventoVisto) return;
      ultimoEventoVisto = ev.ts;
      (Array.isArray(ev.eventos) ? ev.eventos : []).forEach(e => celebrar(e));
    }

    function receberEstadoRemoto(estado) {
      if (!estado) return;
      sincronizando = true; aplicarEstado(estado); sincronizando = false;
      comemorarSeNovo(estado.ultimoEvento);
    }

```

- [ ] **Passo 7: Nuvem usa os eventos (e respeita o modo offline)**

Substitua a função `iniciarNuvem` inteira por:

```js
    // Inicia a nuvem: carrega o estado atual e escuta mudanças ao vivo
    async function iniciarNuvem() {
      // 1) Mostra rápido o que estiver salvo localmente (enquanto a nuvem responde)
      try {
        const local = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (local && Array.isArray(local.times) && local.times.length) {
          sincronizando = true; aplicarEstado(local); sincronizando = false;
          marcarEventoVisto(local.ultimoEvento);
        }
      } catch (e) {}

      if (MODO_OFFLINE) {
        atualizarSyncBadge('erro', 'Modo teste (offline) — nada vai para a nuvem');
        return;
      }

      if (!window.supabase) {
        atualizarSyncBadge('erro', 'Nuvem indisponível — usando só este aparelho');
        return;
      }

      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

      // 2) Carrega o estado atual da nuvem
      try {
        const { data, error } = await sb.from('pelada')
          .select('estado').eq('id', PELADA_ID).single();
        if (!error && data && data.estado) {
          sincronizando = true; aplicarEstado(data.estado); sincronizando = false;
          marcarEventoVisto(data.estado.ultimoEvento);
          atualizarSyncBadge('ok', 'Dados sincronizados na nuvem ✓');
        } else {
          atualizarSyncBadge('ok', 'Conectado à nuvem ✓');
        }
      } catch (e) {
        console.warn(e);
        atualizarSyncBadge('erro', 'Sem conexão — usando só este aparelho');
      }

      // 3) Escuta mudanças em tempo real (outro aparelho alterou -> atualiza aqui e comemora se for o caso)
      try {
        sb.channel('pelada-mudancas')
          .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'pelada', filter: 'id=eq.' + PELADA_ID },
            (payload) => {
              if (payload && payload.new && payload.new.estado) receberEstadoRemoto(payload.new.estado);
            })
          .subscribe();
      } catch (e) { console.warn(e); }
    }
```

- [ ] **Passo 8: Gol, vitória e empate geram eventos (sem alert)**

Substitua a função `marcarGol` inteira por:

```js
    function marcarGol(qualTime) {
      if (times.length < 2) return;
      snapshotEstado();
      if (qualTime === 0) golsA++; else golsB++;
      const evGol = { tipo: 'gol', titulo: 'GOL!', sub: `${nomeTime(times[qualTime].id)} · ${golsA} × ${golsB}`, cor: '#c6ff00' };

      // 2 gols encerra a partida automaticamente — SÓ no Modo A (7 min + 2 gols).
      // No Modo B (10 min corridos), os gols só contam para o relatório e não encerram.
      if (modoJogo === '7e2' && (golsA >= GOLS_PARA_VENCER || golsB >= GOLS_PARA_VENCER)) {
        fimDeJogo(golsA >= GOLS_PARA_VENCER ? 0 : 1, [evGol]);
      } else {
        registrarEventos([evGol]);
        atualizarTela();
        salvarEstado();
      }
    }
```

Substitua a função `fimDeJogo` inteira por:

```js
    // eventosAntes: comemorações que vêm antes do "VENCEU" (ex.: o gol que decidiu a partida)
    function fimDeJogo(indexVencedor, eventosAntes = []) {
      if (times.length < 2) return;
      snapshotEstado();

      let indexPerdedor = indexVencedor === 0 ? 1 : 0;
      let vencedor = times[indexVencedor];
      let perdedor = times[indexPerdedor];
      const golsVenc = indexVencedor === 0 ? golsA : golsB;
      const golsPerd = indexVencedor === 0 ? golsB : golsA;

      vitoriasTimes[vencedor.id] = (vitoriasTimes[vencedor.id] || 0) + 1;
      vencedor.jogadores.forEach(jogador => {
        vitoriasJogadores[jogador] = (vitoriasJogadores[jogador] || 0) + 1;
      });

      // Gols totais por time (placar final desta partida)
      const idA = times[0].id, idB = times[1].id;
      golsTime[idA] = (golsTime[idA] || 0) + golsA;
      golsTime[idB] = (golsTime[idB] || 0) + golsB;

      // Derrotas do time perdedor e de cada jogador dele
      derrotasTimes[perdedor.id] = (derrotasTimes[perdedor.id] || 0) + 1;
      perdedor.jogadores.forEach(jogador => {
        derrotasJogadores[jogador] = (derrotasJogadores[jogador] || 0) + 1;
      });

      vencedor.partidasSeguidas = (vencedor.partidasSeguidas || 0) + 1;
      perdedor.partidasSeguidas = 0;

      const corVenc = CORES[corDoTime(vencedor.id)];
      const evVitoria = {
        tipo: 'vitoria',
        titulo: `${corVenc.nome.toUpperCase()} VENCEU`,
        sub: `${nomeTime(vencedor.id)} · ${golsVenc} × ${golsPerd}`,
        cor: corVenc.dot
      };

      if (vencedor.partidasSeguidas >= 3) {
        evVitoria.sub = '3 vitórias seguidas · entram 2 times novos';
        vencedor.partidasSeguidas = 0;

        let tA = times.shift();
        let tB = times.shift();

        times.push(tA);
        times.push(tB);
      } else {
        let teamPerdedor = times.splice(indexPerdedor, 1)[0];
        times.push(teamPerdedor);
      }

      golsA = 0; golsB = 0; // zera o placar para a próxima partida
      registrarEventos([...eventosAntes, evVitoria]);
      resetTimer();
      atualizarTela();
      salvarEstado();
    }
```

Substitua a função `resolverEmpate` inteira por:

```js
    // frenteIndex: 0 = time da esquerda joga primeiro | 1 = time da direita joga primeiro
    function resolverEmpate(frenteIndex) {
      fecharEmpateModal();
      if (times.length < 2) return;
      snapshotEstado();

      // Gols totais por time (placar final desta partida)
      const idA = times[0].id, idB = times[1].id;
      golsTime[idA] = (golsTime[idA] || 0) + golsA;
      golsTime[idB] = (golsTime[idB] || 0) + golsB;
      const evEmpate = { tipo: 'empate', titulo: 'EMPATE', sub: `${nomeTime(idA)} ${golsA} × ${golsB} ${nomeTime(idB)}`, cor: '#f5f5f5' };

      // Empate: os dois times saem do campo (a sequência de vitórias seguidas zera).
      let tA = times.shift();
      let tB = times.shift();
      tA.partidasSeguidas = 0;
      tB.partidasSeguidas = 0;

      // Ordem na fila escolhida pelo admin: quem vai na frente volta a jogar primeiro.
      const frente = (frenteIndex === 1) ? tB : tA;
      const atras  = (frenteIndex === 1) ? tA : tB;
      times.push(frente);
      times.push(atras);

      golsA = 0; golsB = 0; // zera o placar para a próxima partida
      registrarEventos([evEmpate]);
      resetTimer();
      atualizarTela();
      salvarEstado();
    }
```

- [ ] **Passo 9: HTML do overlay**

Logo antes de `<!-- Tela Cheia de Cronômetro -->`, adicione:

```html
  <!-- Comemoração em tela cheia (gol / vitória / empate). Um toque pula. -->
  <div id="celebracao" class="celebracao" aria-live="assertive" onclick="pularCelebracao()">
    <div class="cel-conteudo">
      <div class="cel-titulo" id="celTitulo"></div>
      <div class="cel-sub" id="celSub"></div>
    </div>
    <div class="cel-particulas" id="celParticulas"></div>
  </div>

```

- [ ] **Passo 10: CSS da comemoração**

Logo antes de `</style>`, adicione:

```css

    /* ===== Comemoração em tela cheia ===== */
    .celebracao {
      position: fixed; inset: 0; z-index: 20000; display: none;
      background: var(--cel-cor, #c6ff00); color: var(--cel-tinta, #000);
      align-items: center; justify-content: center; text-align: center; overflow: hidden;
      cursor: pointer; user-select: none; -webkit-user-select: none;
    }
    .celebracao.ativa { display: flex; animation: celRevelar 1.6s cubic-bezier(.7,0,.2,1) both; }
    .cel-conteudo { padding: 24px; position: relative; z-index: 1; }
    .cel-titulo {
      font-family: 'Space Grotesk', system-ui, sans-serif; font-weight: 700;
      font-size: clamp(64px, 22vw, 160px); line-height: .9; letter-spacing: -0.06em;
      animation: celTitulo 1.6s cubic-bezier(.2,.8,.2,1.15) both;
    }
    .cel-vitoria .cel-titulo { font-size: clamp(44px, 14vw, 110px); }
    .cel-sub {
      margin-top: 14px; font-family: 'Space Grotesk', system-ui, sans-serif; font-weight: 700;
      font-size: 0.95rem; letter-spacing: .16em; text-transform: uppercase;
      animation: celSub 1.6s ease both;
    }
    .cel-particulas { position: absolute; left: 50%; top: 50%; }
    .cel-particulas i {
      position: absolute; width: 10px; height: 10px; border-radius: 3px; background: currentColor;
      animation: celParticula 1.6s cubic-bezier(.2,.8,.2,1) both;
    }
    @keyframes celRevelar {
      0%   { clip-path: circle(0% at var(--cel-origem, 50% 50%)); opacity: 1; }
      24%  { clip-path: circle(150% at var(--cel-origem, 50% 50%)); }
      85%  { opacity: 1; }
      100% { clip-path: circle(150% at var(--cel-origem, 50% 50%)); opacity: 0; }
    }
    @keyframes celTitulo {
      0%, 12%   { transform: scale(.4) rotate(-8deg); opacity: 0; }
      30%       { transform: scale(1.1) rotate(-3deg); opacity: 1; }
      40%, 78%  { transform: scale(1) rotate(-3deg); opacity: 1; }
      92%, 100% { transform: scale(1) rotate(-3deg); opacity: 0; }
    }
    @keyframes celSub { 0%, 25% { opacity: 0; transform: translateY(10px); } 40%, 78% { opacity: 1; transform: none; } 92%, 100% { opacity: 0; } }
    @keyframes celParticula {
      0%, 18% { opacity: 0; transform: translate(0, 0) rotate(0); }
      26%     { opacity: 1; }
      75%     { opacity: 1; transform: translate(var(--x), var(--y)) rotate(var(--r)); }
      100%    { opacity: 0; transform: translate(var(--x), var(--y)) rotate(var(--r)); }
    }
    /* Empate: mais contido (sem tremida nem partículas) */
    .cel-empate .cel-titulo { animation-name: celTituloSuave; }
    @keyframes celTituloSuave { 0%, 15% { opacity: 0; transform: scale(.9); } 35%, 78% { opacity: 1; transform: none; } 95%, 100% { opacity: 0; } }
    /* Tremida da página por trás */
    #mainContainer.tremendo { animation: tremer .45s cubic-bezier(.36,.07,.19,.97) .3s both; }
    @keyframes tremer {
      15% { transform: translateX(-6px) rotate(-1deg); } 30% { transform: translateX(6px) rotate(1deg); }
      45% { transform: translateX(-4px); } 60% { transform: translateX(3px); } 75% { transform: translateX(-1px); } 100% { transform: none; }
    }
    /* Movimento reduzido: só um fade */
    .celebracao.reduzido, .celebracao.reduzido .cel-titulo, .celebracao.reduzido .cel-sub { animation: celFade 1.2s ease both; }
    @keyframes celFade { 0% { opacity: 0; } 15%, 80% { opacity: 1; } 100% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) {
      #mainContainer.tremendo { animation: none !important; }
      .cel-particulas { display: none; }
    }
```

- [ ] **Passo 11: Rodar os testes**

Run: `cd "c:/Users/gabri/Downloads/futsalcma" && node --test "tests/**/*.test.js"`
Expected: PASS (12 testes).

- [ ] **Passo 12: Conferir no navegador (offline)**

Suba o servidor (veja "Como testar no navegador") e abra `http://localhost:5173/index.html?offline`.
Cadastre 12 nomes, sorteie, e confira:
- "+Gol" de um time comemora "GOL!" verde-limão, saindo do botão, com tremida e partículas.
- O segundo gol no modo 7e2 mostra "GOL!" e logo depois "AZUL VENCEU" (ou outra cor), sem `alert`.
- Tocar na comemoração pula para a próxima.
- "Empate" → escolher quem joga primeiro → "EMPATE", sem tremida.
- Recarregar a página não comemora nada.
- No console: `receberEstadoRemoto({ ...coletarEstado(), ultimoEvento: { ts: Date.now() + 5000, eventos: [{ tipo: 'gol', titulo: 'GOL!', sub: 'TESTE REMOTO', cor: '#c6ff00' }] } })` comemora vindo do centro da tela.

- [ ] **Passo 13: Commit**

```bash
cd "c:/Users/gabri/Downloads/futsalcma" && git add index.html tests/harness.js tests/eventos.test.js && git -c user.name="<autor>" -c user.email="<email>" commit -m "$(cat <<'EOF'
Comemoração em tela cheia (gol/vitória/empate) sincronizada + modo ?offline + testes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 2: Ícones inline (remove o Lucide)

**Files:**
- Create: `tests/icones.test.js`
- Modify: `index.html` (`<head>`, cabeçalho, início do `<script>`, `DOMContentLoaded`)

**Interfaces:**
- Consumes: harness da Tarefa 1.
- Produces: `ICONES: { [nome]: string }`, `icone(nome: string, tamanho = 18) → string` (SVG, ou `''` se o nome não existir), `preencherIcones(raiz = document)`, que preenche todo elemento com `data-icone="nome"` (tamanho opcional em `data-tam`). Nomes: `menu, undo, x, pencil, play, pause, rotate-ccw, maximize, minimize, alert-triangle, copy, trash, message, shuffle, bell-off`.

- [ ] **Passo 1: Escrever os testes (vão falhar)**

`tests/icones.test.js`:

```js
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
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `node --test "tests/**/*.test.js"`
Expected: FAIL em `icones.test.js` (`icone is not defined`, e o HTML ainda tem `unpkg.com/lucide`).

- [ ] **Passo 3: Implementar**

1. No `<head>`, apague as linhas:
```html
  <!-- Carregando os Ícones da biblioteca Lucide -->
  <script src="https://unpkg.com/lucide@latest"></script>

```
2. Troque `<i data-lucide="menu" class="menu-icon" onclick="abrirMenu()" width="32" height="32"></i>` por:
```html
      <span class="menu-icon" onclick="abrirMenu()" data-icone="menu" data-tam="28"></span>
```
3. No início do `<script>`, troque a linha `    lucide.createIcons();` por:

```js
    // ===== ÍCONES (SVG inline, traçado baseado no Lucide — licença ISC) =====
    const ICONES = {
      'menu': '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
      'undo': '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
      'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
      'pencil': '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
      'play': '<polygon points="6 3 20 12 6 21 6 3"/>',
      'pause': '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
      'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
      'maximize': '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
      'minimize': '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
      'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
      'copy': '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
      'trash': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2"/>',
      'message': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
      'shuffle': '<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.97a4 4 0 0 0 3.3-1.7l5.45-7.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.97a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.04a4 4 0 0 1-3.3-1.8l-.36-.45"/>',
      'bell-off': '<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/>'
    };

    function icone(nome, tamanho = 18) {
      const tracado = ICONES[nome];
      if (!tracado) return '';
      return `<svg class="ico" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${tracado}</svg>`;
    }

    // Preenche os ícones escritos no HTML como <span data-icone="nome" data-tam="16"></span>
    function preencherIcones(raiz = document) {
      raiz.querySelectorAll('[data-icone]').forEach(el => {
        el.innerHTML = icone(el.dataset.icone, Number(el.dataset.tam) || 18);
      });
    }
```

4. No fim do `<script>`, troque `    document.addEventListener('DOMContentLoaded', iniciarNuvem);` por:

```js
    document.addEventListener('DOMContentLoaded', () => { preencherIcones(); iniciarNuvem(); });
```

5. Em `tests/harness.js`, apague a linha `    lucide: { createIcons() {} },` (não é mais necessária).

- [ ] **Passo 4: Rodar os testes**

Run: `node --test "tests/**/*.test.js"`
Expected: PASS (todos, incluindo os da Tarefa 1).

- [ ] **Passo 5: Conferir no navegador (offline)**

Em `http://localhost:5173/index.html?offline`, o ícone ☰ do topo aparece e abre o menu. No DevTools, a aba Network não mostra nenhuma requisição a `unpkg.com`.

- [ ] **Passo 6: Commit**

```bash
git add index.html tests/icones.test.js tests/harness.js && git -c user.name="<autor>" -c user.email="<email>" commit -m "$(cat <<'EOF'
Ícones SVG inline no lugar do Lucide via CDN

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 3: Gol por jogador e artilharia

**Files:**
- Create: `tests/gols.test.js`
- Modify: `tests/eventos.test.js` (o teste que usa `marcarGol`)
- Modify: `index.html` (estado, `coletarEstado`, `aplicarEstado`, `marcarGol` → `marcarGolJogador`, `tirarGol` e `renderControleGols` removidos, `atualizarTela`, `renderListaJogadores`, `fimDeJogo`, `resolverEmpate`, `gerarSorteio`, `novaPelada`, `editarJogador`, `arquivarPelada`, `renderItemHistorico`, `atualizarRelatorioUI`, HTML do Relatório, `<style>`)

**Interfaces:**
- Consumes: `registrarEventos(lista)`, `fimDeJogo(indexVencedor, eventosAntes)` (Tarefa 1) e `icone(nome, tamanho)` (Tarefa 2).
- Produces: `golsJogadores: { [nome]: number }`, `golsPartida: { [nome]: number }`, `marcarGolJogador(indexTime: 0|1, indexJogador: number)`, `ordenarPorValor(mapa) → string[]` (chaves com valor > 0, do maior para o menor, empate em ordem alfabética), `renderListaJogadores(indexTime) → string`. A linha de jogador tem `class="jogador" data-chave="j:NOME"` e o selo `class="selo-gol" data-gols="n"`.

- [ ] **Passo 1: Escrever os testes (vão falhar)**

`tests/gols.test.js`:

```js
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

test('no modo 10min os gols não encerram a partida', () => {
  const app = carregarApp();
  montarPartida(app.run, { modo: '10min' });
  app.run('marcarGolJogador(0, 0); marcarGolJogador(0, 1); marcarGolJogador(0, 2)');
  assert.equal(app.pegar('golsA'), 3);
  assert.equal(app.pegar('vitoriasTimes[1]'), 0);
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
```

Em `tests/eventos.test.js`, troque o teste `'gol que fecha a partida (7e2) comemora GOL e depois VENCEU'` por:

```js
test('gol que fecha a partida (7e2) comemora GOL e depois VENCEU', () => {
  const app = carregarApp();
  montarPartida(app.run);
  const celebrados = espiarCelebracoes(app.run);
  app.run('golsA = 1; marcarGolJogador(0, 0)');
  assert.deepEqual(celebrados().map(e => e.tipo), ['gol', 'vitoria']);
  assert.deepEqual(app.pegar('ultimoEvento.eventos.map(e => e.tipo)'), ['gol', 'vitoria']);
  assert.deepEqual(app.alertas, []);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `node --test "tests/**/*.test.js"`
Expected: FAIL (`marcarGolJogador is not defined`, `ordenarPorValor is not defined`, sem "Artilheiro" no histórico).

- [ ] **Passo 3: Estado novo**

Logo depois de `let derrotasJogadores = {};   // derrotas por jogador`, adicione:

```js
    let golsJogadores = {};       // gols de cada jogador na pelada (artilharia)
    let golsPartida = {};         // gols de cada jogador na partida atual (zera a cada partida)
```

Em `coletarEstado()`, troque `        golsA, golsB, mensalistas,` por `        golsA, golsB, mensalistas, golsJogadores, golsPartida,`.

Em `aplicarEstado(estado)`, logo depois de `golsB = estado.golsB || 0;`, adicione:

```js
      golsJogadores = estado.golsJogadores || {};
      golsPartida = estado.golsPartida || {};
```

- [ ] **Passo 4: Marcar gol no jogador**

Substitua as funções `marcarGol`, `tirarGol` e `renderControleGols` (as três, inteiras) por:

```js
    // Gol marcado no jogador (só quem está em quadra: times[0] ou times[1]).
    // Para corrigir um gol errado, use o Desfazer.
    function marcarGolJogador(indexTime, indexJogador) {
      if (times.length < 2 || (indexTime !== 0 && indexTime !== 1)) return;
      const nome = times[indexTime].jogadores[indexJogador];
      if (!nome) return;
      snapshotEstado();
      if (indexTime === 0) golsA++; else golsB++;
      golsJogadores[nome] = (golsJogadores[nome] || 0) + 1;
      golsPartida[nome] = (golsPartida[nome] || 0) + 1;

      const evGol = { tipo: 'gol', titulo: 'GOL!', sub: `${nome} · ${nomeTime(times[indexTime].id)} · ${golsA} × ${golsB}`, cor: '#c6ff00' };

      // 2 gols encerra a partida automaticamente — SÓ no Modo A (7 min + 2 gols).
      if (modoJogo === '7e2' && (golsA >= GOLS_PARA_VENCER || golsB >= GOLS_PARA_VENCER)) {
        fimDeJogo(golsA >= GOLS_PARA_VENCER ? 0 : 1, [evGol]);
      } else {
        registrarEventos([evGol]);
        atualizarTela();
        salvarEstado();
      }
    }

    // Chaves de um mapa { chave: número } com valor > 0, do maior para o menor (empate: alfabética)
    function ordenarPorValor(mapa) {
      return Object.keys(mapa || {})
        .filter(k => mapa[k] > 0)
        .sort((a, b) => (mapa[b] - mapa[a]) || String(a).localeCompare(String(b)));
    }
```

Em `atualizarTela()`, apague as duas linhas:
```
            ${renderControleGols(0, golsA)}
```
```
            ${renderControleGols(1, golsB)}
```

- [ ] **Passo 5: Linha do jogador com ⚽, ✎ e ✕**

Substitua a função `renderListaJogadores` inteira por:

```js
    function renderListaJogadores(indexTime) {
      if (!times[indexTime]) return '';
      const emQuadra = times.length >= 2 && indexTime < 2;
      let html = '<ul class="jogadores">';
      times[indexTime].jogadores.forEach((jogador, indexJogador) => {
        const g = emQuadra ? (golsPartida[jogador] || 0) : 0;
        html += `
          <li class="jogador" data-chave="j:${jogador}">
            <span class="jogador-nome">${jogador}${g > 0 ? ` <span class="selo-gol" data-gols="${g}">⚽ ${g}</span>` : ''}</span>
            <span class="jogador-acoes">
              ${emQuadra ? `<button class="btn-icone btn-gol-jog" onclick="marcarGolJogador(${indexTime}, ${indexJogador})" aria-label="Gol de ${jogador}">⚽</button>` : ''}
              <button class="btn-icone" onclick="editarJogador(${indexTime}, ${indexJogador})" aria-label="Editar ${jogador}">${icone('pencil', 16)}</button>
              <button class="btn-icone btn-sair" onclick="removerJogador(${indexTime}, ${indexJogador})" aria-label="${jogador} foi embora">${icone('x', 16)}</button>
            </span>
          </li>`;
      });
      return html + '</ul>';
    }
```

No `<style>`, apague as duas linhas criadas no commit do botão Editar:
```css
    button.btn-editar { background: var(--info); color: #fff; width: auto; padding: 7px 12px; font-size: 0.8rem; border-radius: 9px; }
    .player-acoes { display: flex; gap: 6px; flex-shrink: 0; }
```
e, no lugar delas, adicione (estilo provisório até a Tarefa 4):
```css
    .jogadores { list-style: none; padding: 0; margin: 0; }
    .jogador { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 0.95rem; }
    .jogador:last-child { border-bottom: none; }
    .jogador-nome { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .jogador-acoes { display: flex; gap: 6px; flex-shrink: 0; }
    button.btn-icone { width: 34px; height: 34px; padding: 0; display: inline-grid; place-items: center; border-radius: 11px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); color: #cfd4db; font-size: 1rem; }
    button.btn-gol-jog { background: #c6ff00; border-color: #c6ff00; color: #000; }
    button.btn-sair { color: #ff4d4d; }
    .selo-gol { font-size: 0.72rem; font-weight: 700; color: #c6ff00; background: rgba(198,255,0,.12); border: 1px solid rgba(198,255,0,.3); padding: 2px 7px; border-radius: 999px; white-space: nowrap; }
```

- [ ] **Passo 6: Quando os gols zeram**

- Em `fimDeJogo`, troque `      golsA = 0; golsB = 0; // zera o placar para a próxima partida` por `      golsA = 0; golsB = 0; golsPartida = {}; // zera o placar para a próxima partida`.
- Em `resolverEmpate`, faça a mesma troca.
- Em `gerarSorteio`, logo depois de `      derrotasJogadores = {};`, adicione `      golsJogadores = {}; golsPartida = {};`.
- Em `novaPelada`, troque `      golsTime = {}; derrotasTimes = {}; derrotasJogadores = {}; coresTimes = {};` por `      golsTime = {}; derrotasTimes = {}; derrotasJogadores = {}; coresTimes = {}; golsJogadores = {}; golsPartida = {};`.

- [ ] **Passo 7: Editar leva os gols; histórico e relatório**

Em `editarJogador`, troque `      [vitoriasJogadores, derrotasJogadores].forEach(mapa => {` por `      [vitoriasJogadores, derrotasJogadores, golsJogadores, golsPartida].forEach(mapa => {`, e o comentário acima por `      // Vitórias/derrotas/gols: soma no nome novo e apaga o antigo`.

Em `arquivarPelada`, troque `        vitoriasTimes, vitoriasJogadores, golsTime, derrotasTimes, derrotasJogadores,` por `        vitoriasTimes, vitoriasJogadores, golsTime, derrotasTimes, derrotasJogadores, golsJogadores,`.

Em `renderItemHistorico`, logo depois de `      const tg = melhorChave(r.golsTime);`, adicione `      const ja = melhorChave(r.golsJogadores);`. Depois, logo antes da linha `<div class="ranking-item"><span>⚽ Time com mais gols</span>...`, adicione:
```html
          <div class="ranking-item"><span>⚽ Artilheiro</span><strong>${ja ? `${ja.chave} (${ja.valor} gols)` : '—'}</strong></div>
```

No HTML do Relatório, logo depois do bloco `<div class="stat-box">` que contém `id="topJogador"`, adicione:
```html
        <div class="stat-box">
          <div class="stat-title">⚽ Artilheiro da Pelada</div>
          <div class="stat-value" id="topArtilheiro">Sem gols ainda</div>
        </div>

        <div style="margin-top: 15px;">
          <h3 style="font-size:0.95rem; color:#aaa; margin-bottom:8px;">⚽ Artilharia:</h3>
          <ul class="ranking-list" id="rankingArtilhariaList"></ul>
        </div>
```

Em `atualizarRelatorioUI()`, logo antes de `      // ----- Gols por time -----`, adicione:
```js
      // ----- Artilharia (gols por jogador) -----
      const artilharia = ordenarPorValor(golsJogadores);
      document.getElementById('topArtilheiro').innerText = artilharia.length
        ? `${artilharia[0]} (${golsJogadores[artilharia[0]]} ${golsJogadores[artilharia[0]] === 1 ? 'gol' : 'gols'})`
        : 'Sem gols ainda';
      document.getElementById('rankingArtilhariaList').innerHTML = artilharia.map(n =>
        `<li class="ranking-item"><span>${n}</span><strong>${golsJogadores[n]} ${golsJogadores[n] === 1 ? 'gol' : 'gols'}</strong></li>`
      ).join('') || '<li style="color:#777;">Sem dados</li>';

```

- [ ] **Passo 8: Rodar os testes**

Run: `node --test "tests/**/*.test.js"`
Expected: PASS (todos).

- [ ] **Passo 9: Conferir no navegador (offline)**

Em `?offline`: sorteie e toque no ⚽ de um jogador. Confira que o placar sobe, o selo "⚽ 1" aparece e a comemoração diz "GOL! · NOME · Time X · 1 × 0". O ✎ renomeia e o ✕ remove. Quem está na fila não tem ⚽. O ↶/Desfazer volta o gol. No menu, o Relatório mostra "Artilheiro da Pelada" e "Artilharia".

- [ ] **Passo 10: Commit**

```bash
git add index.html tests/gols.test.js tests/eventos.test.js && git -c user.name="<autor>" -c user.email="<email>" commit -m "$(cat <<'EOF'
Gol marcado no jogador (⚽ ✎ ✕ na linha) + artilharia no relatório e no histórico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 4: Novo visual — CSS completo, HTML estático, tela principal, tela cheia, gaveta e modais

**Files:**
- Create: `tests/tela.test.js`
- Modify: `index.html` (`<head>` inteiro, `<body>` estático inteiro até `<script>`, e as funções JS listadas no Passo 5)

**Interfaces:**
- Consumes: `icone()`/`preencherIcones()` (Tarefa 2), `renderListaJogadores()` (Tarefa 3) e o overlay `#celebracao` (Tarefa 1).
- Produces:
  - Estrutura: `#timesJogando` com `.placar` (`#placarA`, `#placarB`) e um `.time[data-chave="t:ID"]` por time; `#listaFila` com `.time.fila-time[data-chave="t:ID"]`; `#botoesVitoria`; `#rotuloEncerrar`; `#filaQtd`; `#tcPlacar`; `#btnDesfazer` (classe `oculto` quando vazio) com `#desfazerQtd`; `.progresso > i` (usa `--p` de 0 a 1); `#statusTimer`; avisos `.aviso` (+ `.visivel`); `#bannerLotacaoTexto`.
  - Funções: `renderQuadradinho(id) → string`, `renderPlacar(timeA, timeB) → string`, `renderCartaoTime(i) → string`, `posicionarIndicadorAba()`, `ABAS` (mapa `aba → { botao, view, carregar }`).
  - Classes de abrir: `#menuModal.aberto` (gaveta), `.modal-fundo.aberto` (empate, níveis), `.aba.ativa`, `.aba-conteudo.ativa`.
  - `CORES[x] = { nome, dot }`. `getTeamClass` e `getBtnColorStyle` deixam de existir.

- [ ] **Passo 1: Escrever os testes (vão falhar)**

`tests/tela.test.js`:

```js
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
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `node --test "tests/**/*.test.js"`
Expected: FAIL em `tela.test.js` (sem `class="placar"`, `getTeamClass` ainda existe, `classList` de `menuModal` não muda).

- [ ] **Passo 3: Substituir o `<head>` inteiro**

Troque tudo de `<head>` até `</head>` (inclusive) por:

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#000000">
  <title>Futebol de Segunda da Sal CMA</title>

  <!-- Fonte: Space Grotesk -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">

  <!-- Supabase: sincronização dos dados na nuvem (todos veem a mesma pelada) -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

  <style>
    /* ===================== TOKENS ===================== */
    :root {
      --bg: #000; --s1: #0d0d0d; --s2: #161616; --s3: #1f1f1f;
      --ln: #222; --ln2: #2e2e2e;
      --tx: #f5f5f5; --mu: #8a8a8a; --di: #525252;
      --ac: #c6ff00; --ac-tinta: #000; --ac-suave: rgba(198,255,0,.12); --ac-borda: rgba(198,255,0,.3);
      --dg: #ff4d4d; --wr: #ffb020;
      --r-card: 20px; --r-pill: 999px; --r-ico: 11px;
      --fonte: 'Space Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      --t-rapido: 160ms; --t-medio: 320ms;
      --mola: cubic-bezier(.2,.8,.2,1.15); --suave: cubic-bezier(.2,.8,.2,1);
    }

    /* ===================== BASE ===================== */
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html { background: var(--bg); }
    body { font-family: var(--fonte); background: var(--bg); color: var(--tx); margin: 0; padding: 14px 14px 48px; -webkit-font-smoothing: antialiased; }
    #mainContainer { max-width: 560px; margin: 0 auto; }
    h2, h3 { margin: 0; }
    .ico { display: inline-block; vertical-align: middle; }
    [data-icone] { display: inline-flex; }
    .oculto { visibility: hidden; }
    .texto-mu { color: var(--mu); font-size: 0.82rem; margin: 0 0 12px; line-height: 1.45; }
    .vazio { color: var(--di); font-size: 0.85rem; text-align: center; margin: 8px 0; list-style: none; }

    /* ===================== BOTÕES ===================== */
    button {
      font-family: inherit; font-size: 0.9rem; font-weight: 700; color: var(--tx);
      background: var(--s2); border: 1px solid var(--ln); border-radius: var(--r-pill);
      padding: 12px 16px; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      transition: transform var(--t-rapido) var(--mola), background var(--t-rapido), border-color var(--t-rapido), color var(--t-rapido);
    }
    button:active { transform: scale(.96); }
    .btn-primario { background: var(--ac); border-color: var(--ac); color: var(--ac-tinta); }
    .btn-perigo { background: transparent; border-color: rgba(255,77,77,.4); color: var(--dg); }
    .btn-bloco { width: 100%; }
    .btn-whats { background: #25D366; border-color: #25D366; color: #04210f; }
    .btn-icone { width: 34px; height: 34px; padding: 0; border-radius: var(--r-ico); background: transparent; color: var(--mu); font-size: 1rem; flex-shrink: 0; }
    .btn-icone.grande { width: 40px; height: 40px; border-radius: 13px; color: var(--tx); }
    .btn-gol-jog { background: var(--ac); border-color: var(--ac); color: #000; }
    .btn-sair { color: var(--dg); }

    /* ===================== TOPO ===================== */
    .topo { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .marca { text-align: center; font-size: 0.62rem; letter-spacing: .2em; text-transform: uppercase; color: var(--mu); line-height: 1.5; user-select: none; -webkit-user-select: none; cursor: default; }
    .marca b { display: block; color: var(--tx); font-size: 0.85rem; letter-spacing: .06em; }
    .desfazer { position: relative; }
    .desfazer-qtd { position: absolute; top: -5px; right: -5px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: var(--r-pill); background: var(--ac); color: #000; font-size: 0.62rem; display: grid; place-items: center; }
    .sync-badge { text-align: center; font-size: 0.68rem; color: var(--mu); margin: 10px 0 4px; }
    .sync-badge .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--di); margin-right: 6px; vertical-align: middle; }
    .sync-badge.ok .dot { background: var(--ac); box-shadow: 0 0 8px var(--ac); }
    .sync-badge.erro .dot { background: var(--dg); }

    /* ===================== SEÇÕES ===================== */
    .rotulo { display: flex; justify-content: space-between; align-items: center; font-size: 0.64rem; letter-spacing: .18em; text-transform: uppercase; color: var(--mu); margin: 22px 0 8px; }
    .rotulo b { color: var(--ac); font-weight: 700; }
    .card { background: var(--s1); border: 1px solid var(--ln); border-radius: var(--r-card); padding: 16px; margin-top: 12px; }
    .card-titulo { font-size: 1rem; font-weight: 700; margin: 0 0 4px; }

    /* ===================== CAMPOS ===================== */
    textarea, input[type="text"] {
      width: 100%; font-family: inherit; font-size: 16px; color: var(--tx); background: var(--s2);
      border: 1px solid var(--ln); border-radius: 16px; padding: 13px 16px; outline: none;
      transition: border-color var(--t-rapido), box-shadow var(--t-rapido);
    }
    input[type="text"] { border-radius: var(--r-pill); }
    textarea { height: 120px; resize: vertical; margin-bottom: 12px; }
    textarea:focus, input[type="text"]:focus { border-color: var(--ac); box-shadow: 0 0 0 3px var(--ac-suave); }
    ::placeholder { color: var(--di); }
    .linha-add { display: flex; gap: 8px; }
    .linha-add input { flex: 1; min-width: 0; }
    .linha-add button { white-space: nowrap; }

    /* ===================== CRONÔMETRO ===================== */
    .timer-display { font-size: clamp(64px, 21vw, 96px); font-weight: 700; letter-spacing: -.05em; line-height: .95; font-variant-numeric: tabular-nums; transform-origin: left center; transition: color var(--t-medio); }
    .timer-display.baixo { color: var(--dg); animation: pulsar 1s ease-in-out infinite; }
    .progresso { height: 3px; background: var(--ln); border-radius: 2px; margin-top: 12px; overflow: hidden; }
    .progresso i { display: block; height: 100%; background: var(--ac); border-radius: 2px; transform-origin: left; transform: scaleX(var(--p, 1)); transition: transform 1s linear, background var(--t-medio); }
    .progresso.baixo i { background: var(--dg); }
    .timer-botoes { display: flex; gap: 6px; margin-top: 14px; }
    .timer-botoes button { flex: 1; padding: 12px 6px; font-size: 0.8rem; }
    .btn-parar-sirene { display: none; width: 100%; margin-top: 10px; background: var(--dg); border-color: var(--dg); color: #fff; }
    .segmentado { display: flex; gap: 3px; margin-top: 10px; border: 1px solid var(--ln); border-radius: var(--r-pill); padding: 3px; }
    .segmentado button { flex: 1; border: none; background: transparent; color: var(--mu); padding: 8px 4px; font-size: 0.74rem; }
    .segmentado button.ativo { background: var(--s3); color: var(--tx); }
    .modo-legenda { font-size: 0.68rem; color: var(--di); text-align: center; margin-top: 8px; }
    @keyframes pulsar { 50% { transform: scale(1.04); } }

    /* ===================== PLACAR ===================== */
    .placar { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--ln); }
    .placar-time { font-size: 0.68rem; color: var(--mu); text-transform: uppercase; letter-spacing: .12em; display: flex; align-items: center; gap: 6px; }
    .placar-lado:last-child .placar-time { justify-content: flex-end; }
    .placar-num { font-size: 52px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; display: inline-block; }
    .placar-x { color: var(--di); padding-bottom: 10px; }
    .quadradinho { display: inline-block; width: 8px; height: 8px; border-radius: 2px; background: var(--c, var(--mu)); flex-shrink: 0; }

    /* ===================== TIMES ===================== */
    .time { position: relative; overflow: hidden; margin-top: 12px; padding: 14px 14px 10px 17px; background: var(--s1); border: 1px solid var(--ln); border-radius: var(--r-card); }
    .time::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--c, var(--mu)); }
    .fila-time { padding: 12px 12px 8px 15px; }
    .time-topo { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .time-nome { font-size: 1rem; font-weight: 700; }
    .fila-time .time-nome { font-size: 0.9rem; }
    .time-nome small { color: var(--mu); font-size: 0.72rem; font-weight: 500; margin-left: 6px; }
    .selo { font-size: 0.64rem; font-weight: 700; padding: 3px 9px; border-radius: var(--r-pill); background: var(--s2); color: var(--mu); white-space: nowrap; }
    .selo.alerta { background: var(--wr); color: #000; }
    .cores { display: flex; gap: 7px; margin-top: 10px; }
    .cor-bolinha { width: 18px; height: 18px; padding: 0; border-radius: 50%; border: 2px solid transparent; background: var(--c); }
    .cor-bolinha.ativa { border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,.15); }
    .jogadores { list-style: none; margin: 8px 0 0; padding: 0; }
    .jogador { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 9px 0; border-bottom: 1px solid var(--ln); font-size: 0.9rem; }
    .jogador:last-child { border-bottom: none; }
    .jogador-nome { display: flex; align-items: center; gap: 8px; min-width: 0; overflow-wrap: anywhere; }
    .jogador-acoes { display: flex; gap: 6px; flex-shrink: 0; }
    .selo-gol { font-size: 0.68rem; font-weight: 700; color: var(--ac); background: var(--ac-suave); border: 1px solid var(--ac-borda); padding: 2px 7px; border-radius: var(--r-pill); white-space: nowrap; display: inline-block; }
    .aguardando { text-align: center; color: var(--mu); font-size: 0.85rem; margin: 14px 0 0; }
    .encerrar { display: grid; grid-template-columns: 1fr auto 1fr; gap: 6px; }
    .encerrar button { padding: 12px 6px; font-size: 0.74rem; }

    /* ===================== AVISOS ===================== */
    .aviso { display: none; align-items: center; gap: 8px; margin-top: 12px; padding: 11px 14px; border-radius: 16px; font-size: 0.8rem; font-weight: 700; background: var(--wr); color: #000; }
    .aviso.info { background: var(--s2); color: var(--tx); border: 1px solid var(--ln); }
    .aviso.visivel { display: flex; animation: descer var(--t-medio) var(--mola) both; }
    @keyframes descer { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }

    /* ===================== GAVETA (MENU) ===================== */
    .sheet-fundo { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,.6); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); opacity: 0; visibility: hidden; transition: opacity var(--t-medio) ease, visibility 0s linear var(--t-medio); }
    .sheet-fundo.aberto { opacity: 1; visibility: visible; transition: opacity var(--t-medio) ease; }
    .sheet { position: absolute; left: 0; right: 0; bottom: 0; max-width: 560px; margin: 0 auto; max-height: 92vh; overflow-y: auto; background: var(--s1); border: 1px solid var(--ln2); border-bottom: none; border-radius: 26px 26px 0 0; padding: 10px 16px 32px; transform: translateY(100%); transition: transform 420ms var(--mola); }
    .sheet-fundo.aberto .sheet { transform: none; }
    .sheet-alca { width: 40px; height: 4px; border-radius: 2px; background: var(--ln2); margin: 0 auto 12px; }
    .sheet-topo { display: flex; justify-content: space-between; align-items: center; }
    .sheet-topo h2 { font-size: 1.35rem; letter-spacing: -.02em; }
    .abas { position: relative; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin: 14px 0 16px; padding: 2px 0; }
    .abas::-webkit-scrollbar { display: none; }
    .aba { position: relative; z-index: 1; flex-shrink: 0; padding: 8px 14px; font-size: 0.76rem; background: transparent; color: var(--mu); transition: color var(--t-medio); }
    .aba.ativa { color: #000; border-color: transparent; }
    .aba-indicador { position: absolute; z-index: 0; top: 2px; left: 0; height: calc(100% - 4px); width: 0; border-radius: var(--r-pill); background: var(--tx); transition: transform var(--t-medio) var(--mola), width var(--t-medio) var(--mola); }
    .aba-conteudo { display: none; }
    .aba-conteudo.ativa { display: block; animation: fadeIn var(--t-medio) ease both; }

    /* ===================== MODAIS (empate, níveis) ===================== */
    .modal-fundo { position: fixed; inset: 0; z-index: 10001; background: rgba(0,0,0,.65); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); padding: 16px; overflow-y: auto; display: none; }
    .modal-fundo.aberto { display: block; animation: fadeIn var(--t-medio) ease both; }
    .modal { max-width: 520px; margin: 40px auto; background: var(--s1); border: 1px solid var(--ln2); border-radius: 24px; padding: 18px; }
    .modal-fundo.aberto .modal { animation: crescer var(--t-medio) var(--mola) both; }
    .modal-topo { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .modal-topo h2 { font-size: 1.2rem; letter-spacing: -.02em; }
    .empate-botoes { display: flex; flex-direction: column; gap: 8px; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes crescer { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: none; } }

    /* ===================== RELATÓRIO / HISTÓRICO ===================== */
    .stat { background: var(--s2); border: 1px solid var(--ln); border-radius: var(--r-card); padding: 14px; margin-top: 10px; }
    .stat small { display: block; font-size: 0.62rem; color: var(--mu); letter-spacing: .16em; text-transform: uppercase; }
    .stat-valor { font-size: 1.4rem; font-weight: 700; letter-spacing: -.02em; margin-top: 6px; }
    .stat-valor em { font-style: normal; color: var(--ac); }
    .ranking { list-style: none; margin: 0; padding: 0; }
    .ranking-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--ln); font-size: 0.88rem; }
    .ranking-item:last-child { border-bottom: none; }
    .ranking-nome { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 48%; }
    .ranking-barra { flex: 1; height: 4px; background: var(--ln); border-radius: 2px; overflow: hidden; }
    .ranking-barra i { display: block; height: 100%; background: var(--ac); border-radius: 2px; }
    .ranking-barra.perigo i { background: var(--dg); }
    .ranking-valor { font-weight: 700; font-variant-numeric: tabular-nums; min-width: 2ch; text-align: right; }
    .hist { background: var(--s2); border: 1px solid var(--ln); border-radius: var(--r-card); padding: 14px; margin-bottom: 10px; }
    .hist-data { font-size: 0.7rem; letter-spacing: .14em; text-transform: uppercase; color: var(--ac); font-weight: 700; margin-bottom: 4px; }

    /* ===================== PAGANTES / COBRANÇA ===================== */
    .mensalistas { padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid var(--ln); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 5px 6px 5px 12px; font-size: 0.8rem; border: 1px solid var(--ln); border-radius: var(--r-pill); background: var(--s2); }
    .chip button { width: 22px; height: 22px; padding: 0; border: none; background: transparent; color: var(--dg); }
    .pagante { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--ln); font-size: 0.9rem; }
    .pagante:last-child { border-bottom: none; }
    .pagante-nome.devendo { color: var(--dg); }
    .pagante-acoes { display: flex; align-items: center; gap: 6px; }
    .toggle-pago { position: relative; display: inline-flex; border: 1px solid var(--ln); border-radius: var(--r-pill); padding: 2px; }
    .toggle-pago button { position: relative; z-index: 1; flex: 1; min-width: 52px; border: none; background: transparent; padding: 6px 10px; font-size: 0.7rem; color: var(--di); transition: color var(--t-medio); }
    .toggle-pago::before { content: ''; position: absolute; z-index: 0; top: 2px; bottom: 2px; left: 2px; width: calc(50% - 2px); border-radius: var(--r-pill); background: var(--ac); transition: transform var(--t-medio) var(--mola), background var(--t-medio); }
    .toggle-pago.devendo::before { transform: translateX(100%); background: var(--dg); }
    .toggle-pago.pago .op-pago { color: #000; }
    .toggle-pago.devendo .op-deve { color: #fff; }
    .tabela-wrap { overflow-x: auto; margin-top: 8px; }
    .cobranca-tabela { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    .cobranca-tabela th { color: var(--mu); font-weight: 700; font-size: 0.62rem; text-transform: uppercase; letter-spacing: .08em; padding: 6px 8px; text-align: center; border-bottom: 1px solid var(--ln); white-space: nowrap; }
    .cobranca-tabela th:first-child { text-align: left; }
    .cob-nome { padding: 8px; white-space: nowrap; border-bottom: 1px solid var(--ln); }
    .cob-cel { padding: 6px 8px; text-align: center; border-bottom: 1px solid var(--ln); }
    .cob-btn { padding: 4px 10px; font-size: 0.66rem; }
    .cob-btn.pago { background: var(--ac); border-color: var(--ac); color: #000; }
    .cob-btn.devendo { background: transparent; border-color: rgba(255,77,77,.5); color: var(--dg); }

    /* ===================== PIX ===================== */
    .pix { text-align: center; }
    .pix-qr { width: 220px; height: 220px; object-fit: contain; display: block; margin: 14px auto; padding: 10px; background: #fff; border-radius: 20px; }
    .pix-info { text-align: left; background: var(--s2); border: 1px solid var(--ln); border-radius: var(--r-card); padding: 14px; margin-top: 12px; }
    .pix-linha + .pix-linha { margin-top: 10px; }
    .pix-rotulo { font-size: 0.62rem; color: var(--mu); text-transform: uppercase; letter-spacing: .14em; }
    .pix-valor { font-weight: 700; margin-top: 2px; }

    /* ===================== NÍVEIS ===================== */
    .nivel-item { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--ln); }
    .nivel-item:last-child { border-bottom: none; }
    .nivel-nome { font-size: 0.9rem; }
    .nivel-badge { color: var(--ac); font-size: 0.72rem; font-weight: 700; margin-left: 4px; }
    .nivel-estrelas { display: flex; }
    .estrela-btn { padding: 2px 3px; border: none; background: transparent; font-size: 1.3rem; line-height: 1; color: var(--ln2); }
    .estrela-btn.on { color: var(--ac); }
    .estrela-btn.pop { animation: pop 380ms var(--mola); }
    .niveis-linha { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
    .ctrl-label { font-size: 0.62rem; color: var(--mu); text-transform: uppercase; letter-spacing: .12em; margin-right: 2px; }
    .ord-btn, .filtro-chip { padding: 5px 12px; font-size: 0.72rem; color: var(--mu); background: transparent; }
    .ord-btn.ativo, .filtro-chip.ativo { background: var(--tx); border-color: var(--tx); color: #000; }
    @keyframes pop { 0% { transform: scale(1); } 40% { transform: scale(1.35); } 100% { transform: scale(1); } }

    /* ===================== TELA CHEIA ===================== */
    #fullscreenTimer { display: none; position: fixed; inset: 0; z-index: 9999; background: #000; flex-direction: column; justify-content: space-between; align-items: center; padding: 28px 18px; text-align: center; }
    .tc-topo { width: 100%; max-width: 560px; margin: 0; }
    .tc-meio { width: 100%; }
    .tc-display { font-size: 28vw; font-weight: 700; letter-spacing: -.06em; line-height: 1; color: var(--ac); font-variant-numeric: tabular-nums; transition: color var(--t-medio); }
    .tc-display.baixo { color: var(--dg); animation: pulsar 1s ease-in-out infinite; }
    @media (orientation: landscape) { .tc-display { font-size: 42vh; } }
    .tc-meio .progresso { max-width: 420px; margin: 18px auto 0; }
    .tc-botoes { display: flex; gap: 8px; width: 100%; max-width: 460px; }
    .tc-botoes button { flex: 1; }

    /* ===== Comemoração em tela cheia ===== */
    .celebracao {
      position: fixed; inset: 0; z-index: 20000; display: none;
      background: var(--cel-cor, #c6ff00); color: var(--cel-tinta, #000);
      align-items: center; justify-content: center; text-align: center; overflow: hidden;
      cursor: pointer; user-select: none; -webkit-user-select: none;
    }
    .celebracao.ativa { display: flex; animation: celRevelar 1.6s cubic-bezier(.7,0,.2,1) both; }
    .cel-conteudo { padding: 24px; position: relative; z-index: 1; }
    .cel-titulo {
      font-family: var(--fonte); font-weight: 700;
      font-size: clamp(64px, 22vw, 160px); line-height: .9; letter-spacing: -0.06em;
      animation: celTitulo 1.6s cubic-bezier(.2,.8,.2,1.15) both;
    }
    .cel-vitoria .cel-titulo { font-size: clamp(44px, 14vw, 110px); }
    .cel-sub {
      margin-top: 14px; font-family: var(--fonte); font-weight: 700;
      font-size: 0.95rem; letter-spacing: .16em; text-transform: uppercase;
      animation: celSub 1.6s ease both;
    }
    .cel-particulas { position: absolute; left: 50%; top: 50%; }
    .cel-particulas i {
      position: absolute; width: 10px; height: 10px; border-radius: 3px; background: currentColor;
      animation: celParticula 1.6s cubic-bezier(.2,.8,.2,1) both;
    }
    @keyframes celRevelar {
      0%   { clip-path: circle(0% at var(--cel-origem, 50% 50%)); opacity: 1; }
      24%  { clip-path: circle(150% at var(--cel-origem, 50% 50%)); }
      85%  { opacity: 1; }
      100% { clip-path: circle(150% at var(--cel-origem, 50% 50%)); opacity: 0; }
    }
    @keyframes celTitulo {
      0%, 12%   { transform: scale(.4) rotate(-8deg); opacity: 0; }
      30%       { transform: scale(1.1) rotate(-3deg); opacity: 1; }
      40%, 78%  { transform: scale(1) rotate(-3deg); opacity: 1; }
      92%, 100% { transform: scale(1) rotate(-3deg); opacity: 0; }
    }
    @keyframes celSub { 0%, 25% { opacity: 0; transform: translateY(10px); } 40%, 78% { opacity: 1; transform: none; } 92%, 100% { opacity: 0; } }
    @keyframes celParticula {
      0%, 18% { opacity: 0; transform: translate(0, 0) rotate(0); }
      26%     { opacity: 1; }
      75%     { opacity: 1; transform: translate(var(--x), var(--y)) rotate(var(--r)); }
      100%    { opacity: 0; transform: translate(var(--x), var(--y)) rotate(var(--r)); }
    }
    .cel-empate .cel-titulo { animation-name: celTituloSuave; }
    @keyframes celTituloSuave { 0%, 15% { opacity: 0; transform: scale(.9); } 35%, 78% { opacity: 1; transform: none; } 95%, 100% { opacity: 0; } }
    #mainContainer.tremendo { animation: tremer .45s cubic-bezier(.36,.07,.19,.97) .3s both; }
    @keyframes tremer {
      15% { transform: translateX(-6px) rotate(-1deg); } 30% { transform: translateX(6px) rotate(1deg); }
      45% { transform: translateX(-4px); } 60% { transform: translateX(3px); } 75% { transform: translateX(-1px); } 100% { transform: none; }
    }
    .celebracao.reduzido, .celebracao.reduzido .cel-titulo, .celebracao.reduzido .cel-sub { animation: celFade 1.2s ease both; }
    @keyframes celFade { 0% { opacity: 0; } 15%, 80% { opacity: 1; } 100% { opacity: 0; } }

    /* ===================== MOVIMENTO REDUZIDO ===================== */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; scroll-behavior: auto !important; }
      .celebracao.ativa, .celebracao.ativa .cel-titulo, .celebracao.ativa .cel-sub { animation: celFade 1.2s ease both !important; }
      .cel-particulas { display: none; }
      #mainContainer.tremendo { animation: none !important; }
    }
  </style>
</head>
```

- [ ] **Passo 4: Substituir o HTML estático do `<body>`**

Troque tudo entre `<body>` e a linha `  <script>` (o `<script>` inline, não os de CDN) por:

```html
<body>

  <!-- Painel (gaveta que sobe de baixo): Pagantes, Relatório, Histórico, Cobrança, Pix -->
  <div class="sheet-fundo" id="menuModal" onclick="if (event.target === this) fecharMenu()">
    <div class="sheet" role="dialog" aria-label="Painel do gerenciador">
      <div class="sheet-alca"></div>
      <div class="sheet-topo">
        <h2>Painel</h2>
        <button class="btn-icone grande" onclick="fecharMenu()" aria-label="Fechar"><span data-icone="x"></span></button>
      </div>

      <div class="abas" id="abas">
        <span class="aba-indicador" id="abaIndicador"></span>
        <button class="aba ativa" id="tabPagantesBtn" onclick="mudarAba('pagantes')">Pagantes</button>
        <button class="aba" id="tabRelatorioBtn" onclick="mudarAba('relatorio')">Relatório</button>
        <button class="aba" id="tabHistoricoBtn" onclick="mudarAba('historico')">Histórico</button>
        <button class="aba" id="tabCobrancaBtn" onclick="mudarAba('cobranca')">Cobrança</button>
        <button class="aba" id="tabPixBtn" onclick="mudarAba('pix')">Pix</button>
      </div>

      <!-- Pagantes -->
      <div class="aba-conteudo ativa" id="abaPagantesView">
        <div class="mensalistas">
          <div class="rotulo" style="margin-top:0">Mensalistas · já entram como pago</div>
          <div class="linha-add">
            <input type="text" id="inputMensalista" placeholder="Nome do mensalista..." />
            <button class="btn-primario" onclick="adicionarMensalista()">Add</button>
          </div>
          <div id="listaMensalistas" class="chips"></div>
        </div>
        <button id="btnCobrar" class="btn-whats btn-bloco" onclick="cobrarDevedores()">Cobrar quem falta pagar</button>
        <div id="listaPagantes" style="margin-top:8px;"></div>
      </div>

      <!-- Relatório -->
      <div class="aba-conteudo" id="abaRelatorioView">
        <div class="stat"><small>Time com mais vitórias</small><div class="stat-valor" id="topTime">—</div></div>
        <div class="stat"><small>Jogador mais vitorioso</small><div class="stat-valor" id="topJogador">—</div></div>
        <div class="stat"><small>Artilheiro da pelada</small><div class="stat-valor" id="topArtilheiro">—</div></div>
        <div class="rotulo">Artilharia</div><ul class="ranking" id="rankingArtilhariaList"></ul>
        <div class="rotulo">Vitórias por time</div><ul class="ranking" id="rankingTimesList"></ul>
        <div class="rotulo">Vitórias por jogador</div><ul class="ranking" id="rankingJogadoresList"></ul>
        <div class="stat"><small>Time que mais fez gols</small><div class="stat-valor" id="topGolsTime">—</div></div>
        <div class="rotulo">Gols por time</div><ul class="ranking" id="rankingGolsList"></ul>
        <div class="rotulo">Derrotas por time</div><ul class="ranking" id="rankingDerrotasTimesList"></ul>
        <div class="rotulo">Jogadores que mais perderam</div><ul class="ranking" id="rankingDerrotasJogadoresList"></ul>
      </div>

      <!-- Histórico -->
      <div class="aba-conteudo" id="abaHistoricoView">
        <p class="texto-mu">Cada pelada é arquivada aqui quando você inicia uma nova.</p>
        <div id="listaHistorico"><p class="vazio">Abra esta aba para carregar...</p></div>
      </div>

      <!-- Cobrança -->
      <div class="aba-conteudo" id="abaCobrancaView">
        <p class="texto-mu">Pagamentos das últimas 3 peladas (atual + 2 anteriores). Toque em Pago/Deve para alternar.</p>
        <div id="conteudoCobranca"><p class="vazio">Abra esta aba para carregar...</p></div>
      </div>

      <!-- Pix -->
      <div class="aba-conteudo pix" id="abaPixView">
        <h3 class="card-titulo">Pagamento da pelada</h3>
        <p class="texto-mu">Escaneie o QR Code abaixo para pagar via Pix:</p>
        <img class="pix-qr" id="imgQrCodePix" src="qrcode.jpeg" alt="QR Code Pix Mercado Pago" />
        <div class="pix-info">
          <div class="pix-linha"><div class="pix-rotulo">Beneficiário</div><div class="pix-valor">Felipe Viana Feu</div></div>
          <div class="pix-linha"><div class="pix-rotulo">Instituição</div><div class="pix-valor">Mercado Pago</div></div>
          <div class="pix-linha"><div class="pix-rotulo">Chave Pix (telefone)</div><div class="pix-valor">62992980612</div></div>
        </div>
        <button class="btn-primario btn-bloco" style="margin-top:14px;" onclick="copiarChavePix()"><span data-icone="copy" data-tam="16"></span>Copiar chave Pix</button>
      </div>
    </div>
  </div>

  <!-- Empate: admin escolhe quem joga primeiro (par ou ímpar) -->
  <div class="modal-fundo" id="empateModal">
    <div class="modal" style="max-width:420px;">
      <div class="modal-topo"><h2>Empate</h2></div>
      <p class="texto-mu">Tirem par ou ímpar na quadra. Quem ganhou vai <strong style="color:var(--tx)">na frente</strong> (joga primeiro):</p>
      <div id="empateBotoes" class="empate-botoes"></div>
    </div>
  </div>

  <!-- Níveis (secreto: 5 toques na marca do topo) -->
  <div class="modal-fundo" id="niveisModal">
    <div class="modal">
      <div class="modal-topo">
        <h2>Níveis</h2>
        <button class="btn-icone grande" onclick="fecharNiveis()" aria-label="Fechar"><span data-icone="x"></span></button>
      </div>
      <p class="texto-mu">Defina o nível de cada jogador (1 a 5 ★). O sorteio usa isso para <strong style="color:var(--tx)">equilibrar</strong> os times (craques separados, fracos com fortes). Sem nota = 3★. Esta tela é secreta.</p>
      <div class="linha-add">
        <input type="text" id="inputNivelNome" placeholder="Adicionar jogador para avaliar..." />
        <button class="btn-primario" onclick="adicionarJogadorNivel()">Add</button>
      </div>
      <div id="niveisControles" style="margin-top:14px;"></div>
      <div id="listaNiveis" style="margin-top:6px;"></div>
    </div>
  </div>

  <!-- Comemoração em tela cheia (gol / vitória / empate). Um toque pula. -->
  <div id="celebracao" class="celebracao" aria-live="assertive" onclick="pularCelebracao()">
    <div class="cel-conteudo">
      <div class="cel-titulo" id="celTitulo"></div>
      <div class="cel-sub" id="celSub"></div>
    </div>
    <div class="cel-particulas" id="celParticulas"></div>
  </div>

  <!-- Tela cheia do cronômetro -->
  <div id="fullscreenTimer">
    <div class="tc-topo rotulo"><span id="tcPlacar">Partida em andamento</span><b>● ao vivo</b></div>
    <div class="tc-meio">
      <div class="tc-display" id="fullscreenDisplay">07:00</div>
      <div class="progresso"><i></i></div>
    </div>
    <div class="tc-botoes">
      <button class="btn-primario" id="btnFsPause" onclick="toggleTimer()"></button>
      <button onclick="fecharTelaCheia()"><span data-icone="minimize" data-tam="16"></span>Sair</button>
    </div>
  </div>

  <div id="mainContainer">
    <header class="topo">
      <button class="btn-icone grande" onclick="abrirMenu()" aria-label="Abrir painel"><span data-icone="menu"></span></button>
      <div class="marca" onclick="tentarAbrirNiveis()">Sal CMA<b>Futebol de Segunda</b></div>
      <button id="btnDesfazer" class="btn-icone grande desfazer oculto" onclick="desfazer()" aria-label="Desfazer última ação">
        <span data-icone="undo"></span><span class="desfazer-qtd" id="desfazerQtd">0</span>
      </button>
    </header>

    <!-- Indicador de sincronização com a nuvem -->
    <div class="sync-badge" id="syncBadge"><span class="dot"></span><span id="syncTexto">Conectando à nuvem...</span></div>

    <!-- Áudio: Sirene -->
    <audio id="audioSirene" loop preload="auto">
      <source src="https://www.myinstants.com/media/sounds/sirene-1.mp3" type="audio/mpeg">
    </audio>

    <!-- Cronômetro -->
    <section id="timerArea" style="display:none;">
      <div class="rotulo">Tempo de jogo <b id="statusTimer"></b></div>
      <div class="timer-display" id="timerDisplay">07:00</div>
      <div class="progresso"><i></i></div>
      <div class="timer-botoes">
        <button class="btn-primario" id="btnStartPause" onclick="toggleTimer()"></button>
        <button onclick="resetTimer()"><span data-icone="rotate-ccw" data-tam="16"></span>Reiniciar</button>
        <button onclick="abrirTelaCheia()"><span data-icone="maximize" data-tam="16"></span>Tela cheia</button>
      </div>
      <div id="seletorModo" class="segmentado"></div>
      <div id="modoLegenda" class="modo-legenda"></div>
      <button class="btn-parar-sirene" id="btnStopAlarm" onclick="pararAlarme()"><span data-icone="bell-off" data-tam="16"></span> Parar sirene</button>
    </section>

    <!-- Cadastro inicial -->
    <section class="card" id="setup">
      <h2 class="card-titulo">Cadastrar jogadores</h2>
      <p class="texto-mu">Cole os nomes dos que já chegaram, um por linha.</p>
      <textarea id="inputNomes" placeholder="JOÃO&#10;PEDRO&#10;LUCAS..."></textarea>
      <button class="btn-primario btn-bloco" onclick="gerarSorteio()"><span data-icone="shuffle" data-tam="16"></span>Sortear times (4 por time)</button>
    </section>

    <!-- Avisos -->
    <div class="aviso" id="bannerAlerta3Jogo"><span data-icone="alert-triangle" data-tam="16"></span>Partida decisiva: o time com 2 vitórias sai nesta partida.</div>
    <div class="aviso info" id="bannerLotacao"><span data-icone="alert-triangle" data-tam="16"></span><span id="bannerLotacaoTexto">Limite de 20 atletas atingido (5 times).</span></div>

    <!-- Partida atual -->
    <section id="gameArea" style="display:none;">
      <div id="timesJogando"></div>
      <div class="rotulo" id="rotuloEncerrar">Encerrar no tempo</div>
      <div class="encerrar" id="botoesVitoria"></div>
    </section>

    <!-- Fila -->
    <section id="queueArea" style="display:none;">
      <div class="rotulo">Fila <b id="filaQtd"></b></div>
      <div id="listaFila"></div>
    </section>

    <!-- Chegou mais um jogador / nova pelada -->
    <section id="addPlayerArea" style="display:none;">
      <div class="rotulo">Chegou mais um?</div>
      <div class="linha-add">
        <input type="text" id="novoJogadorNome" placeholder="Nome do jogador..." />
        <button class="btn-primario" onclick="adicionarNovoJogador()">Adicionar</button>
      </div>
      <button class="btn-perigo btn-bloco" style="margin-top:22px;" onclick="novaPelada()">Nova pelada (apagar tudo)</button>
    </section>
  </div>

```

- [ ] **Passo 5: Funções da tela principal, tela cheia, gaveta e modais**

5a. Substitua o objeto `CORES` inteiro por:

```js
    const CORES = {
      azul:     { nome: 'Azul',     dot: '#3b82f6' },
      laranja:  { nome: 'Laranja',  dot: '#f97316' },
      verde:    { nome: 'Verde',    dot: '#22c55e' },
      vermelho: { nome: 'Vermelho', dot: '#ef4444' },
      cinza:    { nome: 'Cinza',    dot: '#9ca3af' }
    };
```

5b. Apague as funções `getTeamClass` e `getBtnColorStyle` inteiras.

5c. Substitua `renderBadgePartidas` e `renderSeletorCor` inteiras por:

```js
    function renderBadgePartidas(qtd) {
      if (qtd === 2) return `<span class="selo alerta">3º jogo · último</span>`;
      return `<span class="selo">${qtd}/3 jogos</span>`;
    }

    // Bolinhas de cor que o admin toca para escolher a cor do time
    function renderSeletorCor(id) {
      const atual = corDoTime(id);
      return `<div class="cores">${ORDEM_CORES.map(c =>
        `<button class="cor-bolinha${c === atual ? ' ativa' : ''}" style="--c:${CORES[c].dot}" title="${CORES[c].nome}" aria-label="Cor ${CORES[c].nome}" onclick="definirCorTime(${id}, '${c}')"></button>`
      ).join('')}</div>`;
    }

    function renderQuadradinho(id) {
      return `<span class="quadradinho" style="--c:${CORES[corDoTime(id)].dot}"></span>`;
    }

    function renderPlacar(timeA, timeB) {
      return `
        <div class="placar">
          <div class="placar-lado">
            <div class="placar-time">${renderQuadradinho(timeA.id)}${CORES[corDoTime(timeA.id)].nome}</div>
            <div class="placar-num" id="placarA">${golsA}</div>
          </div>
          <div class="placar-x">×</div>
          <div class="placar-lado" style="text-align:right">
            <div class="placar-time">${CORES[corDoTime(timeB.id)].nome}${renderQuadradinho(timeB.id)}</div>
            <div class="placar-num" id="placarB">${golsB}</div>
          </div>
        </div>`;
    }

    // Cartão de um time (em quadra: i = 0 ou 1; na fila: i >= 2)
    function renderCartaoTime(i) {
      const t = times[i];
      if (!t) return '';
      const naFila = i >= 2;
      const cor = CORES[corDoTime(t.id)];
      const titulo = naFila ? `${i - 1}º · ${cor.nome}` : cor.nome;
      return `
        <div class="time${naFila ? ' fila-time' : ''}" data-chave="t:${t.id}" style="--c:${cor.dot}">
          <div class="time-topo">
            <span class="time-nome">${titulo}<small>${t.jogadores.length}/4</small></span>
            ${naFila ? '' : renderBadgePartidas(t.partidasSeguidas || 0)}
          </div>
          ${renderSeletorCor(t.id)}
          ${renderListaJogadores(i)}
        </div>`;
    }
```

5d. Substitua `atualizarAvisoLotacao` e `atualizarTela` inteiras por:

```js
    function atualizarAvisoLotacao() {
      const b = document.getElementById('bannerLotacao');
      if (!b) return;
      const total = totalAtletas();
      b.classList.toggle('visivel', total >= 20);
      if (total >= 20) {
        document.getElementById('bannerLotacaoTexto').innerText = `${total} atletas / ${times.length} times — limite de 20 atingido.`;
      }
    }

    function atualizarTela() {
      recomporTimes();
      const areaJogo = document.getElementById('timesJogando');
      const botoesJogo = document.getElementById('botoesVitoria');
      const rotuloEncerrar = document.getElementById('rotuloEncerrar');
      let temTimeNo3Jogo = false;

      if (times.length >= 2) {
        const timeA = times[0]; const timeB = times[1];
        if (timeA.partidasSeguidas === 2 || timeB.partidasSeguidas === 2) temTimeNo3Jogo = true;
        const nomeA = CORES[corDoTime(timeA.id)].nome, nomeB = CORES[corDoTime(timeB.id)].nome;

        areaJogo.innerHTML = renderPlacar(timeA, timeB) + renderCartaoTime(0) + renderCartaoTime(1);
        rotuloEncerrar.style.display = '';
        rotuloEncerrar.innerText = `Encerrar no tempo (${modoJogo === '10min' ? '10 min' : '7 min'})`;
        botoesJogo.innerHTML = `
          <button onclick="fimDeJogo(0)">${renderQuadradinho(timeA.id)}${nomeA} venceu</button>
          <button onclick="empate()">Empate</button>
          <button onclick="fimDeJogo(1)">${renderQuadradinho(timeB.id)}${nomeB} venceu</button>
        `;
        const tc = document.getElementById('tcPlacar');
        if (tc) tc.innerText = `${nomeA} ${golsA} × ${golsB} ${nomeB}`;
      } else if (times.length === 1) {
        areaJogo.innerHTML = renderCartaoTime(0) + '<p class="aguardando">Aguardando mais jogadores...</p>';
        rotuloEncerrar.style.display = 'none';
        botoesJogo.innerHTML = '';
      } else {
        areaJogo.innerHTML = '';
        rotuloEncerrar.style.display = 'none';
        botoesJogo.innerHTML = '';
      }

      document.getElementById('bannerAlerta3Jogo').classList.toggle('visivel', temTimeNo3Jogo);

      const areaFila = document.getElementById('listaFila');
      const naFila = Math.max(0, times.length - 2);
      document.getElementById('filaQtd').innerText = naFila ? `${naFila} ${naFila === 1 ? 'time' : 'times'}` : '';
      if (times.length > 2) {
        let html = '';
        for (let i = 2; i < times.length; i++) html += renderCartaoTime(i);
        areaFila.innerHTML = html;
      } else {
        areaFila.innerHTML = '<p class="vazio">Sem times na fila.</p>';
      }

      atualizarAvisoLotacao();
      atualizarSeletorModo();
    }
```

5e. Substitua `atualizarBotaoDesfazer` inteira por:

```js
    function atualizarBotaoDesfazer() {
      const b = document.getElementById('btnDesfazer');
      if (!b) return;
      b.classList.toggle('oculto', pilhaDesfazer.length === 0);
      const q = document.getElementById('desfazerQtd');
      if (q) q.innerText = pilhaDesfazer.length;
    }
```

5f. Substitua `atualizarDisplayTimer` e `atualizarBotoesTimer` inteiras por:

```js
    function atualizarDisplayTimer() {
      const texto = formatarTempo(tempoRestanteSeg);
      const baixo = tempoRestanteSeg <= 60;
      const disp = document.getElementById('timerDisplay');
      const fs = document.getElementById('fullscreenDisplay');
      disp.innerText = texto;
      fs.innerText = texto;
      disp.classList.toggle('baixo', baixo);
      fs.classList.toggle('baixo', baixo);
      const p = Math.max(0, Math.min(1, tempoRestanteSeg / duracaoJogoSeg()));
      document.querySelectorAll('.progresso').forEach(el => {
        el.style.setProperty('--p', p);
        el.classList.toggle('baixo', baixo);
      });
    }
```

```js
    function atualizarBotoesTimer() {
      const btn = document.getElementById('btnStartPause');
      const btnFs = document.getElementById('btnFsPause');
      const status = document.getElementById('statusTimer');
      const pausar = `${icone('pause', 16)}Pausar`;
      if (btn) btn.innerHTML = rodando ? pausar : `${icone('play', 16)}Play`;
      if (btnFs) btnFs.innerHTML = rodando ? pausar : `${icone('play', 16)}Continuar`;
      if (status) status.innerText = rodando ? '● ao vivo' : '';
    }
```

5g. Em `atualizarSeletorModo`, troque as duas linhas de `sel.innerHTML` por:

```js
        sel.innerHTML =
          `<button class="${modoJogo === '7e2' ? 'ativo' : ''}" onclick="definirModoJogo('7e2')">7 min · 2 gols</button>` +
          `<button class="${modoJogo === '10min' ? 'ativo' : ''}" onclick="definirModoJogo('10min')">10 min corrido</button>`;
```

5h. Substitua `abrirMenu`, `fecharMenu` e `mudarAba` (as três, inteiras) por:

```js
    function abrirMenu() {
      atualizarListaPagantesUI();
      atualizarMensalistasUI();
      atualizarRelatorioUI();
      document.getElementById('menuModal').classList.add('aberto');
      requestAnimationFrame(posicionarIndicadorAba);
    }

    function fecharMenu() {
      document.getElementById('menuModal').classList.remove('aberto');
    }

    const ABAS = {
      pagantes:  { botao: 'tabPagantesBtn',  view: 'abaPagantesView',  carregar: () => { atualizarListaPagantesUI(); atualizarMensalistasUI(); } },
      relatorio: { botao: 'tabRelatorioBtn', view: 'abaRelatorioView', carregar: () => atualizarRelatorioUI() },
      historico: { botao: 'tabHistoricoBtn', view: 'abaHistoricoView', carregar: () => carregarHistorico() },
      cobranca:  { botao: 'tabCobrancaBtn',  view: 'abaCobrancaView',  carregar: () => carregarCobranca() },
      pix:       { botao: 'tabPixBtn',       view: 'abaPixView',       carregar: () => {} }
    };

    function mudarAba(aba) {
      if (!ABAS[aba]) return;
      Object.keys(ABAS).forEach(k => {
        document.getElementById(ABAS[k].botao).classList.toggle('ativa', k === aba);
        document.getElementById(ABAS[k].view).classList.toggle('ativa', k === aba);
      });
      ABAS[aba].carregar();
      posicionarIndicadorAba();
    }

    // Pílula branca que desliza até a aba ativa
    function posicionarIndicadorAba() {
      const ind = document.getElementById('abaIndicador');
      const ativa = document.querySelector('.aba.ativa');
      if (!ind || !ativa) return;
      ind.style.width = ativa.offsetWidth + 'px';
      ind.style.transform = `translateX(${ativa.offsetLeft}px)`;
      if (ativa.scrollIntoView) ativa.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
```

5i. Substitua `abrirNiveis` e `fecharNiveis` inteiras por:

```js
    function abrirNiveis() {
      atualizarNiveisUI();
      document.getElementById('niveisModal').classList.add('aberto');
    }

    function fecharNiveis() {
      document.getElementById('niveisModal').classList.remove('aberto');
    }
```

5j. Substitua `empate` e `fecharEmpateModal` inteiras por:

```js
    function empate() {
      if (times.length < 2) return;
      // Pergunta ao admin quem vai na frente (o par ou ímpar é decidido na quadra)
      const timeA = times[0], timeB = times[1];
      const cont = document.getElementById('empateBotoes');
      if (cont) {
        cont.innerHTML =
          `<button class="btn-bloco" onclick="resolverEmpate(0)">${renderQuadradinho(timeA.id)}${nomeTime(timeA.id)} joga primeiro</button>` +
          `<button class="btn-bloco" onclick="resolverEmpate(1)">${renderQuadradinho(timeB.id)}${nomeTime(timeB.id)} joga primeiro</button>` +
          `<button class="btn-bloco" style="background:transparent; color:var(--mu);" onclick="fecharEmpateModal()">Cancelar</button>`;
      }
      document.getElementById('empateModal').classList.add('aberto');
    }

    function fecharEmpateModal() {
      document.getElementById('empateModal').classList.remove('aberto');
    }
```

- [ ] **Passo 6: Rodar os testes**

Run: `node --test "tests/**/*.test.js"`
Expected: PASS (todos).

- [ ] **Passo 7: Conferir no navegador (offline), com a prévia aprovada ao lado**

Abra `.superpowers/brainstorm/1698-1795526398/content/design-visual.html` como referência, se ainda existir. Em `http://localhost:5173/index.html?offline`, num celular ou no DevTools com largura de 390px, confira:
- Fundo preto, fonte Space Grotesk, topo com ☰ / marca / ↶. O ↶ aparece depois da primeira ação e mostra o contador.
- 5 toques em "Futebol de Segunda" abrem os Níveis.
- Cronômetro grande com barra limão. Play/Pausar com ícone. No último minuto (pode testar no console com `tempoRestanteSeg = 50; atualizarDisplayTimer()`), o número e a barra ficam vermelhos e o número pulsa.
- Placar "Azul 1 × 0 Laranja". Cartões com faixa lateral na cor do time e bolinhas de cor menores. Jogador com ⚽ ✎ ✕.
- "Azul venceu / Empate / Laranja venceu" em pílulas. A fila aparece como "1º · Verde 4/4", com jogadores e ✎ ✕, sem ⚽.
- A gaveta do menu sobe de baixo com mola e fecha tocando fora. Na troca de abas, a pílula branca desliza. O conteúdo das abas ainda pode estar sem estilo (fica pra Tarefa 5).
- O Empate abre o modal crescendo e mostra a comemoração "EMPATE".
- A tela cheia mostra o número gigante em limão, o placar no topo e o botão "Sair".

- [ ] **Passo 8: Commit**

```bash
git add index.html tests/tela.test.js && git -c user.name="<autor>" -c user.email="<email>" commit -m "$(cat <<'EOF'
Novo visual (esportivo minimal): CSS, tela principal, tela cheia, gaveta do menu e modais

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 5: Novo visual — conteúdo do menu (pagantes, relatório, histórico, cobrança, níveis)

**Files:**
- Create: `tests/menu.test.js`
- Modify: `index.html` (`atualizarMensalistasUI`, `atualizarListaPagantesUI`, `alternarPagamento`, `atualizarRelatorioUI`, `renderItemHistorico`, `carregarHistorico`, `carregarCobranca`, `renderCobranca`, `atualizarNiveisUI`, `definirEstrela`)

**Interfaces:**
- Consumes: `ordenarPorValor(mapa)` (Tarefa 3), `icone()` (Tarefa 2) e as classes CSS da Tarefa 4.
- Produces: `atualizarBotaoCobrar()`, `renderRanking(mapa, chaves, { rotulo?, perigo? }) → string`, `plural(n, um, varios) → string`, `alternarPagamento(nome, status, botao?)`. A linha de nível tem `data-nome="NOME"`.

- [ ] **Passo 1: Escrever os testes (vão falhar)**

`tests/menu.test.js`:

```js
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
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `node --test "tests/**/*.test.js"`
Expected: FAIL em `menu.test.js` (sem `ranking-barra`, sem `toggle-pago`, sem `class="hist"`).

- [ ] **Passo 3: Mensalistas e pagantes**

Substitua `atualizarMensalistasUI` inteira por:

```js
    function atualizarMensalistasUI() {
      const c = document.getElementById('listaMensalistas');
      if (!c) return;
      if (!mensalistas.length) {
        c.innerHTML = '<p class="vazio" style="text-align:left; margin:0;">Nenhum mensalista cadastrado.</p>';
        return;
      }
      c.innerHTML = mensalistas.map(m => {
        const seguro = String(m).replace(/'/g, "\\'");
        return `<span class="chip">${m}<button onclick="removerMensalista('${seguro}')" aria-label="Remover ${m}">${icone('x', 14)}</button></span>`;
      }).join('');
    }
```

Substitua `alternarPagamento` inteira por:

```js
    // botao (opcional): o botão tocado. Com ele, só a linha muda e o toggle desliza;
    // sem ele (ex.: vindo de outro lugar), a lista inteira é redesenhada.
    function alternarPagamento(nome, statusClick, botao) {
      if (pagamentos[nome] === statusClick) return;
      snapshotEstado();
      pagamentos[nome] = statusClick;
      const toggle = botao && botao.closest ? botao.closest('.toggle-pago') : null;
      if (toggle) {
        toggle.classList.toggle('pago', statusClick === 'pago');
        toggle.classList.toggle('devendo', statusClick === 'devendo');
        const nomeEl = toggle.closest('.pagante').querySelector('.pagante-nome');
        nomeEl.classList.toggle('pago', statusClick === 'pago');
        nomeEl.classList.toggle('devendo', statusClick === 'devendo');
        atualizarBotaoCobrar();
      } else {
        atualizarListaPagantesUI();
      }
      salvarEstado();
    }
```

Substitua `atualizarListaPagantesUI` inteira por:

```js
    function atualizarBotaoCobrar() {
      const btnCobrar = document.getElementById('btnCobrar');
      if (!btnCobrar) return;
      const qtdDev = Object.values(pagamentos).filter(s => s === 'devendo').length;
      btnCobrar.innerHTML = `${icone('message', 16)}Cobrar quem falta pagar${qtdDev > 0 ? ` (${qtdDev})` : ''}`;
    }

    function atualizarListaPagantesUI() {
      const container = document.getElementById('listaPagantes');
      const nomesCadastrados = Object.keys(pagamentos).sort();
      atualizarBotaoCobrar();

      if (nomesCadastrados.length === 0) {
        container.innerHTML = '<p class="vazio">Nenhum jogador cadastrado ainda.</p>';
        return;
      }

      container.innerHTML = nomesCadastrados.map(nome => {
        const status = pagamentos[nome] === 'pago' ? 'pago' : 'devendo';
        const seguro = String(nome).replace(/'/g, "\\'");
        return `
          <div class="pagante">
            <span class="pagante-nome ${status}">${nome}</span>
            <span class="pagante-acoes">
              <span class="toggle-pago ${status}">
                <button class="op-pago" onclick="alternarPagamento('${seguro}', 'pago', this)">Pago</button>
                <button class="op-deve" onclick="alternarPagamento('${seguro}', 'devendo', this)">Deve</button>
              </span>
              <button class="btn-icone" title="Remover da lista" aria-label="Remover ${nome}" onclick="removerPagante('${seguro}')">${icone('trash', 15)}</button>
            </span>
          </div>`;
      }).join('');
    }
```

- [ ] **Passo 4: Relatório com barras**

Substitua `atualizarRelatorioUI` inteira por:

```js
    // ----- RELATÓRIO -----
    function plural(n, um, varios) { return `${n} ${n === 1 ? um : varios}`; }

    // Lista com barra proporcional ao maior valor
    function renderRanking(mapa, chaves, { rotulo = n => n, perigo = false } = {}) {
      if (!chaves.length) return '<li class="vazio">Sem dados</li>';
      const max = Math.max(1, ...chaves.map(k => mapa[k] || 0));
      return chaves.map(k => `
        <li class="ranking-item">
          <span class="ranking-nome">${rotulo(k)}</span>
          <span class="ranking-barra${perigo ? ' perigo' : ''}"><i style="width:${Math.round(((mapa[k] || 0) / max) * 100)}%"></i></span>
          <span class="ranking-valor">${mapa[k] || 0}</span>
        </li>`).join('');
    }

    function atualizarRelatorioUI() {
      const timesVit = ordenarPorValor(vitoriasTimes);
      document.getElementById('topTime').innerHTML = timesVit.length
        ? `${nomeTime(timesVit[0])} <em>· ${plural(vitoriasTimes[timesVit[0]], 'vitória', 'vitórias')}</em>`
        : 'Nenhuma partida jogada';
      document.getElementById('rankingTimesList').innerHTML = renderRanking(vitoriasTimes, timesVit, { rotulo: nomeTime });

      const jogVit = ordenarPorValor(vitoriasJogadores);
      document.getElementById('topJogador').innerHTML = jogVit.length
        ? `${jogVit[0]} <em>· ${plural(vitoriasJogadores[jogVit[0]], 'vitória', 'vitórias')}</em>`
        : 'Nenhum jogador pontuou';
      document.getElementById('rankingJogadoresList').innerHTML = renderRanking(vitoriasJogadores, jogVit);

      const art = ordenarPorValor(golsJogadores);
      document.getElementById('topArtilheiro').innerHTML = art.length
        ? `${art[0]} <em>· ${plural(golsJogadores[art[0]], 'gol', 'gols')}</em>`
        : 'Sem gols ainda';
      document.getElementById('rankingArtilhariaList').innerHTML = renderRanking(golsJogadores, art);

      const timesGols = ordenarPorValor(golsTime);
      document.getElementById('topGolsTime').innerHTML = timesGols.length
        ? `${nomeTime(timesGols[0])} <em>· ${plural(golsTime[timesGols[0]], 'gol', 'gols')}</em>`
        : 'Sem gols ainda';
      document.getElementById('rankingGolsList').innerHTML = renderRanking(golsTime, timesGols, { rotulo: nomeTime });

      document.getElementById('rankingDerrotasTimesList').innerHTML =
        renderRanking(derrotasTimes, ordenarPorValor(derrotasTimes), { rotulo: nomeTime, perigo: true });
      document.getElementById('rankingDerrotasJogadoresList').innerHTML =
        renderRanking(derrotasJogadores, ordenarPorValor(derrotasJogadores), { perigo: true });
    }
```

- [ ] **Passo 5: Histórico e cobrança**

Substitua `renderItemHistorico` inteira por:

```js
    function renderItemHistorico(item) {
      const r = item.resumo || {};
      const dataFmt = item.data ? item.data.split('-').reverse().join('/') : '';
      const jc = melhorChave(r.vitoriasJogadores);
      const tc = melhorChave(r.vitoriasTimes);
      const tg = melhorChave(r.golsTime);
      const ja = melhorChave(r.golsJogadores);
      const linha = (rotulo, valor) =>
        `<div class="ranking-item"><span style="color:var(--mu)">${rotulo}</span><strong>${valor}</strong></div>`;
      return `
        <div class="hist">
          <div class="hist-data">${dataFmt}</div>
          ${linha('Jogador campeão', jc ? `${jc.chave} (${jc.valor} vit.)` : '—')}
          ${linha('Time campeão', tc ? `${nomeTime(tc.chave)} (${tc.valor} vit.)` : '—')}
          ${linha('Artilheiro', ja ? `${ja.chave} (${ja.valor} gols)` : '—')}
          ${linha('Time com mais gols', tg ? `${nomeTime(tg.chave)} (${tg.valor} gols)` : '—')}
          ${linha('Total de gols', r.totalGols != null ? r.totalGols : '—')}
        </div>`;
    }
```

Em `carregarHistorico`, troque as mensagens:
- `'<p style="color:#dc3545;">Sem conexão com a nuvem.</p>'` → `'<p class="vazio" style="color:var(--dg)">Sem conexão com a nuvem.</p>'`
- `'<p style="color:#777;">Carregando...</p>'` → `'<p class="vazio">Carregando...</p>'`
- `'<p style="color:#777;">Nenhuma pelada arquivada ainda. O histórico é criado quando você inicia uma nova pelada.</p>'` → `'<p class="vazio">Nenhuma pelada arquivada ainda. O histórico é criado quando você inicia uma nova pelada.</p>'`
- `'<p style="color:#dc3545;">Erro ao carregar o histórico.</p>'` → `'<p class="vazio" style="color:var(--dg)">Erro ao carregar o histórico.</p>'`

Em `carregarCobranca`, troque:
- `'<p style="color:#777;">Carregando...</p>'` → `'<p class="vazio">Carregando...</p>'`
- `'<p style="color:#777;">Nenhuma pelada com pagamentos ainda. Marque os pagantes e, ao iniciar a próxima pelada, o histórico de cobrança começa a acumular.</p>'` → `'<p class="vazio">Nenhuma pelada com pagamentos ainda. Marque os pagantes e, ao iniciar a próxima pelada, o histórico de cobrança começa a acumular.</p>'`

Substitua `renderCobranca` inteira por:

```js
    function renderCobranca(peladas) {
      const { pend, ordenados, pendentes } = pendentesDe(peladas);

      let html = `<button class="btn-whats btn-bloco" onclick="cobrarPendentes()">${icone('message', 16)}Cobrar pendentes (${pendentes.length})</button>`;

      if (pendentes.length === 0) {
        html += '<div class="stat"><div class="stat-valor" style="font-size:1rem">Ninguém está pendente nas últimas peladas.</div></div>';
      } else {
        html += '<div class="stat"><small>Pendentes</small><ul class="ranking" style="margin-top:6px">';
        pendentes.forEach(n => {
          html += `<li class="ranking-item"><span>${n}</span><strong style="color:var(--dg)">${pend[n]}× devendo</strong></li>`;
        });
        html += '</ul></div>';
      }

      // Matriz jogador × pelada
      html += '<div class="tabela-wrap"><table class="cobranca-tabela"><thead><tr><th>Jogador</th>';
      peladas.forEach(p => { html += `<th>${p.arquivada ? p.data : 'Hoje'}</th>`; });
      html += '</tr></thead><tbody>';
      ordenados.forEach(n => {
        const nomeSeguro = String(n).replace(/'/g, "\\'");
        html += `<tr><td class="cob-nome">${n}</td>`;
        peladas.forEach(p => {
          const st = p.pagamentos[n];
          if (st === undefined) {
            html += '<td class="cob-cel"><span style="color:var(--di)">—</span></td>';
          } else {
            const pago = st === 'pago';
            html += `<td class="cob-cel"><button class="cob-btn ${pago ? 'pago' : 'devendo'}" onclick="alternarCobranca('${p.id}', '${nomeSeguro}')">${pago ? 'Pago' : 'Deve'}</button></td>`;
          }
        });
        html += '</tr>';
      });
      return html + '</tbody></table></div>';
    }
```

- [ ] **Passo 6: Níveis**

Em `atualizarNiveisUI`:
- troque `` `<button class="ord-btn ${niveisOrdem === 'estrela' ? 'ativo' : ''}" onclick="ordenarNiveis('estrela')">⭐ Nível</button></div>` + `` por `` `<button class="ord-btn ${niveisOrdem === 'estrela' ? 'ativo' : ''}" onclick="ordenarNiveis('estrela')">Nível</button></div>` + ``;
- troque `` c.innerHTML = `<p style="color:#777; font-size:0.85rem; margin:8px 0 0;">${ `` por `` c.innerHTML = `<p class="vazio">${ ``;
- troque `` return `<div class="nivel-item"><span class="nivel-nome">`` por `` return `<div class="nivel-item" data-nome="${n}"><span class="nivel-nome">``.

Substitua `definirEstrela` inteira por:

```js
    function definirEstrela(nome, n) {
      snapshotEstado();
      estrelas[nome] = n;
      atualizarNiveisUI();
      // A estrela tocada dá um "pulo"
      document.querySelectorAll('.nivel-item').forEach(li => {
        if (li.dataset.nome !== nome) return;
        const estrela = li.querySelectorAll('.estrela-btn')[n - 1];
        if (estrela) estrela.classList.add('pop');
      });
      salvarEstado();
    }
```

- [ ] **Passo 7: Rodar os testes**

Run: `node --test "tests/**/*.test.js"`
Expected: PASS (todos).

- [ ] **Passo 8: Conferir no navegador (offline)**

Abra o menu e passe por todas as abas:
- **Pagantes:** chips de mensalista com ✕. O toggle Pago/Deve desliza (limão ↔ vermelho) e o nome fica vermelho quando deve. O botão verde do WhatsApp mostra a contagem. 🗑 vira ícone.
- **Relatório:** cartões de destaque com o valor em limão e rankings com barra. A artilharia aparece logo depois dos destaques.
- **Histórico** e **Cobrança:** no `?offline` mostram "Sem conexão com a nuvem." ou a lista de hoje. A cobrança tem as pílulas Pago/Deve.
- **Pix:** QR em cartão branco, dados em bloco e botão "Copiar chave Pix" com ícone.
- **Níveis** (5 toques na marca): estrelas em limão, e a estrela tocada pula.

- [ ] **Passo 9: Commit**

```bash
git add index.html tests/menu.test.js && git -c user.name="<autor>" -c user.email="<email>" commit -m "$(cat <<'EOF'
Novo visual no conteúdo do menu: pagantes (toggle), relatório com barras, histórico, cobrança e níveis

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 6: Motion funcional (entradas, placar, selo, tempo esgotado, sync)

**Files:**
- Create: `tests/motion.test.js`
- Modify: `index.html` (`<style>`, novo bloco JS de motion, fim de `atualizarTela`, `tocarAlarme`, `pararAlarme`, `enviarParaNuvem`)

**Interfaces:**
- Consumes: `data-chave` em `.time` (`t:ID`) e `.jogador` (`j:NOME`), além de `#placarA`/`#placarB` e `.selo-gol` (Tarefas 3 e 4).
- Produces: `chavesNovas(anteriores: Set|null, atuais: string[]) → string[]`, `animarMudancas()` (chamada no fim de `atualizarTela`), e as classes `.entrar`, `.destaque`, `.rolar`, `.pop`, `body.tempo-esgotado` e `.sync-badge.enviando`.

- [ ] **Passo 1: Escrever os testes (vão falhar)**

`tests/motion.test.js`:

```js
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
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `node --test "tests/**/*.test.js"`
Expected: FAIL (`chavesNovas is not defined`, `placarAnterior is not defined`).

- [ ] **Passo 3: CSS do motion funcional**

Logo antes de `    /* ===================== MOVIMENTO REDUZIDO ===================== */`, adicione:

```css
    /* ===================== MOTION FUNCIONAL ===================== */
    .entrar { animation: entrar 420ms var(--suave) both; }
    @keyframes entrar { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
    .time.destaque::before { animation: brilhoFaixa 900ms ease both; }
    @keyframes brilhoFaixa { 0% { width: 3px; } 35% { width: 100%; opacity: .22; } 100% { width: 3px; opacity: 1; } }
    .placar-num.rolar { animation: rolar 520ms var(--mola) both; }
    @keyframes rolar { from { transform: translateY(65%); opacity: 0; } to { transform: none; opacity: 1; } }
    .selo-gol.pop { animation: popSelo 480ms var(--mola) both; }
    @keyframes popSelo { 0% { transform: scale(.4); opacity: 0; } 60% { transform: scale(1.25); opacity: 1; } 100% { transform: scale(1); } }
    body.tempo-esgotado::after { content: ''; position: fixed; inset: 0; z-index: 15000; pointer-events: none; box-shadow: inset 0 0 0 6px var(--dg), inset 0 0 140px rgba(255,77,77,.45); animation: piscar 1s ease-in-out infinite; }
    @keyframes piscar { 50% { opacity: .2; } }
    .sync-badge.enviando .dot { background: var(--ac); animation: pulsarDot .8s ease-in-out infinite; }
    @keyframes pulsarDot { 50% { transform: scale(1.8); opacity: .5; } }

```

E, dentro do `@media (prefers-reduced-motion: reduce) { ... }` do fim do `<style>`, antes do `}` que fecha o bloco, adicione:

```css
      .entrar { animation: fadeIn 200ms ease both !important; }
      .placar-num.rolar, .selo-gol.pop, .time.destaque::before, body.tempo-esgotado::after { animation: none !important; }
```

- [ ] **Passo 4: JS do motion funcional**

Logo antes de `    function atualizarTela() {`, adicione:

```js
    // ===== MOTION FUNCIONAL =====
    // A tela é redesenhada inteira a cada ação, então só animamos o que MUDOU desde a última vez.
    let chavesVistas = null;        // data-chave desenhadas na última vez (null = primeira renderização)
    let quadraAnterior = null;      // ids dos 2 times que estavam em quadra
    let placarAnterior = null;      // { ids: 'a-b', a, b }
    let golsPartidaAnterior = null; // cópia de golsPartida

    // Na primeira renderização só os times entram; depois, só o que não existia antes
    function chavesNovas(anteriores, atuais) {
      if (anteriores === null) return atuais.filter(c => c.startsWith('t:'));
      return atuais.filter(c => !anteriores.has(c));
    }

    function reiniciarAnimacao(el, classe) {
      el.classList.remove(classe);
      void el.offsetWidth;
      el.classList.add(classe);
    }

    function animarMudancas() {
      const raiz = document.getElementById('mainContainer');
      if (!raiz) return;

      // 1) Itens novos entram deslizando (sem animar o filho de quem já está entrando)
      const elementos = Array.from(raiz.querySelectorAll('[data-chave]'));
      const atuais = elementos.map(el => el.dataset.chave);
      const novas = new Set(chavesNovas(chavesVistas, atuais));
      let atraso = 0;
      elementos.forEach(el => {
        if (!novas.has(el.dataset.chave)) return;
        if (el.parentElement && el.parentElement.closest('.entrar')) return;
        el.style.animationDelay = `${Math.min(atraso, 400)}ms`;
        el.classList.add('entrar');
        atraso += 40;
      });
      chavesVistas = new Set(atuais);

      // 2) Time que acabou de entrar em quadra: brilho na faixa lateral
      const quadraAgora = times.slice(0, 2).map(t => t.id);
      if (quadraAnterior !== null) {
        quadraAgora.forEach(id => {
          if (quadraAnterior.includes(id)) return;
          const card = raiz.querySelector(`#timesJogando [data-chave="t:${id}"]`);
          if (card) card.classList.add('entrar', 'destaque');
        });
      }
      quadraAnterior = quadraAgora;

      // 3) Placar: o número que subiu rola de baixo pra cima
      if (times.length >= 2) {
        const ids = `${times[0].id}-${times[1].id}`;
        if (placarAnterior && placarAnterior.ids === ids) {
          const a = document.getElementById('placarA'), b = document.getElementById('placarB');
          if (a && golsA > placarAnterior.a) reiniciarAnimacao(a, 'rolar');
          if (b && golsB > placarAnterior.b) reiniciarAnimacao(b, 'rolar');
        }
        placarAnterior = { ids, a: golsA, b: golsB };
      }

      // 4) Selo de gol do jogador: "pop" quando o número sobe
      if (golsPartidaAnterior !== null) {
        raiz.querySelectorAll('.jogador').forEach(li => {
          const nome = (li.dataset.chave || '').slice(2);
          const selo = li.querySelector('.selo-gol');
          if (selo && (golsPartida[nome] || 0) > (golsPartidaAnterior[nome] || 0)) selo.classList.add('pop');
        });
      }
      golsPartidaAnterior = { ...golsPartida };
    }

```

No fim de `atualizarTela()`, logo depois de `      atualizarSeletorModo();`, adicione:

```js
      animarMudancas();
```

- [ ] **Passo 5: Tempo esgotado e sync**

Em `tocarAlarme()`, logo depois da primeira linha `      pararAlarme();`, adicione:

```js
      document.body.classList.add('tempo-esgotado'); // tela pisca em vermelho junto com a sirene
```

Em `pararAlarme()`, logo depois de `      if (alarmeTimeout) { clearTimeout(alarmeTimeout); alarmeTimeout = null; }`, adicione:

```js
      document.body.classList.remove('tempo-esgotado');
```

Em `enviarParaNuvem()`, logo depois de `      if (!sb) return;`, adicione:

```js
      const badge = document.getElementById('syncBadge');
      if (badge) badge.classList.add('enviando'); // bolinha pulsa enquanto envia (atualizarSyncBadge limpa)
```

- [ ] **Passo 6: Rodar os testes**

Run: `node --test "tests/**/*.test.js"`
Expected: PASS (todos).

- [ ] **Passo 7: Conferir no navegador (offline)**

- Ao abrir com pelada em andamento, os cartões dos times entram em sequência, um por vez.
- Adicionar um jogador faz só a linha dele (ou o time novo) entrar deslizando.
- Um gol faz o número do placar rolar e o selo "⚽ n" pular.
- Uma vitória faz o time que vem da fila entrar com um brilho na faixa lateral.
- Com o tempo esgotado (console: `tempoFinalTimestamp = Date.now() + 2000; rodando = true; iniciarTickLocal()`), a borda da tela pisca em vermelho com a sirene. "Parar sirene" para os dois.
- No DevTools, em Rendering → "Emulate CSS prefers-reduced-motion: reduce": a comemoração vira só um fade, sem tremida nem partículas, e as entradas ficam só com fade.

- [ ] **Passo 8: Commit**

```bash
git add index.html tests/motion.test.js && git -c user.name="<autor>" -c user.email="<email>" commit -m "$(cat <<'EOF'
Motion funcional: entradas de itens novos, placar rolando, selo de gol, tempo esgotado e sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 7: Verificação final e publicação

**Files:**
- Nenhum arquivo novo. Corrige `index.html` se o roteiro achar problema.

**Interfaces:**
- Consumes: tudo acima.
- Produces: branch `main` pronta para push.

- [ ] **Passo 1: Testes e sintaxe**

Run:
```bash
cd "c:/Users/gabri/Downloads/futsalcma" && node --test "tests/**/*.test.js" && node -e '
const html=require("fs").readFileSync("index.html","utf8");
const s=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join("\n");
new Function(s); console.log("sintaxe OK");'
```
Expected: todos os testes PASS e "sintaxe OK".

- [ ] **Passo 2: Roteiro completo no navegador (`?offline`)**

Siga em ordem e anote qualquer falha:
1. Cadastrar 14 nomes com numeração ("1 - joão") → saem em MAIÚSCULO e sem número. Sortear.
2. ⚽ em 2 jogadores diferentes do mesmo time (modo 7e2) → GOL!, GOL! + VENCEU. A fila gira, o time novo entra com brilho e a artilharia conta.
3. Vencer no tempo ("Azul venceu") → VENCEU com a cor do time.
4. Repetir até um time fazer 3 vitórias seguidas → o subtítulo diz "3 vitórias seguidas · entram 2 times novos". Antes disso, o aviso amarelo de 3º jogo aparece.
5. Empate → modal → "Azul joga primeiro" → EMPATE → a ordem da fila está certa.
6. Desfazer (↶) depois de um gol → placar, selo e artilharia voltam, sem comemoração.
7. ✎ num jogador com gols → o nome muda e os gols vão junto (Relatório).
8. ✕ num jogador → o confirm aparece, ele sai e o placar não muda.
9. Adicionar jogador até 20 → o aviso de lotação aparece.
10. Trocar o modo para "10 min corrido" → 3 gols não encerram.
11. Menu: todas as abas. Níveis: 5 toques na marca.
12. Tela cheia: número gigante, placar no topo e último minuto vermelho.
13. Recarregar a página → nada comemora, e o estado volta igual.
14. Console: `receberEstadoRemoto({ ...coletarEstado(), ultimoEvento: { ts: Date.now() + 5000, eventos: [{ tipo: 'gol', titulo: 'GOL!', sub: 'REMOTO', cor: '#c6ff00' }] } })` → comemora.
15. Estado antigo: no console, `localStorage.setItem('futsalcma_estado_teste', JSON.stringify({ times: [{ id: 1, jogadores: ['A','B','C','D'], partidasSeguidas: 0 }, { id: 2, jogadores: ['E','F','G','H'], partidasSeguidas: 0 }], golsA: 0, golsB: 0 }))` e recarregar → abre sem erro no console.
16. Movimento reduzido (DevTools) → só fades.
17. Largura de 360px (celular pequeno): nada estoura na horizontal. A linha do jogador com 3 ícones cabe com nome longo ("CARLOS FILHO").

- [ ] **Passo 3: Teste de sincronização real (só com autorização do usuário)**

Pergunte ao usuário se pode testar conectado à nuvem e se não há pelada acontecendo agora. **Se ele autorizar:**
1. Salve o estado atual: abra o app **sem** `?offline` e rode no console `copy(JSON.stringify(coletarEstado()))`. Cole num arquivo do scratchpad.
2. Abra duas abas sem `?offline`. Marque um gol na aba 1 → a aba 2 comemora "GOL!". Recarregue a aba 2 → não comemora.
3. Restaure: no console, `aplicarEstado(JSON.parse(<colado>)); salvarEstado();`, e confira nas duas abas.

Se ele não autorizar, registre que esse teste ficou pendente e que a lógica está coberta por `tests/eventos.test.js`.

- [ ] **Passo 4: Push (com confirmação do usuário)**

Mostre o `git log --oneline origin/main..HEAD` ao usuário e pergunte se pode dar push. Com o "sim":

```bash
git push origin main
```
