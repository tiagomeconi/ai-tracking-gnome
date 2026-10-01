# Guia de desenvolvimento

Este documento é para quem vai mexer no código. Se você só quer instalar e
usar a extensão, veja o [`README.md`](../README.md).

O plano de execução completo (requisitos, arquitetura, fases, backlog,
riscos) está em [`AI_Tracking_PLAN.md`](../AI_Tracking_PLAN.md) — é a fonte
de verdade operacional deste projeto.

## Status atual

Fases 1 (skeleton da extensão), 2 (modelo de domínio + MockProvider), 3
(cache, scheduler, timeout, retry com backoff), 5 (secret storage) e 8
(preferências) implementadas. Fase 0 de pesquisa de providers concluída —
ver `docs/providers/`. A Fase 4 (serviço/IPC separado) foi conscientemente
adiada (ADR-002): tudo roda no processo da extensão.

Claude, Codex e Antigravity usam a cota **real** da assinatura
(EXPERIMENTAL, ADR-007/ADR-008 — reaproveita o login OAuth que os próprios
CLIs oficiais já gravam, seja em arquivo ou no Secret Service). GitHub
Copilot segue com `MockProvider`, marcado "(em desenvolvimento)" na UI.

### Resultado da pesquisa de providers (seção 7 do plano)

| Provider | Classificação | Observação |
|---|---|---|
| ChatGPT / OpenAI (chat geral) | `UNAVAILABLE` | Sem API oficial para cota da assinatura de consumidor. |
| Claude / Anthropic (assinatura) | `UNAVAILABLE`, mas implementado via ADR-007 | API oficial de billing é só para a API de devs; usamos o endpoint interno que o próprio Claude Code chama para `/usage`. |
| Codex CLI | `UNAVAILABLE`, mas implementado via ADR-007 | Sem API pública; usamos `codex app-server --stdio` (JSON-RPC), a mesma interface que o próprio CLI usa. |
| Antigravity CLI (Gemini) | `UNAVAILABLE`, mas implementado via ADR-008 | Sem API pública; lemos o token OAuth que o próprio `agy` grava no Secret Service e chamamos o mesmo backend interno (`cloudcode-pa.googleapis.com`) que o `/usage` do CLI usa. Não cobre o contador do Gemini App web (gemini.google.com), que continua `UNAVAILABLE` sem exceção (ver `docs/providers/gemini.md`). |
| GitHub Copilot | `OFFICIAL_API` | Único com API oficial de billing/usage, ainda não implementado (adiado). |

Fichas completas (fonte, autenticação, riscos, docs oficiais) em
[`docs/providers/`](./providers/).

### Limitações conhecidas

- Testado principalmente via `npm test` (Node), que cobre a camada de
  domínio (`extension/lib/**`). A camada de UI GNOME foi validada
  manualmente no sistema real do mantenedor (não há CI de UI).
- Suporte a GNOME 42–44 ainda não implementado — ver
  [`docs/decisions/ADR-001-gnome-versions.md`](./decisions/ADR-001-gnome-versions.md).
- Sem serviço/daemon separado (ADR-002).
- `SecretStore`/`LibsecretBackend` (Fase 5) seguem a API oficial do
  libsecret via GJS, mas hoje nenhum provider a utiliza (Claude/Codex
  reusam o token que os próprios CLIs já gravam, sem SecretStore próprio).
- Endpoints/protocolos usados por `ClaudeSubscriptionProvider` e
  `CodexSubscriptionProvider` não são documentados publicamente pela
  Anthropic/OpenAI — podem mudar de formato sem aviso. Ver ADR-007.

## Testes de domínio (Node)

```bash
npm test
```

## Instalar localmente para desenvolvimento

```bash
./scripts/install.sh
```

Depois:

- **Wayland:** faça logout/login e habilite com
  `gnome-extensions enable ai-usage-monitor@prohound.io` (ou pelo app
  Extensões).
- **X11:** recarregue a Shell com `Alt+F2`, `r`, `Enter`, sem precisar
  fazer logout.

Verifique os critérios de aceite da Fase 1 (seção 12 do plano):
extensão habilita sem erro, indicador aparece, popup abre/fecha, extensão
desabilita limpamente, sem timers/signals órfãos após habilitar/desabilitar
repetidamente.

## Preferências (Fase 8)

O schema do GSettings já vem compilado
(`extension/schemas/gschemas.compiled`). Se você editar o `.gschema.xml`,
recompile antes de testar:

```bash
glib-compile-schemas extension/schemas/
```

Abra as preferências pelo botão de engrenagem no rodapé do popup, ou via:

```bash
gnome-extensions prefs ai-usage-monitor@prohound.io
```

## Ícones

Coloque os ícones em `extension/icons/<nome>.{svg,png}` (svg tem
prioridade se os dois existirem):

- `claude.{svg,png}`, `codex.{svg,png}`, `gemini.{svg,png}`,
  `copilot.{svg,png}` — logo de cada provider, mostrado à esquerda do
  nome no popup.
- `logo.{svg,png}` — logo da própria extensão, mostrada no indicador da
  barra superior.

Se o arquivo não existir, a extensão cai num ícone simbólico genérico em
vez de quebrar.

## Estrutura

```text
extension/          extensão GNOME Shell (GNOME 45+, ver ADR-001)
├── extension.js     entry point (enable/disable)
├── prefs.js         janela de preferências (GTK4/Adwaita, Fase 8)
├── schemas/         GSettings (disabled-providers, ver prefs.js)
├── icons/           ícones opcionais por provider + logo
├── indicator.js      indicador da top bar + popup
├── menu.js            construção dos itens do popup
├── lib/
│   ├── types.js           modelo de domínio (JSDoc) + thresholds
│   ├── normalizer.js      cálculo de percent/remaining/estado visual
│   ├── format.js          formatação de tempo restante/decorrido
│   ├── cache.js           cache em memória com detecção de stale
│   ├── retry.js           timeout + retry controlado com backoff
│   ├── secrets.js         SecretStore (Secret Service/GNOME Keyring)
│   ├── providerManager.js orquestra providers, isola falhas, aplica retry
│   └── providers/
│       ├── provider.js               contrato UsageProvider
│       ├── mock.js                   MockProvider (cenários da seção 6.1)
│       ├── claudeSubscription.js         provider real EXPERIMENTAL (ADR-007)
│       ├── claudeSubscriptionParser.js   parser puro (testado)
│       ├── codexSubscription.js          provider real EXPERIMENTAL (ADR-007)
│       └── codexSubscriptionParser.js    parser puro (testado)
└── stylesheet.css

docs/
├── DEVELOPMENT.md   este arquivo
├── decisions/       ADRs
└── providers/       fichas de pesquisa por provider (seção 7)

scripts/
├── install.sh       symlink + instruções de habilitar
└── uninstall.sh     remove o symlink

tests/               testes de domínio, rodados com `node --test`
```

## Próximos passos (ver seção 12/16 do plano)

- Suporte a GitHub Copilot real (único `OFFICIAL_API`), atualmente adiado.
- `AntigravitySubscriptionProvider` já foi validado de ponta a ponta num
  GNOME Shell real (ADR-008, adendo de validação): achou e corrigiu um
  erro real de nome de método GJS (`password_lookupv` → `password_lookup`,
  também corrigido em `lib/secrets.js`) e confirmou dado real vindo da
  Cloud Code API.
- Um `St.ScrollView` customizado em volta da lista do popup foi tentado
  (providers como Antigravity podem ter 15-20+ janelas, uma por modelo,
  que sem conter isso estouram a tela) e causou bugs reais em sequência
  num GNOME Shell real (seta de atalho cortada pela barra de rolagem,
  trava ao combinar com um dropdown recolhido). Removido o scrollview
  por completo, o problema real ficou claro: sem *nenhum* limite de
  altura, o rodapé (botão de atualizar/preferências) saía fisicamente da
  tela em listas grandes — não era o scrollview capturando o clique
  errado, era o botão nem estar mais na área visível. A solução final foi
  reintroduzir só o dropdown recolhido (`PopupSubMenuMenuItem`, sem
  scrollview nenhum): providers com mais de 4 janelas (`menu.js`,
  `COLLAPSE_WINDOWS_THRESHOLD`) mostram um resumo clicável em vez de todas
  as linhas, o que mantém o popup sempre curto o bastante pra caber na
  tela. Confirmado pelo usuário num GNOME Shell real.
- Projeção de ritmo sustentável (`computeBudgetProjection` em
  `lib/normalizer.js`, `formatBudgetProjection` em `lib/format.js`):
  mostra quanto % ainda dá pra gastar por hora/dia até cada janela
  renovar, derivado só de `percent`+`resetsAt` já existentes (sem fonte de
  dado nova). Confirmado funcionando num GNOME Shell real.
- `ClaudeSubscriptionProvider` estava recebendo 429 (rate limit) do
  endpoint `api.anthropic.com/api/oauth/usage` a cada ciclo de polling de
  5 minutos, nunca se recuperando — descoberto via log real
  (`ClaudeSubscriptionProvider: rate limited`). Corrigido com um cooldown
  que respeita `Retry-After` (ou 30 min padrão) antes de tentar de novo —
  ver adendo em ADR-007. Ainda não confirmado se o cooldown resolve de
  fato (precisa esperar o próximo ciclo pra ver se para de dar 429).
- Histórico local + gráfico de tendência (backlog P2): `lib/history.js`
  (parsing/retenção, funções puras) e `lib/historyChart.js`
  (`aggregateDailyMax`/`layoutBarChart`, funções puras) são testados com
  Node. `lib/historyStore.js` (I/O de arquivo JSONL em
  `~/.cache/ai-usage-monitor/history.jsonl`, retenção de 30 dias/20k
  amostras) depende de GJS. `indicator.js` grava um snapshot por janela a
  cada refresh com status `ok`; `prefs.js` ganhou uma aba "Estatísticas"
  com um seletor de série e um **gráfico de barras por dia** (pico do dia,
  colorido por severidade — mesmas cores do popup) desenhado com
  `Gtk.DrawingArea`/Cairo.

  O gráfico passou por duas versões: a primeira era uma linha contínua
  ligando todo snapshot — o usuário apontou corretamente que isso ficaria
  cada vez mais apertado/ilegível conforme o histórico acumulasse dias
  (uma janela de 5h reseta várias vezes por dia), e que "somar" os
  percentuais de cada checagem não tem significado (não é uma métrica
  cumulativa). Trocado por barras por dia com o **pico** do dia, que
  continua fazendo sentido independente de quantos resets aconteceram. A
  linha original (com eixos, rótulos de texto via `setFontSize`/
  `showText`, e tooltip via `query-tooltip`) chegou a ser **confirmada
  funcionando pelo usuário** num GNOME Shell real antes da troca; a versão
  em barras ainda não foi validada ao vivo — é a primeira vez que este
  projeto desenha retângulos/texto via Cairo ou usa `query-tooltip`, e já
  teve mais de um caso de nome de método GJS que parecia certo e não era
  (ver o caso de `password_lookupv` acima).
- Notificação de limite (backlog P2): `lib/thresholdNotifier.js`
  (`computeThresholdEvents`, função pura, testada) decide quando uma
  janela cruza atenção/alto/crítico pela primeira vez (não repete a cada
  refresh parado no mesmo nível; reseta quando a janela reseta).
  `indicator.js` dispara a notificação de verdade via `Main.notify` — a
  API mais simples e estável de notificação do GNOME Shell, escolhida de
  propósito em vez de `MessageTray.Source`/`Notification` diretos (cuja
  assinatura mudou entre versões do GNOME, e esse projeto já levou mais
  de uma rasteira de API GJS que parecia certa). Desligável em
  Preferências (`notifications-enabled` no gschema). Ainda não validado
  num GNOME Shell real.
- Avaliar suporte a GNOME 42–44 (ADR-001).
- Validar `SecretStore`/`LibsecretBackend` contra um Secret Service real,
  caso algum provider futuro precise de credencial própria.
