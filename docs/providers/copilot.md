# Ficha de pesquisa — GitHub Copilot

> Pesquisa realizada em 2026-09-29 (WebSearch/WebFetch). Ver seção 7 do
> plano para o processo exigido.

```
Provider: GitHub Copilot
Produto monitorado: GitHub Copilot (planos Individual/Pro, Pro+, Business,
  Enterprise).
Tipo de assinatura: Copilot Pro / Pro+ (individual) e Business/Enterprise
  (organização).
Fonte dos dados: API REST oficial do GitHub
  (docs.github.com/en/rest/billing/usage), endpoints em GA/preview público.
Método suportado oficialmente:
  - GET /users/{username}/settings/billing/premium_request/usage (modelo
    legado: contagem de "premium requests")
  - GET /users/{username}/settings/billing/ai_credit/usage (modelo atual
    pós-jun/2026: "AI credits")
  - GET /users/{username}/settings/billing/usage e /usage/summary
    (relatório total, preview público)
  - Equivalentes de organização:
    /organizations/{org}/settings/billing/{premium_request,ai_credit}/usage
    (exigem admin de org/enterprise)
Autenticação: Bearer token — PAT clássico com escopo repo/admin:org, PAT
  fine-grained com permissão de usuário "Plan" (read), ou OAuth/GitHub App
  user-access-token com permissão "Plan". O endpoint de usuário funciona
  sem ser admin de org, desde que o plano Copilot seja pago/gerido
  individualmente (não se aplica se a licença for gerenciada por
  org/enterprise — nesse caso só o endpoint de org serve, e exige admin).
Quais cotas são expostas: contagem de "premium requests" consumidos
  (grossQuantity/netQuantity por modelo/sku, endpoint legado) OU consumo de
  "AI credits" (1 credit = US$ 0,01, modelo atual desde a migração para
  usage-based billing em 01/06/2026).
Unidades: requests (contagem, modelo legado); "credits" no modelo atual —
  compatível com o `UsageUnit: "credits"` já previsto no modelo de domínio
  deste projeto (seção 4), mesmo a unidade tendo lastro monetário
  (US$ 0,01/credit).
Janelas: relatórios por dia/mês/ano (parâmetros year, month, day); dados
  retidos por até 24 meses.
Reset: mensal, às 00:00:00 UTC do dia 1 (créditos não utilizados são
  perdidos, não acumulam).
Rate limits da própria integração: não documentados explicitamente além do
  rate limit geral da REST API do GitHub.
Documentação oficial:
  - https://docs.github.com/en/rest/billing/usage
  - https://docs.github.com/copilot/concepts/billing/usage-based-billing-for-individuals
  - https://docs.github.com/en/copilot/concepts/billing/copilot-requests
  - https://docs.github.com/en/billing/concepts/product-billing/github-copilot-premium-requests
  - https://docs.github.com/en/copilot/how-tos/manage-and-track-spending/monitor-premium-requests
  - https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/
Limitações:
  - Só funciona plenamente para quem tem plano Copilot pago diretamente na
    própria conta pessoal (self-billed); se a licença é fornecida por
    organização/enterprise, exige endpoint de org (requer admin) — cenário
    comum em ambientes corporativos, fora do controle do usuário final.
  - A partir de 01/06/2026 o modelo "premium requests" é legado; a métrica
    corrente ("AI credits") é expressa em dólares, misturando consumo e
    valor monetário na API oficial atual.
  - Formato de resposta e nome exato de algumas permissões fine-grained
    parcialmente inferidos de fontes secundárias, não 100% confirmados em
    um único documento oficial primário.
  - `gh` CLI e a extensão Copilot no VS Code não expõem esse dado via
    comando parseável documentado; a UI do VS Code usa endpoints internos
    não públicos.
Riscos:
  - Migração PRU → AI credits ainda recente (concluída jun/2026); formato
    pode evoluir ainda em 2026-2027.
  - Exige o usuário gerar manualmente um PAT fine-grained com permissão
    "Plan" — fricção de configuração, sem fluxo OAuth device-flow
    confirmado especificamente para esse escopo.
  - Usuário com licença corporativa (org/enterprise) não consegue ler os
    próprios dados sem privilégios de admin.
Classificação: OFFICIAL_API
Status: Endpoint oficial existe e é documentado, com ressalvas: (a) só
  serve planos self-billed, (b) unidade corrente é monetária (AI credits),
  compatível com `UsageUnit: "credits"` do modelo de domínio deste projeto
  desde que a UI não a apresente como "gasto em dinheiro" (seção 1.1 —
  fora de escopo monitorar gastos monetários), (c) exige o usuário gerar um
  PAT manualmente. Candidato mais forte para ser o "provider real #1"
  (Fase 6), mas com fricção de setup a documentar claramente na UI de
  preferências (Fase 8).
```

## Resposta à pergunta obrigatória (seção 7.1)

A API oficial de billing/usage informa o consumo real do produto/assinatura
que o usuário utiliza (premium requests / AI credits do próprio plano
Copilot), não uma métrica de "API para desenvolvedores" — porém a unidade
corrente ("AI credits") é expressa em valor monetário (US$ 0,01 por
crédito), misturando consumo funcional com equivalente de gasto. Isso
precisa ser tratado com cuidado na apresentação (seção 1.1 do plano: não
monitorar gastos monetários) — a UI deve mostrar "X créditos de Y
consumidos", nunca "$X de $Y gastos".
