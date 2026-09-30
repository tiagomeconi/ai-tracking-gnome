# Ficha de pesquisa — ChatGPT / OpenAI

> Pesquisa realizada em 2026-09-29 (WebSearch/WebFetch). Ver seção 7 do
> plano para o processo exigido.

```
Provider: ChatGPT / OpenAI
Produto monitorado: Assinatura de consumidor ChatGPT (Free/Go/Plus/Pro/Team/
  Business/Enterprise/Edu) — cota de mensagens/uso do produto de chat, NÃO a
  API para desenvolvedores.
Tipo de assinatura: Free, Go, Plus, Pro, Team, Business, Enterprise, Edu
  (allowances distintos por modelo/feature).
Fonte dos dados: Nenhum endpoint documentado em platform.openai.com/docs
  expõe isso. A única superfície oficial é a UI web do ChatGPT
  (Settings → Usage Limits) e, parcialmente, o Codex CLI.
Método suportado oficialmente: Nenhum para o chat "regular". O Codex CLI
  (agente de código, não o chat geral) tem comandos `/status`/`/usage` que
  mostram percentuais de janela consumidos, mas cobrem apenas uso de Codex.
Autenticação: N/A para API — os números só aparecem na sessão web logada do
  usuário (cookie/sessão), não via API key de desenvolvedor.
Quais cotas são expostas: Na UI, contadores de mensagens por modelo/feature
  (varia por plano); no Codex CLI, percentual de janela 5h/semanal.
Unidades: Mensagens (contagem) para a maioria dos planos/features; percentual
  de janela para Codex. Sem unidade uniforme documentada para todo o produto.
Janelas: Variam por feature — rolling 3h, semanal, ou ciclo de faturamento
  mensal (Enterprise/Edu usam orçamento em USD, não contagem de mensagens).
Reset: Depende do plano/feature (3h rolling, semanal, ou mensal).
Rate limits da própria integração: N/A — não há integração oficial.
Documentação oficial:
  - https://help.openai.com/en/articles/20001001-manage-usage-limits-and-overages-in-chatgpt-enterprise-and-edu
  - https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-freegopluspro-sora
  - https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers
  - https://help.openai.com/en/articles/12003714-chatgpt-business-models-limits
  - https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
  - https://developers.openai.com/api/docs/guides/rate-limits (API paga por
    token — não é a assinatura)
  - https://github.com/openai/codex/issues/44796 (issue oficial confirmando
    a ausência de contador documentado para o chat regular)
Limitações:
  - Não existe API documentada; a única visão é a UI web autenticada por
    sessão de usuário.
  - O que existe (Codex CLI `/status`/`/usage`) cobre uso de Codex, não o
    chat "regular" da assinatura.
  - Qualquer captura exigiria scraping da UI web e/ou engenharia reversa de
    chamadas internas (backend-api, sentinel/chat-requirements token),
    prática não-oficial, frágil e provavelmente contra os Termos de Uso.
Riscos: Exigiria capturar cookies de sessão privados (JWT, CSRF token,
  proof-of-work token) — mecanismo usado por projetos de engenharia reversa
  não-oficiais, sujeito a quebra a qualquer atualização da OpenAI, risco de
  violação de ToS e bloqueio de conta. Proibido pela seção 2.1 deste plano
  como base para o core do produto.
Classificação: UNAVAILABLE
Status: Nenhuma API oficial documentada expõe a cota da assinatura de
  consumidor ChatGPT. Não implementar integração real até que a OpenAI
  publique algo oficial (issue #44796 mostra que é uma feature pedida, não
  confirmada).
```

## Resposta à pergunta obrigatória (seção 7.1)

A única API pública documentada (billing da plataforma para desenvolvedores)
informa exclusivamente uso pago por token da API — não existe hoje uma API
oficial que informe o consumo da cota da assinatura ChatGPT que o usuário
final utiliza. Essas duas coisas **não são equivalentes** e não devem ser
tratadas como tal.
