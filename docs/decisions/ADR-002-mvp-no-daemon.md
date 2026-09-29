# ADR-002 — Extensão sem serviço local separado (MVP)

## Status

Aceito.

## Contexto

A seção 5.3 do plano permite iniciar sem daemon/serviço separado, desde que
a integração permaneça desacoplada e os providers respeitem um contrato que
permita migração futura para um processo separado via D-Bus/IPC.

## Decisão

Para o MVP, `ProviderManager`, `Normalizer`, `Cache` e os providers (incluindo
`MockProvider`) rodam **dentro do processo da extensão GNOME Shell**, em JS
puro, sem TypeScript e sem etapa de build. Não há processo Node/serviço
externo nesta fase.

Justificativa:

- Reduz drasticamente a complexidade inicial (sem IPC, sem lifecycle de
  processo externo, sem serialização).
- GJS não executa TypeScript nativamente; introduzir TS exigiria um passo de
  build só para a extensão, aumentando a superfície de falha sem benefício
  claro no MVP.
- O contrato `UsageProvider` (ver `extension/lib/providers/provider.js`) é
  independente de onde o provider roda, então a migração futura para um
  serviço separado (Fase 4) não exige reescrever a lógica de domínio — apenas
  mover `ProviderManager` para outro processo e trocar a chamada direta por
  D-Bus/IPC.

## Consequências

- Chamadas de rede feitas pelos providers reais (Fase 6+) rodam no thread
  principal do GNOME Shell; é obrigatório usar APIs assíncronas (`Soup`,
  `Gio`) para não bloquear a Shell (ver risco R03 no plano).
- Se no futuro a Fase 4 for confirmada como necessária (ex.: por limitação de
  bloqueio da Shell ou necessidade de rodar fora do processo da Shell), este
  ADR deve ser superado por um ADR-003 (IPC/D-Bus).
