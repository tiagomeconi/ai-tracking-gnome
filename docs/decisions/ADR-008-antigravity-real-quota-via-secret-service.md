# ADR-008 — Cota real do Antigravity via Secret Service (estende o ADR-007 para Gemini)

## Status

Aceito.

## Contexto

O ADR-005 (adendo de 2026-09-29, `docs/providers/gemini.md`) havia
classificado Gemini/Antigravity como `UNAVAILABLE`: a investigação do
Antigravity CLI encontrado na máquina do usuário (`~/.gemini/antigravity-cli`)
não achou nenhum arquivo local de cota/uso — só um blob binário opaco
(`raw_summary`) sem schema conhecido.

Pesquisa adicional revelou que esse produto investigado era uma versão
antiga/local. Existe um produto oficial diferente, também do Google,
**Antigravity CLI** (`antigravity.google`, binário `agy`), com um comando
`/usage` (alias `/quota`) que consulta o backend real da conta. A
documentação oficial (`antigravity.google/docs/cli/install`) afirma que ele
autentica via OAuth de conta Google e guarda o token no keyring nativo do
sistema operacional (Secret Service/D-Bus no Linux), não em um arquivo de
credenciais em texto puro.

O projeto open-source
[antigravity-usage](https://github.com/skainguyen1412/antigravity-usage)
(MIT) cumpre para o Antigravity o mesmo papel que o tokidachi cumpriu para
Claude/Codex no ADR-007: reverte de forma aberta o protocolo real usado
pelo próprio `/usage`. Seu código-fonte (`src/google/cloudcode.ts`,
`src/google/parser.ts`) mostra que o Antigravity CLI chama, com o Bearer
token OAuth da conta logada:

- `POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`
- `POST https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`

E a resposta traz, por modelo, `quotaInfo.remainingFraction` e
`quotaInfo.resetTime` — percentual real de cota, não estimativa.

Confirmação manual nesta máquina (com autorização explícita do usuário,
`secret-tool search --all service gemini`) mostrou que o item do
Antigravity CLI no keyring usa o schema genérico
`org.freedesktop.Secret.Generic`, com atributos `service=gemini` e
`username=antigravity`, e o segredo é um JSON
`{"token":{"access_token":...,"refresh_token":...,"expiry":...},"email":...}`.

**Nota de segurança do processo**: a primeira tentativa de confirmar isso
usou `secret-tool search --all`, que — diferente do esperado — imprime o
valor do segredo (o token OAuth completo) em texto puro, não só os
atributos/metadados do item. O token ficou exposto no transcript desta
sessão; o usuário revogou o grant OAuth em
`myaccount.google.com/permissions` e relogou no Antigravity CLI antes de
qualquer uso do dado exposto. Nenhum código deste projeto usa
`secret-tool search --all`; a leitura em produção é feita via
`Secret.password_lookupv` (libsecret), que devolve só o item pedido, sem
listar/imprimir outros segredos.

## Por que isto NÃO viola a seção 2.1 do plano

O mecanismo é o mesmo já validado no ADR-007: o token é criado pelo
**próprio login oficial do Antigravity CLI** (`agy`), não extraído de um
navegador nem de uma sessão web capturada às escondidas. É lido do mesmo
keyring do sistema que o próprio CLI usa, com as mesmas permissões do
usuário — não há bypass de autenticação nem engenharia reversa do
mecanismo de login em si, só do formato de um endpoint interno que o
próprio produto oficial já chama.

A diferença em relação a Claude/Codex é só o meio de armazenamento: um
arquivo (`~/.claude/.credentials.json`) vira um item de Secret Service —
por isso a leitura usa `Secret.password_lookupv` com
`Secret.SchemaFlags.DONT_MATCH_NAME` (o item foi escrito diretamente via
Secret Service pelo Antigravity CLI, não por libsecret com um
`Secret.Schema` nomeado, então o nome do schema não deve ser exigido no
lookup).

O que **é** verdade, e por isso a classificação continua `EXPERIMENTAL`:
nem `/v1internal:loadCodeAssist` nem `/v1internal:fetchAvailableModels`
são documentados publicamente pelo Google como API estável. Podem mudar de
formato ou ser descontinuados sem aviso.

## Decisão

1. `AntigravitySubscriptionProvider`
   (`extension/lib/providers/antigravitySubscription.js`) substitui o
   `MockProvider` usado até então para `gemini`. Lê o access token via
   `Secret.password_lookup` (nunca loga o valor) e faz as duas chamadas
   HTTP via `Soup.Session` (libsoup3), no mesmo estilo de
   `claudeSubscription.js`.
2. O parser (`antigravitySubscriptionParser.js`) é uma função pura, testada
   com Node, e produz um `UsageWindow` por modelo (`percent` real,
   `estimated: false`) mais uma janela opcional de créditos de prompt
   mensais (`unit: 'credits'`), filtrando modelos internos
   (`chat_*`/`tab_*`/`rev*`/imagem/mquery/lite) como o próprio
   antigravity-usage faz.
3. **Sem refresh de token**: se o access token estiver expirado, a API
   retorna 401/403 e o provider reporta `auth_required` — o usuário só
   precisa abrir o Antigravity CLI normalmente para que ele renove o token
   sozinho no keyring. Implementar refresh aqui exigiria um
   client_id/client_secret OAuth próprio do Antigravity CLI oficial, que
   não temos (o client_id/secret encontrados em `antigravity-usage` são do
   próprio app de terceiros, vinculados ao refresh_token dele, não ao do
   CLI oficial).
4. `prefs.js` remove a flag `dev: true` de `gemini` — deixou de ser dado de
   demonstração.
5. Atribuição: o formato de requisição/resposta dos dois endpoints foi
   verificado a partir do código-fonte do projeto antigravity-usage (MIT),
   não inventado. Isto está documentado nos comentários do arquivo.

## Consequências / Limitações

- Se o usuário nunca logou no Antigravity CLI (`agy`) nesta máquina,
  `isConfigured()` retorna `false` e o `ProviderManager` converte isso em
  `auth_required`.
- Se o access token estiver expirado e o usuário não tiver aberto o
  Antigravity CLI recentemente para renová-lo, o provider reporta
  `auth_required` até o CLI ser reaberto — comportamento aceito como
  trade-off para não implementar refresh OAuth próprio (ver item 3).
- Se o formato dos endpoints mudar numa atualização futura do backend do
  Google, o parser retorna lista vazia de janelas e o provider reporta
  `PROVIDER_INVALID_RESPONSE`.
- Nenhuma credencial é escrita, logada ou persistida em outro lugar pela
  extensão — apenas lida em memória para montar o header `Authorization`
  de duas requisições por ciclo de refresh.

## Validação em runtime real (2026-09-30)

Validado no GNOME Shell real do usuário (Zorin OS, sessão X11) logo após a
primeira implementação. Resultado: `journalctl /usr/bin/gnome-shell` mostrou

```text
AntigravitySubscriptionProvider: falha ao ler o Secret Service:
TypeError: Secret.password_lookupv is not a function
```

Causa: em GJS, o `.gir` do libsecret marca as variantes GI-friendly com
sufixo "v" (`secret_password_lookupv`, que recebe `GHashTable` em vez de
varargs) como `shadows`/`shadowed-by` das versões sem "v"
(`secret_password_lookup`). O gerador de bindings do GJS expõe a
implementação GI-friendly **sob o nome sem "v"** — ou seja, o método
chamável em JS é `Secret.password_lookup(...)`, não
`Secret.password_lookupv(...)`. Corrigido em
`antigravitySubscription.js`. O mesmo erro existia (não exercitado até
então) em `lib/secrets.js` (`password_storev`/`password_lookupv`/
`password_clearv`) — corrigido junto, ver ADR-004.

O `DONT_MATCH_NAME` e o POST com corpo JSON via
`Soup.Message.set_request_body_from_bytes` não geraram nenhum erro
próprio nesse teste — a única falha foi o nome do método.

Após a correção, o usuário confirmou no GNOME Shell real: o popup passou
a mostrar as janelas reais por modelo (ex.: "Gemini 3.1 Pro (High) — 2% ·
Normal", "Renova em 4 h 29 min"), ou seja, o token foi lido do keyring com
sucesso e `loadCodeAssist`/`fetchAvailableModels` retornaram 200 com
dados reais. Validação de ponta a ponta concluída — a classificação
permanece `EXPERIMENTAL` apenas pela mesma razão de sempre (endpoint não
documentado publicamente pelo Google), não por falta de confirmação.

A API retornou inicialmente até 19 janelas (uma por modelo/variante de
esforço), o que motivou dois ajustes de UX em `menu.js`/`antigravitySubscriptionParser.js`:
um dropdown recolhido (`PopupSubMenuMenuItem`) para não inflar o popup, e
deduplicação de janelas com `label`/`percent`/`resetsAt` idênticos (a API
às vezes repete o mesmo modelo sob `modelId`s diferentes).
