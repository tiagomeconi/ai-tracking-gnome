# AI Usage Monitor for GNOME --- Plano de Execução para Agentes de IA

> **Status:** Planejamento inicial\
> **Objetivo deste documento:** servir como fonte de verdade operacional
> para agentes de IA que irão analisar, implementar, testar e documentar
> o projeto.\
> **Princípio central:** o produto monitora **consumo/cota de uso**, não
> gastos monetários.

------------------------------------------------------------------------

## 1. Visão do produto

Construir uma extensão para GNOME Shell que centralize, em um único
indicador na barra superior, o consumo atual das assinaturas e serviços
de IA configurados pelo usuário.

A experiência deve responder rapidamente:

> **Quanto da minha capacidade de uso de IA já foi consumida, quanto
> resta e quando a cota/janela será renovada?**

Exemplos de provedores-alvo:

-   ChatGPT / OpenAI
-   Claude / Anthropic
-   Gemini / Google
-   GitHub Copilot
-   outros provedores adicionados futuramente por adapters

O mock visual fornecido no início do projeto é uma **referência de
direção de UX**, não uma especificação rígida.

### 1.1 Fora do escopo inicial

Não é objetivo do MVP:

-   monitorar gastos em dinheiro;
-   criar dashboard financeiro;
-   enviar prompts para as IAs;
-   substituir os clientes oficiais;
-   armazenar histórico extensivo de conversas;
-   depender de scraping frágil como fundamento da arquitetura;
-   contornar mecanismos de autenticação, rate limits ou proteções dos
    provedores.

------------------------------------------------------------------------

## 2. Regras para todos os agentes

Antes de modificar código:

1.  Ler este documento por completo.
2.  Inspecionar a estrutura atual do repositório.
3.  Ler README, documentação, ADRs e arquivos relevantes já existentes.
4.  Não presumir que uma API de desenvolvedor representa a cota de uma
    assinatura de consumidor.
5.  Não inventar endpoints, limites, formatos de resposta ou mecanismos
    de autenticação.
6.  Quando houver dúvida sobre um provider, registrar como
    `NEEDS_RESEARCH`.
7.  Preferir APIs/documentação oficial e integrações suportadas.
8.  Nunca inserir tokens, cookies, API keys ou credenciais reais no
    código, logs, fixtures ou documentação.
9.  Manter coleta de dados desacoplada da interface GNOME.
10. Implementar mudanças pequenas, verificáveis e reversíveis.
11. Não alterar arquitetura estabelecida sem registrar a justificativa.
12. Não considerar uma fase concluída enquanto seus critérios de aceite
    não forem atendidos.

### 2.1 Regra de segurança para integrações

É proibido assumir que capturar cookies/sessões privadas de aplicações
web é uma solução aceitável.

Qualquer provider deve ser classificado como:

-   `OFFICIAL_API`
-   `OFFICIAL_LOCAL_SOURCE`
-   `SUPPORTED_INTEGRATION`
-   `EXPERIMENTAL`
-   `UNAVAILABLE`

Integrações experimentais devem ficar isoladas atrás da mesma interface
de provider e nunca ser requisito para funcionamento do core.

------------------------------------------------------------------------

## 3. Requisitos funcionais

### RF-01 --- Indicador GNOME

Exibir um indicador compacto na barra superior.

Exemplo conceitual:

``` text
AI 92%
```

O indicador agregado deve representar, por padrão, o provider/janela
**mais próximo do limite**, e não uma média simples.

Motivo:

``` text
Claude   98%
ChatGPT  30%
Gemini   20%
```

Uma média esconderia que um serviço está praticamente esgotado.

### RF-02 --- Popup de consumo

Ao clicar no indicador, mostrar os providers configurados e seus
estados.

Cada provider pode apresentar:

-   nome;
-   ícone;
-   percentual consumido;
-   quantidade usada;
-   limite, quando disponível;
-   unidade;
-   tipo da janela;
-   horário/data de renovação;
-   tempo restante;
-   estado de sincronização;
-   horário da última atualização.

### RF-03 --- Estados de consumo

A UI deve suportar pelo menos:

-   normal;
-   atenção;
-   alto;
-   crítico;
-   indisponível;
-   autenticação necessária;
-   carregando;
-   erro;
-   dado desconhecido.

Referência inicial de thresholds:

``` text
0–69%    normal
70–84%   atenção
85–94%   alto
95–100%  crítico
```

Os thresholds devem ser configuráveis internamente e não espalhados pela
UI.

Não comunicar estado exclusivamente por cor.

### RF-04 --- Atualização

Suportar:

-   atualização automática;
-   cache local;
-   atualização manual;
-   timestamp da última sincronização;
-   tratamento independente de erro por provider.

A falha de um provider não pode impedir a exibição dos demais.

### RF-05 --- Configuração

Permitir:

-   ativar/desativar providers;
-   configurar intervalo de atualização;
-   conectar/desconectar credenciais quando aplicável;
-   visualizar estado da integração.

### RF-06 --- Múltiplas janelas

Um provider pode possuir mais de uma cota simultânea.

Exemplos conceituais:

-   mensagens / 3 horas;
-   tokens / minuto;
-   requests / dia;
-   premium requests / mês.

A arquitetura não pode pressupor uma única barra por provider.

------------------------------------------------------------------------

## 4. Modelo de domínio

Usar um contrato normalizado equivalente ao seguinte. O formato pode
evoluir, mas mudanças devem preservar a capacidade de representar
múltiplos providers e múltiplas janelas.

``` ts
export type UsageUnit =
  | "messages"
  | "tokens"
  | "requests"
  | "credits"
  | "percentage"
  | "unknown";

export type UsageWindowKind =
  | "minute"
  | "hour"
  | "3h"
  | "5h"
  | "day"
  | "week"
  | "month"
  | "custom"
  | "unknown";

export interface UsageWindow {
  id: string;
  label: string;

  unit: UsageUnit;

  used?: number;
  limit?: number;
  remaining?: number;
  percent?: number;

  window: UsageWindowKind;

  resetsAt?: string;

  estimated: boolean;
}

export type ProviderStatus =
  | "ok"
  | "warning"
  | "critical"
  | "unavailable"
  | "auth_required"
  | "error";

export interface AIProviderUsage {
  providerId: string;
  providerName: string;
  accountLabel?: string;

  status: ProviderStatus;

  windows: UsageWindow[];

  fetchedAt: string;
  stale: boolean;

  errorCode?: string;
}
```

### 4.1 Regras de normalização

-   `percent` deve ficar entre `0` e `100` quando representar cota
    finita.
-   Se `used` e `limit` existirem, o normalizador pode calcular
    `percent`.
-   Não fabricar `limit` quando o provider não o disponibilizar.
-   Não transformar estimativa em dado exato.
-   Dados estimados devem possuir `estimated: true`.
-   Datas devem ser normalizadas em ISO 8601 internamente.
-   A apresentação pode converter horários para o timezone local.
-   Dados antigos devem poder ser marcados como `stale`.
-   `unknown` é preferível a inventar informação.

------------------------------------------------------------------------

## 5. Arquitetura alvo

Arquitetura preferencial:

``` text
┌──────────────────────────────────────┐
│             GNOME Shell              │
│                                      │
│  Top Bar Indicator → Popup → Config  │
└──────────────────┬───────────────────┘
                   │
              D-Bus / IPC
                   │
┌──────────────────▼───────────────────┐
│          AI Usage Service            │
│                                      │
│ ProviderManager                      │
│ ├── OpenAIAdapter                    │
│ ├── AnthropicAdapter                 │
│ ├── GeminiAdapter                    │
│ ├── CopilotAdapter                   │
│ └── MockAdapter                      │
│                                      │
│ Normalizer                           │
│ Cache                                │
│ Scheduler                            │
│ SecretStore                          │
└──────────────────┬───────────────────┘
                   │
          Supported data sources
```

### 5.1 Responsabilidades da extensão

A extensão GNOME deve cuidar de:

-   indicador da top bar;
-   popup;
-   renderização;
-   ações do usuário;
-   estados visuais;
-   leitura do estado normalizado;
-   solicitação de refresh;
-   preferências relacionadas à apresentação.

Ela **não deve** concentrar lógica específica dos providers.

### 5.2 Responsabilidades do serviço

O serviço local deve cuidar de:

-   providers;
-   autenticação de integrações;
-   chamadas de rede;
-   normalização;
-   cache;
-   polling;
-   retry;
-   timeouts;
-   tratamento de rate limit;
-   acesso seguro às credenciais;
-   publicação do estado para a extensão.

### 5.3 Decisão de MVP

É permitido começar sem daemon somente se isso reduzir
significativamente a complexidade inicial e a integração permanecer
desacoplada.

Mesmo nesse caso, providers devem respeitar contratos próprios para
permitir posterior migração para processo separado.

------------------------------------------------------------------------

## 6. Contrato dos providers

Todo provider deve implementar um contrato equivalente a:

``` ts
export interface UsageProvider {
  readonly id: string;
  readonly name: string;

  isConfigured(): Promise<boolean>;

  connect?(): Promise<void>;
  disconnect?(): Promise<void>;

  fetchUsage(): Promise<AIProviderUsage>;

  healthCheck(): Promise<boolean>;
}
```

Providers não podem acessar diretamente componentes da UI.

### 6.1 Provider mock obrigatório

Antes de depender de serviços reais, implementar um `MockProvider`.

Ele deve conseguir simular:

-   20% de consumo;
-   75%;
-   90%;
-   100%;
-   loading;
-   erro;
-   autenticação necessária;
-   provider indisponível;
-   dado stale;
-   múltiplas janelas;
-   reset próximo;
-   limite desconhecido.

O MockProvider será a base do desenvolvimento e dos testes de UI.

------------------------------------------------------------------------

## 7. Pesquisa obrigatória por provider

Antes de implementar cada integração real, produzir uma ficha em
`docs/providers/<provider>.md`.

A ficha deve responder:

``` text
Provider:
Produto monitorado:
Tipo de assinatura:
Fonte dos dados:
Método suportado oficialmente:
Autenticação:
Quais cotas são expostas:
Unidades:
Janelas:
Reset:
Rate limits da própria integração:
Documentação oficial:
Limitações:
Riscos:
Classificação:
Status:
```

### 7.1 Pergunta obrigatória

Para cada provider, responder explicitamente:

> A fonte consultada informa consumo da assinatura/produto que o usuário
> utiliza ou apenas consumo da API para desenvolvedores?

Não implementar uma integração tratando essas duas coisas como
equivalentes sem evidência.

### 7.2 Prioridade de fontes

Usar nesta ordem:

1.  documentação/API oficial;
2.  CLI ou fonte local oficial;
3.  integração oficialmente suportada;
4.  solução experimental claramente isolada;
5.  marcar como indisponível.

------------------------------------------------------------------------

## 8. Segurança

### 8.1 Secrets

Preferir Secret Service / GNOME Keyring para credenciais.

Nunca persistir secrets em:

-   repositório;
-   arquivos `.json`;
-   fixtures;
-   logs;
-   mensagens de erro;
-   screenshots de teste;
-   documentação.

Configurações não sensíveis podem ficar em arquivo próprio ou GSettings.

### 8.2 Logs

Logs podem conter:

-   provider;
-   código interno de erro;
-   duração;
-   status HTTP quando seguro;
-   timestamp.

Logs não podem conter:

-   API keys;
-   Authorization headers;
-   cookies;
-   refresh tokens;
-   access tokens;
-   respostas contendo credenciais.

### 8.3 Rede

Implementar:

-   timeout;
-   tratamento de indisponibilidade;
-   retry limitado;
-   backoff quando apropriado;
-   respeito a rate limits;
-   cancelamento quando possível.

Não fazer polling agressivo.

------------------------------------------------------------------------

## 9. Cache e sincronização

Fluxo esperado:

``` text
Scheduler
   ↓
Provider.fetchUsage()
   ↓
Normalizer
   ↓
Cache
   ↓
D-Bus / IPC
   ↓
GNOME Extension
```

A abertura do popup não deve obrigatoriamente realizar chamada de rede.

### 9.1 Comportamento esperado

-   mostrar imediatamente o último estado conhecido;
-   indicar se estiver stale;
-   atualizar em background;
-   refresh manual pode solicitar nova coleta;
-   uma falha mantém o último valor conhecido quando apropriado,
    identificado como stale;
-   erro de um provider não invalida o cache dos demais.

Intervalos exatos de polling devem considerar as características de cada
integração.

------------------------------------------------------------------------

## 10. UX

### 10.1 Barra superior

Exemplo:

``` text
AI 92%
```

Não sobrecarregar a barra com dados de todos os providers.

### 10.2 Popup

Direção visual:

``` text
AI Usage
────────────────────────────

Claude
██████████████████░░  92%
Janela de 5 h
Renova em 47 min

ChatGPT
██████████████░░░░░░  71%
Janela de 3 h
Renova em 1 h 32 min

Gemini
████████░░░░░░░░░░░░  43%
Diário
Renova em 6 h

Copilot
██████░░░░░░░░░░░░░░  31%
Mensal
Renova em 12 dias

────────────────────────────
Atualizado há 1 min    ↻  ⚙
```

### 10.3 Estados individuais

Cada card/linha deve suportar:

``` text
Provider normal
Provider próximo do limite
Provider crítico
Carregando
Não configurado
Autenticação necessária
Erro temporário
Indisponível
Último dado conhecido / stale
```

### 10.4 Acessibilidade

Garantir:

-   nomes acessíveis em controles;
-   navegação por teclado quando aplicável;
-   foco visível;
-   contraste adequado;
-   estado não comunicado apenas por cor;
-   ícones com significado compreensível;
-   textos de erro acionáveis;
-   suporte razoável a escalonamento de fonte/interface.

------------------------------------------------------------------------

## 11. Estrutura sugerida do repositório

Adaptar à estrutura real do projeto antes de criar arquivos.

``` text
ai-usage-monitor/
├── extension/
│   ├── extension.js
│   ├── indicator.js
│   ├── menu.js
│   ├── dbus-client.js
│   ├── metadata.json
│   └── stylesheet.css
│
├── service/
│   ├── src/
│   │   ├── providers/
│   │   │   ├── provider.ts
│   │   │   ├── mock.ts
│   │   │   ├── openai.ts
│   │   │   ├── anthropic.ts
│   │   │   ├── gemini.ts
│   │   │   └── copilot.ts
│   │   ├── normalizer.ts
│   │   ├── cache.ts
│   │   ├── scheduler.ts
│   │   ├── secrets.ts
│   │   └── dbus.ts
│   └── package.json
│
├── shared/
│   └── usage-types.ts
│
├── docs/
│   ├── architecture.md
│   ├── decisions/
│   └── providers/
│
├── tests/
└── README.md
```

Não criar essa árvore cegamente se o projeto já possuir convenções
equivalentes.

------------------------------------------------------------------------

## 12. Fases de execução

### Fase 0 --- Discovery técnico

Objetivo: eliminar suposições antes da implementação.

Tarefas:

-   identificar versão mínima de GNOME suportada;
-   confirmar stack e tooling;
-   verificar convenções atuais para extensões GNOME;
-   definir mecanismo de IPC;
-   definir armazenamento de configurações;
-   validar estratégia para Secret Service;
-   pesquisar cada provider;
-   criar fichas de providers;
-   registrar ADRs das decisões relevantes.

**Critério de saída:** arquitetura documentada e pelo menos um caminho
de dados tecnicamente validado para o MVP.

------------------------------------------------------------------------

### Fase 1 --- Skeleton da extensão

Implementar:

-   metadata;
-   lifecycle enable/disable;
-   indicador;
-   popup básico;
-   stylesheet;
-   dados estáticos.

**Critérios de aceite:**

-   extensão habilita sem erro;
-   indicador aparece;
-   popup abre/fecha;
-   extensão desabilita limpamente;
-   não deixa timers/signals órfãos.

------------------------------------------------------------------------

### Fase 2 --- Modelo normalizado + MockProvider

Implementar:

-   tipos;
-   normalizador;
-   ProviderManager;
-   MockProvider;
-   estados completos da UI.

**Critérios de aceite:**

-   UI não conhece regras específicas de nenhum provider;
-   todos os estados principais podem ser reproduzidos sem internet;
-   múltiplas janelas são suportadas.

------------------------------------------------------------------------

### Fase 3 --- Cache e scheduler

Implementar:

-   cache;
-   timestamps;
-   stale;
-   polling;
-   refresh manual;
-   timeout;
-   retry controlado;
-   isolamento de falhas.

**Critérios de aceite:**

-   popup abre usando cache;
-   falha em um provider não quebra outros;
-   polling não duplica timers;
-   refresh manual não cria tempestade de requests.

------------------------------------------------------------------------

### Fase 4 --- Serviço local e IPC

Se confirmado pela arquitetura:

-   processo local;
-   interface D-Bus/IPC;
-   lifecycle;
-   serialização do modelo;
-   comunicação extensão ↔ serviço;
-   recuperação quando o serviço estiver indisponível.

**Critérios de aceite:**

-   extensão continua responsiva quando provider está lento;
-   serviço pode reiniciar sem exigir reinício completo do GNOME Shell;
-   indisponibilidade aparece como estado controlado.

------------------------------------------------------------------------

### Fase 5 --- Secret storage

Implementar armazenamento seguro para integrações que exijam
credenciais.

**Critérios de aceite:**

-   secrets não aparecem no repositório;
-   secrets não aparecem em logs;
-   desconectar provider remove/invalida a credencial conforme
    estratégia definida;
-   erro de autenticação vira estado `auth_required`.

------------------------------------------------------------------------

### Fase 6 --- Primeiro provider real

Escolher o primeiro provider **somente após a pesquisa da Fase 0**.

Implementar:

-   adapter;
-   autenticação;
-   parser;
-   normalização;
-   erros;
-   rate limit;
-   testes unitários.

**Critério de aceite:** dado real suportado pela fonte é convertido
corretamente para o contrato comum sem inventar informações ausentes.

------------------------------------------------------------------------

### Fase 7 --- Providers adicionais

Para cada novo provider:

1.  pesquisa;
2.  ficha;
3.  classificação da integração;
4.  implementação;
5.  fixtures sanitizadas;
6.  testes;
7.  documentação;
8.  revisão de segurança.

Não bloquear o produto inteiro porque um provider não possui fonte
confiável.

------------------------------------------------------------------------

### Fase 8 --- Preferências

Implementar configurações para:

-   providers ativos;
-   intervalo de atualização;
-   comportamento do indicador;
-   thresholds, caso sejam expostos ao usuário;
-   gerenciamento das integrações.

------------------------------------------------------------------------

### Fase 9 --- Hardening

Revisar:

-   lifecycle GNOME;
-   leaks;
-   signals;
-   timers;
-   falhas de rede;
-   retry;
-   concorrência;
-   race conditions;
-   dados corrompidos;
-   secrets;
-   acessibilidade;
-   desempenho;
-   compatibilidade entre versões GNOME suportadas.

------------------------------------------------------------------------

### Fase 10 --- Empacotamento e documentação

Preparar:

-   README;
-   instalação;
-   desenvolvimento;
-   build;
-   testes;
-   troubleshooting;
-   providers suportados;
-   limitações conhecidas;
-   política de segurança;
-   processo para adicionar providers.

------------------------------------------------------------------------

## 13. Estratégia de testes

### 13.1 Unitários

Cobrir pelo menos:

-   cálculo percentual;
-   clamp/validação;
-   cálculo de remaining;
-   datas/reset;
-   normalização;
-   thresholds;
-   stale;
-   parsers;
-   erros;
-   seleção do provider mais crítico.

### 13.2 Providers

Cada provider deve ter fixtures sanitizadas para:

-   sucesso;
-   limite ausente;
-   campos opcionais ausentes;
-   resposta inválida;
-   autenticação inválida;
-   rate limit;
-   timeout;
-   erro do servidor.

### 13.3 UI

Validar:

-   zero providers;
-   um provider;
-   muitos providers;
-   nomes longos;
-   0%;
-   100%;
-   limite desconhecido;
-   loading;
-   erro;
-   stale;
-   múltiplas janelas.

### 13.4 Lifecycle GNOME

Validar repetidamente:

``` text
enable
disable
enable
disable
```

Verificar ausência de:

-   timers duplicados;
-   signals pendentes;
-   indicadores duplicados;
-   objetos órfãos;
-   exceções.

------------------------------------------------------------------------

## 14. Observabilidade

Erros devem possuir códigos internos estáveis.

Exemplo:

``` text
PROVIDER_AUTH_REQUIRED
PROVIDER_RATE_LIMITED
PROVIDER_TIMEOUT
PROVIDER_UNAVAILABLE
PROVIDER_INVALID_RESPONSE
IPC_UNAVAILABLE
CACHE_INVALID
```

A UI deve converter códigos técnicos em mensagens úteis, sem expor
detalhes sensíveis.

------------------------------------------------------------------------

## 15. Definition of Done

Uma tarefa só pode ser marcada como concluída quando:

-   implementação está funcional;
-   lint/typecheck aplicáveis passam;
-   testes aplicáveis passam;
-   não há secret introduzido;
-   erros relevantes estão tratados;
-   documentação foi atualizada quando necessário;
-   comportamento foi validado;
-   não houve regressão evidente;
-   código respeita o contrato de arquitetura.

Uma integração de provider adicional exige também:

-   ficha de pesquisa;
-   classificação da fonte;
-   documentação da limitação;
-   fixtures sanitizadas;
-   testes do parser/normalizador.

------------------------------------------------------------------------

## 16. Backlog inicial

> Checklist mantida em sincronia com o estado real do código (ver
> [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — "Status atual" — para o
> detalhe por fase). Última revisão: 2026-09-30.

### P0 --- Fundação

-   [x] Confirmar versões GNOME suportadas (ADR-001; GNOME 45+ no MVP, 42–44 avaliado como trabalho futuro)
-   [x] Definir stack/tooling
-   [x] Criar skeleton (Fase 1)
-   [x] Criar contrato `UsageProvider`
-   [x] Criar modelo `AIProviderUsage`
-   [x] Criar `MockProvider`
-   [x] Criar popup inicial
-   [x] Implementar estados de UI
-   [x] Implementar normalização
-   [x] Implementar cache
-   [x] Implementar refresh

### P0 --- Segurança

-   [x] Definir Secret Service/GNOME Keyring (ADR-004, `lib/secrets.js`)
-   [x] Sanitizar logs (providers nunca logam valor de token/secret, só o providerId e o resultado)
-   [x] Definir política de credenciais (seção 8.1 + ADR-004)
-   [x] Garantir ausência de secrets no repositório

### P1 --- Arquitetura

-   [x] Definir IPC (ADR-002: decidido não ter serviço/IPC separado no MVP — tudo roda no processo da extensão)
-   [ ] Implementar serviço local, se confirmado — **não implementado por decisão de design** (Fase 4 adiada, ADR-002)
-   [x] Scheduler
-   [x] Retry/backoff
-   [x] Tratamento de stale
-   [x] Preferências (Fase 8)

### P1 --- Providers

-   [x] Pesquisar ChatGPT/OpenAI (`docs/providers/chatgpt.md`)
-   [x] Pesquisar Claude/Anthropic (`docs/providers/claude.md`)
-   [x] Pesquisar Gemini/Google (`docs/providers/gemini.md`, com adendo do Antigravity CLI oficial em 2026-09-30)
-   [x] Pesquisar GitHub Copilot (`docs/providers/copilot.md`)
-   [x] Classificar fontes
-   [x] Implementar primeiro provider suportado (Claude, ADR-007)
-   [x] Implementar providers seguintes (Codex — ADR-007; Antigravity/Gemini — ADR-008). GitHub Copilot (único `OFFICIAL_API`) segue com `MockProvider`, adiado a pedido do usuário.

### P1 --- Qualidade

-   [x] Unit tests (87 testes, `node --test tests/*.test.js`, cobrindo a camada de domínio)
-   [x] Provider fixtures (payloads de exemplo inline nos testes de cada parser, sem arquivos fixture separados)
-   [ ] Lifecycle tests — só validação manual num GNOME Shell real (sem GJS neste ambiente de dev, sem CI de UI)
-   [x] Error states (`auth_required`/`error`/rate limit/timeout cobertos nos testes de provider e parser)
-   [ ] Accessibility review
-   [ ] Performance review

### P2 --- Evoluções

-   [ ] Ordenação configurável
-   [ ] Notificação de limite
-   [ ] Histórico local opcional
-   [ ] Providers comunitários
-   [ ] Export/import de configuração não sensível

------------------------------------------------------------------------

## 17. Riscos técnicos

### R01 --- Assinatura sem API de consumo

**Risco:** o produto web pode exibir uma cota que não está disponível em
API oficial.

**Mitigação:** provider pode ficar `UNAVAILABLE` ou `EXPERIMENTAL`;
nunca inventar equivalência com billing/API usage.

### R02 --- Mudança de integração

**Risco:** endpoints ou formatos mudam.

**Mitigação:** adapters isolados, parsers testados e contrato
normalizado.

### R03 --- Bloqueio do GNOME Shell

**Risco:** rede/lógica pesada prejudicar a Shell.

**Mitigação:** operações assíncronas e, quando confirmado, serviço
separado.

### R04 --- Vazamento de credenciais

**Risco:** tokens aparecerem em configuração/logs.

**Mitigação:** Secret Service, sanitização e revisão de segurança.

### R05 --- Polling excessivo

**Risco:** rate limit ou desperdício de recursos.

**Mitigação:** cache, scheduler centralizado e backoff.

### R06 --- Métricas incompatíveis

**Risco:** tentar representar todos os providers como a mesma unidade.

**Mitigação:** múltiplas `UsageWindow`, unidades explícitas e suporte a
desconhecido.

------------------------------------------------------------------------

## 18. ADRs recomendados

Criar ADR quando a decisão for tomada:

``` text
ADR-001 — Versões GNOME suportadas
ADR-002 — Extensão somente vs serviço local
ADR-003 — IPC / D-Bus
ADR-004 — Secret storage
ADR-005 — Modelo normalizado de consumo
ADR-006 — Estratégia de cache/polling
ADR-007 — Política para providers experimentais
```

------------------------------------------------------------------------

## 19. Formato de trabalho para agentes

Ao receber uma tarefa relevante, o agente deve responder internamente a
estas perguntas antes de implementar:

``` text
1. Qual requisito estou atendendo?
2. Quais arquivos existentes controlam esse comportamento?
3. Existe decisão arquitetural relacionada?
4. Estou assumindo algo sobre um provider sem evidência?
5. A mudança toca credenciais?
6. Pode bloquear o GNOME Shell?
7. Precisa de teste?
8. Precisa atualizar documentação?
```

Depois da implementação, registrar no resumo:

``` text
Objetivo:
Arquivos alterados:
Decisões:
Testes executados:
Resultado:
Riscos/limitações:
Pendências:
Próximo passo recomendado:
```

------------------------------------------------------------------------

## 20. Restrições para agentes

Não:

-   inventar APIs;
-   inventar quotas;
-   fazer scraping como solução padrão;
-   salvar cookies/tokens em plaintext;
-   colocar chamadas HTTP diretamente em componentes visuais sem
    abstração;
-   duplicar regras de threshold;
-   bloquear o fluxo principal porque um provider falhou;
-   ocultar erro convertendo-o em `0%`;
-   apresentar dado estimado como exato;
-   assumir que `API usage == subscription usage`;
-   introduzir dependências sem necessidade clara;
-   refatorar áreas não relacionadas à tarefa sem justificativa.

------------------------------------------------------------------------

## 21. Ordem recomendada de implementação

``` text
Discovery
   ↓
GNOME skeleton
   ↓
Domain model
   ↓
MockProvider
   ↓
UI completa com mocks
   ↓
Cache + scheduler
   ↓
IPC/service
   ↓
Secret storage
   ↓
Provider real #1
   ↓
Providers adicionais
   ↓
Preferences
   ↓
Hardening
   ↓
Packaging
```

A UI deve estar funcional com mocks **antes** de depender da
disponibilidade das integrações reais.

------------------------------------------------------------------------

## 22. Critérios de sucesso do MVP

O MVP está pronto quando:

-   existe indicador funcional na top bar;
-   popup mostra providers;
-   consumo percentual é apresentado quando disponível;
-   reset/janela é apresentado quando disponível;
-   múltiplas janelas são suportadas pelo domínio;
-   refresh automático funciona;
-   refresh manual funciona;
-   cache funciona;
-   falha individual é isolada;
-   credenciais são tratadas com segurança;
-   existe pelo menos um provider real tecnicamente suportado;
-   MockProvider continua disponível para desenvolvimento/testes;
-   documentação explica claramente o que cada integração consegue e não
    consegue medir;
-   extensão não depende de gastos monetários.

------------------------------------------------------------------------

## 23. Princípio final

A qualidade deste projeto depende mais da **confiabilidade da origem do
dado** do que da quantidade de providers exibidos.

É preferível apresentar:

``` text
Claude
Consumo indisponível por integração suportada
```

do que exibir um percentual inferido ou incorreto.

A arquitetura deve permitir que o projeto cresça provider por provider
sem comprometer segurança, estabilidade do GNOME Shell ou confiabilidade
das informações.
