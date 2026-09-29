# AI Usage Monitor for GNOME

Extensão para GNOME Shell que centraliza, em um único indicador na barra
superior, o consumo/cota de uso das assinaturas de IA configuradas pelo
usuário (ChatGPT, Claude, Gemini, Copilot, ...). Monitora **consumo/cota**,
não gastos monetários.

O plano de execução completo (requisitos, arquitetura, fases, backlog,
riscos) está em [`AI_Tracking_PLAN.md`](./AI_Tracking_PLAN.md) — é a fonte
de verdade operacional deste projeto.

## Status atual

Fase 1 (skeleton da extensão) e Fase 2 (modelo de domínio + MockProvider)
implementadas com dados simulados. Ainda **não há providers reais** — ver
seção 7 do plano e `docs/providers/` (pendente de pesquisa).

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

## Estrutura

```text
extension/          extensão GNOME Shell (GNOME 45+, ver ADR-001)
├── extension.js     entry point (enable/disable)
├── indicator.js      indicador da top bar + popup
├── menu.js            construção dos itens do popup
├── lib/
│   ├── types.js           modelo de domínio (JSDoc) + thresholds
│   ├── normalizer.js      cálculo de percent/remaining/estado visual
│   ├── format.js          formatação de tempo restante
│   ├── cache.js           cache em memória com detecção de stale
│   ├── providerManager.js orquestra providers, isola falhas
│   └── providers/
│       ├── provider.js    contrato UsageProvider
│       └── mock.js        MockProvider (todos os cenários da seção 6.1)
└── stylesheet.css

docs/
├── decisions/       ADRs
└── providers/       fichas de pesquisa por provider (seção 7, pendente)

tests/               testes de domínio, rodados com `node --test`
```

## Próximos passos (ver seção 12/16 do plano)

- Rodar manualmente os critérios de aceite de lifecycle da Fase 1.
- Fase 3: scheduler completo com retry/backoff.
- Fase 5: Secret Service/GNOME Keyring para credenciais.
- Fase 0 (pesquisa): produzir fichas em `docs/providers/` para
  ChatGPT/OpenAI, Claude/Anthropic, Gemini, Copilot antes de qualquer
  provider real (Fase 6).
