# ADR-006 — Codex local usage como provider EXPERIMENTAL

## Status

Aceito.

## Contexto

A ficha `docs/providers/chatgpt.md` concluiu que não existe API oficial de
cota de assinatura de consumidor para ChatGPT — só o comando interativo
`/status` do Codex CLI mostra percentuais de janela, sem arquivo/endpoint
por trás documentado.

Investigação da instalação real do Codex CLI do usuário
(`sqlite3 ~/.codex/*.sqlite ".schema"`, sem ler dados/conversas) encontrou:

- `state_5.sqlite` → tabela `threads`, com coluna `tokens_used INTEGER` e
  `updated_at_ms INTEGER` por thread.
- `goals_1.sqlite` → tabela `thread_goals`, com colunas `token_budget` e
  `tokens_used`, e um enum de status que inclui `'usage_limited'` e
  `'budget_limited'`.

`token_budget`/`thread_goals` parecem ser um orçamento de tokens por
thread/tarefa (parte de um sistema de "goals" do Codex), não o limite geral
da assinatura/conta. Sem confirmação oficial do que esse número representa,
tratá-lo como a cota real da assinatura violaria a regra do plano de não
inventar equivalência entre métricas diferentes.

## Decisão

1. Implementar `CodexLocalProvider`
   (`extension/lib/providers/codexLocal.js`), que consulta
   `~/.codex/state_5.sqlite` via o binário `sqlite3` (subprocesso,
   `-readonly`, sem dependência de binding GI de SQLite) e soma
   `tokens_used` de threads atualizadas numa janela rolling de 5h (mesma
   janela mencionada na ficha original para `codex /status`).
2. **Não usa `token_budget`** como `limit` — o significado exato desse
   campo não foi confirmado (parece ser por-tarefa, não por-conta). O
   resultado nunca inclui `limit`/`percent`, sempre `estimated: true`.
3. Se o binário `sqlite3` não estiver instalado, ou o arquivo não existir,
   o provider reporta `unavailable`/ausência de dados graciosamente — nunca
   trava a extensão.
4. Classificação: **EXPERIMENTAL** (seção 2.1). Depende de um schema
   interno não documentado publicamente pela OpenAI; pode quebrar
   silenciosamente numa atualização do Codex (linhas fora do formato
   esperado são ignoradas por `aggregateThreadTokens`).

## Consequências / Limitações

- Mede tokens de **threads do Codex CLI**, não o uso geral do chat ChatGPT
  — produtos diferentes dentro da mesma conta OpenAI.
- Depende do binário `sqlite3` estar no PATH do usuário (comum em sistemas
  de desenvolvimento, não garantido em todo desktop Linux).
- Não validado em runtime real (GJS/GNOME Shell) neste ambiente — mesma
  limitação já registrada nos ADRs 001, 004 e 005.
- Se a OpenAI reestruturar o schema do SQLite numa atualização do Codex,
  a consulta pode passar a retornar vazio silenciosamente; vale monitorar.
