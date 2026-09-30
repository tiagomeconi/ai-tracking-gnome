# Ficha de pesquisa — Gemini / Google

> Pesquisa realizada em 2026-09-29 (WebSearch/WebFetch). Ver seção 7 do
> plano para o processo exigido.

```
Provider: Gemini / Google
Produto monitorado: Gemini App (gemini.google.com / app mobile) sob planos
  de consumidor: gratuito, Google AI Plus, Google AI Pro, Google AI Ultra
  (ex-Google One AI Premium).
Tipo de assinatura: Assinatura de consumidor (Google One / Google AI
  Pro/Ultra) — NÃO é uso de API paga por token.
Fonte dos dados: Nenhuma API oficial. Único ponto de referência é a própria
  UI web/app do Gemini (Configurações → "Usage Limits"), HTML renderizado,
  não um endpoint documentado.
Método suportado oficialmente: Nenhum. Não há endpoint REST/gRPC/CLI/SDK
  oficial que retorne quanto da cota do plano consumidor já foi usado.
Autenticação: N/A (não existe integração oficial). A única forma de ver o
  dado hoje é login humano na conta Google via navegador/app.
Quais cotas são expostas: Nenhuma quantificação programática. Desde
  17/05/2026 o Google trocou "N prompts/dia" por um sistema de
  "compute-based usage" com multiplicadores por tier (Plus 2x, Pro 4x,
  Ultra 5x–20x do padrão), sem publicar contadores de prompt. A UI mostra
  apenas avisos qualitativos ("perto do limite", "limite atingido, renova
  às HH:MM").
Unidades: Não documentado publicamente (unidade interna de "compute" não
  divulgada em detalhe).
Janelas: Renovação a cada 5h até atingir o teto semanal (varia por tier),
  segundo o suporte oficial do Gemini Apps.
Reset: A cada 5h (parcial) e semanal (teto), conforme
  support.google.com/gemini/answer/16275805.
Rate limits da própria integração: N/A — não há integração para ter rate
  limit.
Documentação oficial:
  - https://support.google.com/gemini/answer/16275805
  - https://support.google.com/googleone/answer/14534406
  - https://support.google.com/googleone/answer/16286513
  - https://ai.google.dev/gemini-api/docs/rate-limits (explicitamente sobre
    a API paga para desenvolvedores, não a assinatura consumidor)
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/quota-and-pricing.md
Limitações:
  - A Gemini CLI oficial tem `/stats model`, mas reporta uso de TOKENS DA
    SESSÃO ATUAL local, não o consumo acumulado da cota do plano de
    assinatura — é contagem de sessão, não espelho da cota do Google.
  - Desde 18/06/2026 a Gemini CLI parou de aceitar login "with Google"
    (conta consumidor) em várias rotas, substituída pela Antigravity CLI
    para uso não-pago/Google One — reduzindo ainda mais qualquer caminho de
    acesso via CLI oficial à cota do plano consumidor.
  - A única forma de ver o consumo é a UI web/app, que mostra apenas avisos
    qualitativos, não necessariamente um percentual numérico exato.
  - A API de rate limits do Google AI Studio/Vertex AI é exclusivamente
    sobre a API paga por token/request para desenvolvedores, e não reflete
    de forma alguma o consumo da assinatura do app Gemini — são sistemas de
    billing e cota totalmente distintos e desacoplados.
Riscos: Qualquer integração real exigiria scraping da página "Usage Limits"
  com cookies de sessão privados — método não suportado, frágil, possível
  violação dos termos de serviço do Google, sem garantia de dados
  estruturados.
Classificação: UNAVAILABLE
Status: Não há API, CLI ou client oficial do Google que exponha
  programaticamente o consumo da cota da assinatura de consumidor do
  Gemini App.
```

## Resposta à pergunta obrigatória (seção 7.1)

Nenhuma das fontes encontradas informa o consumo da assinatura/produto que
o usuário efetivamente utiliza (Gemini App/Google AI Pro/Ultra) de forma
programática — a única API oficial existente (ai.google.dev/gemini-api,
Cloud Console quotas) é exclusivamente sobre uso pago por token/request da
API para desenvolvedores (AI Studio/Vertex AI), um sistema de cota e
billing completamente separado do consumo da assinatura consumidor.
