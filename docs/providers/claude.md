# Ficha de pesquisa — Claude / Anthropic

> Pesquisa realizada em 2026-09-29 (WebSearch/WebFetch). Ver seção 7 do
> plano para o processo exigido.

```
Provider: Claude / Anthropic
Produto monitorado: Assinatura de consumidor Claude.ai (Free/Pro/Max) e uso
  do Claude Code sob plano de assinatura (NÃO API key).
Tipo de assinatura: Claude Free / Pro / Max (janela rolling de ~5h + limite
  semanal rolling de 7 dias).
Fonte dos dados: Nenhum endpoint HTTP documentado. A única fonte "oficial" é
  a UI do claude.ai (indicador de uso) e o comando interativo `/usage` do
  Claude Code CLI — nenhum dos dois expõe saída machine-readable
  documentada.
Método suportado oficialmente: Nenhuma API REST/pública. Existe apenas
  indicador visual na UI web/app e o comando `/usage` no Claude Code
  (não documentado formalmente como interface programática).
Autenticação: Sessão logada do usuário (OAuth da conta de assinatura). Uma
  API key (sk-ant-...) pertence a um sistema de billing totalmente
  diferente (console.anthropic.com/platform.claude.com) e NÃO reflete
  consumo da assinatura do consumidor.
Quais cotas são expostas: Progresso da janela de ~5h e do limite semanal
  (mensagens/horas de uso, varia por plano). Sem discriminação exata de
  tokens.
Unidades: Não documentadas numericamente pela Anthropic para o consumidor
  (a doc de suporte evita publicar números exatos: variam por tamanho de
  mensagem, modelo, effort level, features usadas).
Janelas: Rolling de 5h a partir da primeira mensagem da sessão + rolling
  semanal de 7 dias (limite adicional, aplicado desde 2025 para conter
  abuso).
Reset: Rolling — 5h a partir do primeiro uso; semanal em base rolling de 7
  dias. Sem endpoint que informe "resetsAt" de forma estruturada.
Rate limits da própria integração: N/A — não há integração oficial.
Documentação oficial:
  - https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code
  - https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work
  - https://support.claude.com/en/articles/9797557-usage-limit-best-practices
  - https://platform.claude.com/docs/en/manage-claude/usage-cost-api
    (Usage & Cost Admin API — explicitamente sobre billing da API para
    desenvolvedores por organização, "unavailable for individual accounts",
    exige Admin API key; NÃO é sobre a cota de assinatura pessoal)
Limitações:
  - Não existe endpoint HTTP oficial para consumo de assinatura de
    consumidor; qualquer integração dependeria de ler a UI logada
    (scraping) ou automatizar o comando `/usage` do Claude Code CLI, o que
    não é uma API suportada e pode quebrar a qualquer atualização.
  - Ferramentas comunitárias (ccusage, claude-usage-tracker, etc.) leem
    arquivos JSONL locais que o Claude Code grava
    (`~/.claude/projects/*.jsonl`) para ESTIMAR volume de uso local, mas
    isso não é a cota real do servidor — é uma estimativa local, e o
    formato/retenção (~30 dias) não são documentados nem garantidos.
  - A Usage & Cost Admin API é explicitamente sobre a API paga por token,
    indisponível para contas individuais.
Riscos: Qualquer solução viável hoje exigiria scraping de UI autenticada
  (frágil, contra ToS) ou parsing do comando interativo `/usage` via
  automação de terminal (não pensado para ser machine-readable) — nenhuma
  das duas é uma integração oficial suportada.
Classificação: UNAVAILABLE
Status: Não há fonte oficial documentada, autenticável de forma suportada e
  parseável, para o consumo de cota da assinatura Claude Free/Pro/Max.
  Reavaliar se a Anthropic publicar uma API oficial no futuro.
```

## Adendo 1 — implementação EXPERIMENTAL v1, superada (2026-09-29, ADR-005)

Primeira tentativa: um provider que lia localmente os transcripts JSONL do
Claude Code e somava tokens processados numa janela de 5h — sem
`limit`/`percent`, só volume de atividade local. Ver ADR-005. **Superado**
pelo Adendo 2 abaixo.

## Adendo 2 — cota REAL via token OAuth do CLI (2026-09-29, ADR-007)

O usuário apontou o projeto open-source
[tokidachi](https://github.com/Gaalbu/tokidachi) (MIT), que reaproveita o
token OAuth que o próprio `claude auth login` já grava em
`~/.claude/.credentials.json` para chamar
`GET https://api.anthropic.com/api/oauth/usage` — o mesmo endpoint que o
Claude Code usa internamente para `/usage`. Isso retorna o **percentual
real** das janelas `five_hour`/`seven_day`/`seven_day_sonnet`/
`seven_day_opus`, não uma estimativa. Implementado em
`extension/lib/providers/claudeSubscription.js`. Endpoint não documentado
publicamente pela Anthropic — classificação continua `EXPERIMENTAL`. Ver
ADR-007 para detalhes completos, incluindo por que isto não é o mesmo que
capturar cookies de sessão web (proibido pela seção 2.1).

## Resposta à pergunta obrigatória (seção 7.1)

A única API oficialmente documentada ("Usage & Cost Admin API") informa
exclusivamente o consumo pago por token da API para desenvolvedores,
faturado por organização via Admin API key — explicitamente indisponível
para contas individuais. Não existe hoje uma API oficial documentada que
informe o consumo da cota de assinatura do consumidor (Claude Free/Pro/Max)
que o usuário efetivamente utiliza no claude.ai ou no Claude Code.
