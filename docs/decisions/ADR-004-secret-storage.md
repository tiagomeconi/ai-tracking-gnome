# ADR-004 — Secret storage

## Status

Aceito. Correção de 2026-09-30: os nomes dos métodos GJS estavam errados
(`password_storev`/`password_lookupv`/`password_clearv` não existem como
tais) — ver "Correção" abaixo.

## Contexto

A seção 8.1 do plano exige preferir Secret Service/GNOME Keyring para
credenciais e proíbe persistir secrets em repositório, `.json`, fixtures,
logs ou documentação. A Fase 5 exige uma camada de armazenamento seguro
antes de qualquer provider real (Fase 6) que dependa de autenticação.

## Decisão

1. Criar `extension/lib/secrets.js` com uma classe `SecretStore` que expõe
   apenas `store(providerId, secret)`, `lookup(providerId)`, `has(providerId)`
   e `clear(providerId)` — nunca expõe o valor do secret em nenhum log ou
   exceção.
2. O backend padrão de produção é `LibsecretBackend`, que usa a API GJS de
   libsecret (`gi://Secret`) via `password_store` / `password_lookup` /
   `password_clear` com um schema próprio
   (`io.prohound.AIUsageMonitor.ProviderCredential`, atributo `provider-id`).
   O import de `gi://Secret` é feito de forma dinâmica/lazy dentro do
   backend para que `secrets.js` continue importável (e testável) em
   ambientes sem GJS, como Node.
3. Existe também um `InMemorySecretBackend`, usado **apenas** em testes e
   documentado explicitamente como inadequado para produção (não
   persistente entre sessões, não criptografado). `SecretStore` nunca usa
   esse backend por padrão — precisa ser injetado explicitamente.
4. `UsageProvider.connect(secret)` é o ponto de entrada onde um provider
   real recebe a credencial digitada pelo usuário (Fase 8, preferências) e a
   repassa ao `SecretStore`. `UsageProvider.disconnect()` é onde o provider
   chama `SecretStore.clear()` para invalidar a credencial local.
   `UsageProvider.isConfigured()` consulta `SecretStore.has()` para decidir
   se retorna `true`/`false` — quando `false`, o `ProviderManager` já
   converte isso em status `auth_required` (implementado na Fase 3).

## Correção — nomes reais dos métodos GJS (2026-09-30)

A implementação original chamava `Secret.password_storev` /
`Secret.password_lookupv` / `Secret.password_clearv`, por analogia direta
com os nomes em C (`secret_password_storev` etc., as variantes
GI-friendly que recebem `GHashTable` em vez de varargs). Isso está errado
em GJS: o `.gir` marca as variantes "v" como `shadows`/`shadowed-by` das
versões sem "v" (`secret_password_store`/`_lookup`/`_clear`), e o gerador
de bindings do GJS expõe a implementação GI-friendly **sob o nome sem
"v"**. Ou seja, o método chamável em JS é `Secret.password_store(...)` /
`Secret.password_lookup(...)` / `Secret.password_clear(...)` — os nomes
com "v" simplesmente não existem como propriedades do módulo `Secret` em
GJS.

Isso só foi descoberto ao validar `AntigravitySubscriptionProvider`
(ADR-008) contra um GNOME Shell real pela primeira vez — o erro exato foi
`TypeError: Secret.password_lookupv is not a function`, visto no log da
Shell (`journalctl /usr/bin/gnome-shell`). Como nenhum provider usava
`SecretStore` até então, o bug em `secrets.js` ficou sem ser exercitado
desde o ADR-004 original. Os três métodos de `LibsecretBackend` foram
corrigidos (`store`/`lookup`/`clear` sem "v").

## Consequências / Limitações

- `LibsecretBackend` agora foi indiretamente validado: a correção acima
  veio de um erro real observado em runtime (não é mais uma suposição não
  testada), mas só o caminho de leitura (`password_lookup`) foi exercitado
  de fato (via `AntigravitySubscriptionProvider`, que usa seu próprio
  schema/flags, não `LibsecretBackend` diretamente). `store`/`clear` de
  `LibsecretBackend` continuam sem validação end-to-end contra um Secret
  Service real — só a correção do nome do método, por analogia com o que
  já foi confirmado para `lookup`.
- Nenhum provider real usa `SecretStore` ainda (não há Fase 6 implementada
  com credencial própria via UI). A cobertura de testes desta entrega
  valida o contrato do `SecretStore` usando `InMemorySecretBackend`, não o
  backend de produção.
