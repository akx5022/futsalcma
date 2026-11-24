# Redesign visual + motion design + gols por jogador

Data: 2026-11-24
Arquivo afetado: `index.html` (único arquivo do app)

## Objetivo

Trocar a aparência do app por um visual moderno ("esportivo minimalista"), com animações em todo o app e uma comemoração em tela cheia nos momentos de gol, vitória e empate. Na mesma entrega, o gol passa a ser marcado **no jogador**, o que cria a artilharia da pelada.

A lógica do jogo continua a mesma: sorteio, fila, regra das 3 vitórias, modos 7e2/10min, pagantes, cobrança, histórico, níveis e sincronização Supabase. Ela só ganha os ganchos necessários.

## Decisões tomadas

| Tema | Decisão |
|---|---|
| Escopo | O app todo: tela principal, menu e abas, tela cheia do cronômetro e modais de Empate e Níveis |
| Estilo | C, esportivo minimalista: preto, verde-limão de destaque, números grandes |
| Intensidade de animação | Nível 3, comemoração em tela cheia em gol, vitória e empate |
| Comemoração nos outros celulares | Sim, em todos que estiverem com o app aberto |
| Som | Nenhum som novo. Só vibração (`navigator.vibrate`), quando o aparelho suportar. A sirene do fim do tempo continua igual |
| Implementação | CSS + animações nativas (CSS e Web Animations API), sem biblioteca, tudo no `index.html` |
| Corrigir gol errado | Só pelo ↶ Desfazer (não existe "−") |
| Gol contra / sem autor | Não existe. Todo gol é marcado em um jogador |

## 1. Sistema visual

### Tokens (variáveis CSS em `:root`)

- `--bg: #000` (fundo)
- `--s1: #0d0d0d` (cartões), `--s2: #161616` (elementos dentro de cartões)
- `--ln: #222` (linhas e bordas)
- `--tx: #f5f5f5` (texto), `--mu: #8a8a8a` (texto secundário), `--di: #525252` (texto apagado)
- `--ac: #c6ff00` (destaque: ações principais, "ao vivo", progresso). O texto sobre `--ac` é `#000`
- `--dg: #ff4d4d` (perigo: sair, devendo, último minuto)
- `--wr: #ffb020` (aviso: 3º jogo)
- Raios: cartões 20px, botões e chips em pílula (999px)

As 5 cores de time (azul, laranja, verde, vermelho, cinza) continuam como estão no objeto `CORES`. No cartão do time, a cor aparece como uma faixa lateral de 3px e um quadradinho ao lado do nome. O fundo do cartão deixa de ser tingido.

### Tipografia

- Space Grotesk 500/700 via Google Fonts, com fallback para a fonte do sistema.
- Números (cronômetro, placar, rankings) usam `font-variant-numeric: tabular-nums`, pra não "pular" enquanto o tempo corre.
- Rótulos de seção em caixa alta, 10–11px, `letter-spacing` alto, cor `--mu`.

### Componentes e telas

- **Topo:** ícone do menu à esquerda, marca no centro ("SAL CMA" / "Futebol de Segunda") e ícone ↶ Desfazer à direita, com um contador pequeno de quantas ações dá pra desfazer. O ↶ fica oculto quando a pilha está vazia. A faixa azul "Desfazer última ação" deixa de existir.
- **Badge de sincronização:** texto pequeno com uma bolinha (limão = ok, vermelho = erro, cinza = conectando).
- **Cronômetro:** número grande (~78px), barra de progresso fina em `--ac`, pílulas Pausar/Play, Reiniciar e Tela cheia, e o seletor de modo como controle segmentado.
- **Placar geral:** "Azul 1 × 0 Laranja", com números grandes e o quadradinho da cor de cada time.
- **Cartão do time em quadra:** nome + "(n/4)", badge de partidas seguidas (`--wr` quando é a 2ª seguida), seletor de cor (bolinhas menores) e a lista de jogadores. O controle "+Gol / n gols / −" **é removido**.
- **Linha do jogador em quadra:** nome, selo "⚽ n" (só se fez gol nesta partida) e três botões-ícone de 34px: ⚽ (fundo `--ac`), ✎ editar e ✕ sair (ícone em `--dg`).
- **Linha do jogador na fila:** nome + ✎ + ✕. Não tem ⚽.
- **Encerrar no tempo:** três pílulas: "Azul venceu" / "Empate" / "Laranja venceu".
- **Fila:** um cartão por time com quadradinho da cor, "1º · Verde", "n/4", seletor de cor e a lista de jogadores sempre visível (como hoje), em versão mais compacta.
- **Adicionar jogador / cadastro inicial:** campo em pílula + botão `--ac`.
- **Avisos** (3º jogo, lotação): faixa arredondada com ícone, descendo do topo da área.
- **Menu:** gaveta que sobe de baixo (bottom sheet), abas em pílulas roláveis na horizontal (a ativa em branco) e cartões de estatística com o valor em destaque `--ac`. Os rankings ganham uma barra proporcional. Pago/Deve vira um toggle em pílula.
- **Modais** (Empate, Níveis): mesmo cartão escuro, com botões em pílula.
- **Tela cheia:** placar pequeno no topo, número gigante em `--ac` e barra de progresso. No último minuto, o número fica `--dg` e pulsa.

### Ícones

Um conjunto pequeno de ícones em SVG inline, com o traçado copiado do Lucide (licença ISC), servido por uma função `icone(nome)`. A lista inclui: menu, undo, x, pencil, play, pause, rotate-ccw, maximize, minimize, users, trophy, calendar, receipt, qr-code, wallet, star, alert-triangle, plus e copy. O `<script>` do Lucide via unpkg e a chamada `lucide.createIcons()` **são removidos**.

Os emojis saem dos botões e títulos da interface. **Continuam** nas mensagens de WhatsApp e no ⚽ do botão e do selo de gol, que é intencional.

## 2. Motion design

Todas as durações e curvas ficam em variáveis CSS (`--t-rapido: 160ms`, `--t-medio: 320ms`, `--mola: cubic-bezier(.2,.8,.2,1.15)`, `--suave: cubic-bezier(.2,.8,.2,1)`).

### Comemorações (overlay de tela cheia)

Um único elemento `#celebracao`, fixo e acima de tudo, mostrado pela função `celebrar(evento)`.

- **Gol:** fundo `--ac` revelado em círculo a partir do ponto tocado (ou do centro, nos outros celulares), "GOL!" gigante girando levemente, subtítulo "NOME · Time Azul · 1 × 0", tremida curta da página e ~8 partículas. Vibração `[60,40,60]`.
- **Vitória:** mesma coreografia, com o fundo na **cor do time vencedor**, o título "AZUL VENCEU" e o subtítulo com o placar. Quando o time completa 3 vitórias seguidas, o subtítulo vira "3 vitórias seguidas · entram 2 times novos". Vibração `[80,50,80,50,160]`.
- **Empate:** fundo branco/cinza claro, "EMPATE", sem tremida e sem partículas. Dispara depois que o admin escolhe quem joga primeiro.
- Duração total de ~1,6s. Some sozinho ou antes, com um toque. Não bloqueia nada depois de sumir.
- **Fila de comemorações:** se o gol encerra a partida (modo 7e2), toca "GOL!" e em seguida "VENCEU". Comemorações não se sobrepõem.

### Movimento funcional

- **Botões:** `:active` com `scale(.96)` e volta com mola.
- **Entrada de itens novos:** a tela é redesenhada via `innerHTML` a cada ação. Por isso, um registro das chaves já desenhadas (ids de time e nomes de jogador) marca com a classe `.entrar` só o que é novo (fade + subir 12px, escalonado 40ms). Na primeira renderização da página, tudo entra escalonado uma vez.
- **Troca de partida:** o time que passa a estar em quadra (id novo nas posições 0/1) entra com `.entrar` + brilho rápido na faixa lateral.
- **Selo de gol:** aparece com "pop" (escala 0.4 → 1.25 → 1) quando o número muda.
- **Placar:** o número que mudou rola de baixo pra cima.
- **Cronômetro:** a barra de progresso anima por `transform: scaleX` a cada segundo, com transição linear. No último minuto, o número fica vermelho e pulsa (1s). Quando o tempo acaba, a tela pisca em vermelho enquanto a sirene toca.
- **Menu:** a gaveta sobe com mola (`translateY`) e o fundo escurece em fade. Ao trocar de aba, o indicador desliza até a pílula ativa e o conteúdo troca com fade.
- **Modais:** fade + `scale(.96 → 1)`.
- **Detalhes:** a estrela pula ao dar nota, o toggle Pago/Deve desliza, os avisos descem do topo e a bolinha de sincronização pulsa enquanto envia.

### Acessibilidade

Com `prefers-reduced-motion: reduce`: as comemorações viram só um fade do overlay (sem círculo, tremida ou partículas, ~1,2s), as entradas ficam só com fade, e o pulso, a tremida e as molas são desligados.

## 3. Gols por jogador e artilharia

### Estado (novos campos em `coletarEstado` / `aplicarEstado`)

- `golsJogadores: { [nome]: number }`: total de gols de cada jogador na pelada.
- `golsPartida: { [nome]: number }`: gols de cada jogador na partida atual.
- `ultimoEvento: { ts: number, tipo: 'gol'|'vitoria'|'empate', titulo: string, sub: string, cor: string } | null`.

Na leitura, estados antigos sem esses campos recebem `{}` / `null`.

### Regras

- `marcarGolJogador(indexTime, indexJogador)`: só para `indexTime` 0 ou 1. Chama `snapshotEstado()` e incrementa `golsA` ou `golsB`, `golsJogadores[nome]` e `golsPartida[nome]`. Depois aplica a mesma regra de encerramento que `marcarGol` tem hoje (modo 7e2, 2 gols). Em vez do `alert`, dispara a comemoração de gol e, se for o caso, a de vitória.
- `marcarGol(qualTime)`, `tirarGol(qualTime)` e `renderControleGols` **são removidos**.
- `golsA`/`golsB` continuam como contador do placar do time, mesmo que o jogador saia depois.
- `golsPartida` zera em `fimDeJogo`, `resolverEmpate`, `gerarSorteio` e `novaPelada`.
- `golsJogadores` zera em `gerarSorteio` e `novaPelada`, junto com as outras estatísticas.
- `editarJogador` também migra `golsJogadores` e `golsPartida` (soma no nome novo e apaga o antigo).
- `removerJogador` não mexe nos gols.
- `arquivarPelada` inclui `golsJogadores` no `resumo`. O cartão do Histórico mostra "Artilheiro: NOME (n gols)" quando houver.

### Relatório

Novo cartão "Artilheiro da pelada" (nome + n gols) e nova lista "Artilharia" (todos com ≥1 gol, ordem decrescente, barra proporcional). Os dois ficam logo depois de "Jogador mais vitorioso".

## 4. Comemoração sincronizada

- Ações locais de gol, vitória e empate gravam `ultimoEvento` com `ts = Date.now()` antes de `salvarEstado()`, e chamam `celebrar()` na hora.
- Variável local `ultimoEventoVisto` (ts).
  - Ao carregar (localStorage e o primeiro `select` da nuvem): `ultimoEventoVisto = estado.ultimoEvento?.ts || 0`. **Não comemora.**
  - No handler de tempo real: se `novo.ultimoEvento && novo.ultimoEvento.ts > ultimoEventoVisto`, atualiza `ultimoEventoVisto` e chama `celebrar(novo.ultimoEvento)`.
  - Na ação local, `ultimoEventoVisto` recebe o ts gerado, pra não comemorar duas vezes quando o eco da nuvem chegar.
- O Desfazer restaura um `ultimoEvento` mais antigo (ts menor), então não dispara comemoração.

## 5. Alertas

- **Viram comemoração:** "Fim de jogo! X venceu por…" (`marcarGol`) e "X completou 3 vitórias seguidas!" (`fimDeJogo`).
- **Continuam como estão:** validações (nome vazio, mínimo de 4), confirmações (`confirm` de saída, nova pelada e remover pagante), `prompt` de editar nome, aviso de 3ª partida ao fim do tempo, lotação de 20 atletas e mensagens de Pix e cobrança.

## Fora do escopo

- Separar o app em vários arquivos.
- Modo claro.
- Gol contra ou gol sem autor.
- Som novo.
- Mudanças na lógica da fila, no sorteio ou no Supabase além dos novos campos do estado.

## Verificação

Não há testes automatizados. A verificação será:

1. Checagem de sintaxe do `<script>` com Node (`new Function`).
2. Rodar o app no navegador e seguir o roteiro: cadastrar e sortear, marcar gols em jogadores (selo, placar, comemoração), vencer por 2 gols no modo 7e2 (GOL → VENCEU, fila gira), vencer no tempo, 3 vitórias seguidas, empate (modal → EMPATE), Desfazer depois de um gol (sem comemoração, placar e artilharia voltam), editar um jogador com gols, sair, adicionar jogador (entrada animada), menu e todas as abas, Relatório com artilharia, tela cheia no último minuto e Níveis (5 toques no subtítulo).
3. Duas abas abertas ao mesmo tempo: o gol marcado em uma comemora na outra. Recarregar a página não comemora.
4. Abrir um estado antigo (sem `golsJogadores` e afins) sem erros.
5. Emular `prefers-reduced-motion` no DevTools e conferir a versão reduzida.
