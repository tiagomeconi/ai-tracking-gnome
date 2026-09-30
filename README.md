# AI Usage Monitor for GNOME

Extensão para GNOME Shell que centraliza, em um único indicador na barra
superior, o consumo/cota de uso das assinaturas de IA configuradas pelo
usuário (ChatGPT, Claude, Gemini, Copilot, ...). Monitora **consumo/cota**,
não gastos monetários.

O plano de execução completo (requisitos, arquitetura, fases, backlog,
riscos) está em [`AI_Tracking_PLAN.md`](./AI_Tracking_PLAN.md) — é a fonte
de verdade operacional deste projeto.

## Status atual

Fases 1 (skeleton da extensão), 2 (modelo de domínio + MockProvider), 3
(cache, scheduler, timeout, retry com backoff) e 5 (secret storage)
implementadas. Fase 0 de pesquisa de providers concluída — ver
`docs/providers/`. A Fase 4 (serviço/IPC separado) foi conscientemente
adiada (ADR-002): o MVP roda tudo no processo da extensão. Passada de
UI/UX (seção 10) aplicada: estado nunca só por cor, mensagens de erro
acionáveis, nomes acessíveis e foco visível no botão de refresh.

**Claude e Codex já usam a cota REAL da assinatura** (EXPERIMENTAL,
ADR-007 — reaproveita o login OAuth que os próprios CLIs oficiais já
gravam) — Gemini/Copilot seguem com `MockProvider`. Fase 8 (Preferências,
RF-05) implementada: botão de engrenagem no rodapé do popup abre uma
janela GTK/Adwaita para ocultar/mostrar providers individualmente.

### Resultado da pesquisa de providers (seção 7 do plano)

| Provider | Classificação | Observação |
|---|---|---|
| ChatGPT / OpenAI | `UNAVAILABLE` | Sem API oficial para cota da assinatura de consumidor; só existe API de billing por token da API para devs. |
| Claude / Anthropic | `UNAVAILABLE` | Idem — Usage & Cost Admin API é explicitamente sobre a API para devs, indisponível para contas individuais. |
| Gemini / Google | `UNAVAILABLE` | Idem — rate limits do AI Studio/Vertex são sobre a API para devs; a UI do app Gemini não tem API. |
| GitHub Copilot | `OFFICIAL_API` | Único com API oficial de billing/usage (`/users/{username}/settings/billing/{premium_request,ai_credit}/usage`). Unidade atual ("AI credits") é monetária — compatível com `UsageUnit: "credits"` do modelo, desde que apresentada como cota, não como gasto (seção 1.1). |

Fichas completas (fonte, autenticação, riscos, docs oficiais) em
[`docs/providers/`](./docs/providers/). **Nenhum provider real foi
implementado ainda** — isto é só a pesquisa exigida antes da Fase 6.
Copilot é o candidato mais forte para "provider real #1".

### Limitações conhecidas desta entrega

- Testada apenas via `npm test` (Node), que cobre a camada de domínio
  (`extension/lib/**`). A camada de UI GNOME (`indicator.js`, `menu.js`,
  `extension.js`) **não foi validada em runtime real**, pois este ambiente
  de desenvolvimento não possui GNOME Shell instalado. Os critérios de
  aceite de lifecycle (enable/disable, seção 12 do plano) precisam ser
  verificados manualmente antes de considerar a Fase 1 concluída.
- Suporte a GNOME 42–44 ainda não implementado — ver
  [`docs/decisions/ADR-001-gnome-versions.md`](./docs/decisions/ADR-001-gnome-versions.md).
- Sem serviço/daemon separado nesta fase (decisão registrada em
  [`docs/decisions/ADR-002-mvp-no-daemon.md`](./docs/decisions/ADR-002-mvp-no-daemon.md)).
- `SecretStore`/`LibsecretBackend` (Fase 5) seguem a API oficial documentada
  do libsecret via GJS, mas **não foram exercitados contra um Secret
  Service/GNOME Keyring real** — este sandbox não tem sessão D-Bus
  disponível. Validar manualmente antes de usar com um provider real. Ver
  [`docs/decisions/ADR-004-secret-storage.md`](./docs/decisions/ADR-004-secret-storage.md).

## Desenvolvimento

### Testes de domínio (Node)

```bash
npm test
```

### Instalar a extensão localmente para testar no GNOME Shell

```bash
ln -s "$(pwd)/extension" ~/.local/share/gnome-shell/extensions/ai-usage-monitor@prohound.io
```

Depois:

- **Wayland:** faça logout/login e habilite a extensão com
  `gnome-extensions enable ai-usage-monitor@prohound.io` (ou pelo app
  Extensões).
- **X11:** pode recarregar a Shell com `Alt+F2`, `r`, `Enter`, sem precisar
  fazer logout.

Verifique os critérios de aceite da Fase 1 (seção 12 do plano):
extensão habilita sem erro, indicador aparece, popup abre/fecha, extensão
desabilita limpamente, sem timers/signals órfãos após habilitar/desabilitar
repetidamente.

### Preferências (Fase 8)

O schema do GSettings já vem compilado (`extension/schemas/gschemas.compiled`).
Se você editar o `.gschema.xml`, recompile antes de testar:

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
├── icons/           ícones opcionais por provider + logo (ver seção acima)
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
├── decisions/       ADRs
└── providers/       fichas de pesquisa por provider (seção 7, pendente)

tests/               testes de domínio, rodados com `node --test`
```

## Próximos passos (ver seção 12/16 do plano)

- Rodar manualmente os critérios de aceite de lifecycle da Fase 1 e da
  Fase 3 (popup abre com cache sem chamada de rede, refresh manual não
  dispara tempestade de requests, falha de provider isolada).
- Validar `SecretStore`/`LibsecretBackend` contra um Secret Service real
  (GNOME Keyring rodando de verdade), fora deste sandbox.
- Claude e Codex agora usam providers reais **EXPERIMENTAL**
  (`ClaudeSubscriptionProvider`/`CodexSubscriptionProvider`, ADR-007):
  reaproveitam o login OAuth que os próprios CLIs (`claude auth login` /
  `codex login`) já gravam em disco para consultar a cota **real** da
  assinatura (percentual de verdade, não estimativa) — abordagem
  verificada a partir do projeto open-source
  [tokidachi](https://github.com/Gaalbu/tokidachi) (MIT). Endpoint/
  protocolo não documentados publicamente, então a classificação continua
  `EXPERIMENTAL`. Validar em runtime real.
- Gemini segue em Mock — Antigravity CLI investigado (banco de conversas +
  arquivo de estado), sem nenhum campo de token/cota encontrado. Ver
  adendo em `docs/providers/gemini.md`. Continua `UNAVAILABLE`.
- Fase 6 (GitHub Copilot, único `OFFICIAL_API`): adiado a pedido do
  usuário.
