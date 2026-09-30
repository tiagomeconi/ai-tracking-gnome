# ADR-005 — Claude Code local usage como provider EXPERIMENTAL

## Status

Aceito.

## Contexto

A ficha `docs/providers/claude.md` concluiu que não existe API oficial para
a cota da assinatura de consumidor Claude (claude.ai/Claude Code) — a única
API documentada da Anthropic é para billing da API de desenvolvedor,
explicitamente indisponível para contas individuais.

O usuário pediu, mesmo assim, dados reais para Claude/ChatGPT/Gemini, desde
que a fonte fosse local (arquivos já escritos no disco pelo próprio
software oficial que o usuário roda) — nunca captura de cookies de sessão
web, prática proibida pela seção 2.1 do plano.

Investigação neste próprio ambiente de desenvolvimento (que roda Claude
Code) confirmou que o Claude Code grava transcripts JSONL em
`~/.claude/projects/<projeto>/<sessão>.jsonl` (e em
`.../subagents/agent-*.jsonl`), cada linha com `type: "assistant"` contendo
`message.usage` com `input_tokens`, `output_tokens`,
`cache_creation_input_tokens`, `cache_read_input_tokens` e um `timestamp`
ISO 8601 no nível superior do objeto. Este é um arquivo local legítimo,
escrito pelo próprio Claude Code oficial, não uma captura de sessão web.

Para ChatGPT e Gemini, nenhuma fonte local equivalente foi encontrada neste
ambiente: o Codex CLI tem uma pasta de configuração (`~/.codex`) mas nenhum
arquivo de cota/uso legível foi localizado nela, e o Gemini CLI não estava
sequer instalado. Implementar algo para eles exigiria inventar um formato
sem evidência, o que a seção 2.1/regra 5 do plano proíbe.

## Decisão

1. Implementar `ClaudeCodeLocalProvider`
   (`extension/lib/providers/claudeCodeLocal.js`), que varre
   `~/.claude/projects/**/*.jsonl` (via `Gio.File` assíncrono, sem bloquear
   a Shell) e soma tokens de mensagens dentro de uma janela rolling de 5h,
   usando `extension/lib/providers/claudeCodeLocalAggregate.js` (função
   pura, testada com Node) para o parsing/agregação.
2. O resultado **nunca inclui `limit` nem `percent`** — não há forma de
   saber, a partir desses arquivos, qual é o teto real da assinatura. O
   `UsageWindow` retornado tem `estimated: true`, `unit: 'tokens'`, e a UI
   mostra o valor bruto (ex.: "38.204 tokens") em vez de um percentual
   inventado.
3. `accountLabel` do `AIProviderUsage` é usado para deixar isso explícito na
   própria UI: "Estimativa local — não é a cota da assinatura claude.ai".
4. Classificação: **EXPERIMENTAL** (seção 2.1). ChatGPT e Gemini permanecem
   `UNAVAILABLE` — não implementados nesta entrega por falta de fonte
   local verificável.
5. GitHub Copilot (único `OFFICIAL_API`) continua adiado a pedido explícito
   do usuário.

## Consequências / Limitações

- Mede volume de tokens processados pelo **Claude Code** (CLI/agente),
  não o uso geral do chat claude.ai — são produtos diferentes dentro da
  mesma assinatura, e a UI não deve conflar os dois.
- O formato do JSONL não é documentado publicamente pela Anthropic; pode
  mudar sem aviso em uma atualização do Claude Code, quebrando o parser
  silenciosamente (linhas que não baterem com o formato esperado são
  ignoradas por `extractUsageFromLine`, então uma quebra de formato
  resultaria em `used: 0`/estado indisponível, não em erro visível — vale
  revisitar se isso for um problema na prática).
- **Não validado em runtime real** (GJS/GNOME Shell) neste ambiente —
  mesma limitação já registrada nos ADRs 001 e 004. A lógica de
  varredura/leitura de arquivos (`Gio.File`, `enumerate_children_async`)
  segue a API oficial documentada do GJS, mas precisa ser testada no
  sistema real do usuário.
- Este provider não usa `SecretStore` — não há credencial envolvida, só
  leitura de arquivos locais do próprio usuário.
