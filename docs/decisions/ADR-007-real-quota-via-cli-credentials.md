# ADR-007 — Cota real via credenciais dos CLIs oficiais (supera parte do ADR-005/006)

## Status

Aceito. Substitui a abordagem de contagem local de tokens dos ADR-005 e
ADR-006 (que ficam como registro histórico da decisão anterior).

## Contexto

Os ADR-005 e ADR-006 implementaram uma estimativa de **volume de tokens
processados localmente**, por não haver API oficial documentada para a
cota real da assinatura. O usuário apontou, corretamente, que os próprios
CLIs (Claude Code, Codex) conseguem mostrar a cota real (`/usage`,
`/status`) porque autenticam diretamente com o backend do provedor — e
perguntou se dava para fazer o mesmo.

O usuário indicou o projeto open-source
[tokidachi](https://github.com/Gaalbu/tokidachi) (MIT, Gabriel
Albuquerque), que resolve exatamente esse problema para GNOME Shell. A
inspeção do código-fonte dele (`ClaudeProvider.java`, `CodexProvider.java`,
`UsageParsers.java`) revelou o mecanismo real:

- **Claude**: o Claude Code CLI grava um token OAuth em
  `~/.claude/.credentials.json` (`claudeAiOauth.accessToken`), criado pelo
  próprio `claude auth login`. Reusar esse token para chamar
  `GET https://api.anthropic.com/api/oauth/usage` (header
  `anthropic-beta: oauth-2025-04-20`) retorna o percentual real das
  janelas de cota (`five_hour`, `seven_day`, `seven_day_sonnet`,
  `seven_day_opus`), cada uma com `utilization`/`used_percentage` e
  `resets_at`.
- **Codex**: rodar `codex app-server --stdio` (o próprio Codex CLI, em modo
  servidor JSON-RPC sobre stdio) e chamar o método
  `account/rateLimits/read` retorna `rateLimitsByLimitId`, com janelas
  `primary`/`secondary` por bucket, cada uma com `usedPercent` e
  `resetsAt`, além de `individualLimit.remainingPercent`.

## Por que isto NÃO viola a seção 2.1 do plano

A seção 2.1 proíbe **capturar cookies/sessões privadas de aplicações web**
como solução aceitável. O mecanismo acima é categoricamente diferente:

- O token é criado pelo **próprio login oficial do CLI** (`claude auth
  login` / `codex login`), não extraído de um navegador ou de uma sessão
  web capturada às escondidas.
- É lido do mesmo arquivo local que o próprio CLI usa, com as mesmas
  permissões de arquivo do usuário — não há bypass de autenticação nem
  engenharia reversa de mecanismo de login.
- Para o Codex, nem sequer lemos uma credencial diretamente: rodamos o
  próprio binário `codex` (que já está autenticado) e conversamos com ele
  via um protocolo JSON-RPC que parece existir justamente para permitir
  integração de ferramentas externas (editores, etc.).

O que **é** verdade, e por isso a classificação continua `EXPERIMENTAL`:
nem o endpoint `api.anthropic.com/api/oauth/usage` nem o método JSON-RPC
`account/rateLimits/read` são documentados publicamente como API estável
pela Anthropic/OpenAI. Podem mudar de formato ou ser descontinuados sem
aviso.

## Decisão

1. `ClaudeSubscriptionProvider` (`extension/lib/providers/claudeSubscription.js`)
   substitui `ClaudeCodeLocalProvider`. Lê o token via
   `Gio.File.load_contents_async` (nunca loga o valor) e faz a chamada
   HTTP via `Soup.Session` (libsoup3).
2. `CodexSubscriptionProvider` (`extension/lib/providers/codexSubscription.js`)
   substitui `CodexLocalProvider`. Spawna `codex app-server --stdio` via
   `Gio.Subprocess` e fala JSON-RPC pela stdin/stdout do processo.
3. Os parsers (`claudeSubscriptionParser.js`, `codexSubscriptionParser.js`)
   são funções puras, testadas com Node, e produzem `UsageWindow` com
   `percent` real e `estimated: false` — diferente da geração anterior, que
   nunca tinha `percent`/`limit` e sempre marcava `estimated: true`.
4. Os arquivos da geração anterior (`claudeCodeLocal*.js`, `codexLocal*.js`)
   foram removidos — a nova abordagem é estritamente melhor (percentual
   real da cota, não estimativa de volume).
5. Atribuição: o formato de requisição/resposta de ambos os endpoints foi
   verificado a partir do código-fonte do projeto tokidachi (MIT), não
   inventado. Isto está documentado nos comentários dos arquivos.

## Consequências / Limitações

- Se o usuário nunca rodou `claude auth login`, `isConfigured()` retorna
  `false` e o `ProviderManager` já converte isso em `auth_required`
  (nenhuma mudança de contrato necessária).
- Se o endpoint/protocolo mudar de formato numa atualização futura dos
  CLIs, os parsers retornam lista vazia de janelas e o provider reporta
  `PROVIDER_INVALID_RESPONSE` — não trava a extensão, mas para de mostrar
  dado até alguém atualizar o parser.
- **Não validado em runtime real** (GJS/GNOME Shell) neste ambiente — a
  primeira tentativa de implementação (ver commits anteriores) já revelou
  bugs reais de promisify que só apareceram testando no sistema real do
  usuário; esta nova versão precisa do mesmo ciclo de validação antes de
  ser considerada estável.
- Nenhuma credencial é escrita, logada ou persistida em outro lugar pela
  extensão — apenas lida em memória para montar o header `Authorization`
  de uma única requisição.
