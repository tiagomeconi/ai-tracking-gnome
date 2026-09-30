# ADR-004 — Secret storage

## Status

Aceito (implementação não validada contra Secret Service real neste
ambiente — ver "Limitações" abaixo).

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
   libsecret (`gi://Secret`) via `password_storev` / `password_lookupv` /
   `password_clearv` com um schema próprio
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

## Consequências / Limitações

- Este ambiente de desenvolvimento é um sandbox sem sessão D-Bus/GNOME
  Keyring disponível, então `LibsecretBackend` **não foi exercitado contra
  um Secret Service real**. A implementação segue o padrão oficial e
  amplamente documentado de callback + `_finish` das bindings GJS baseadas
  em GLib/Gio, mas deve ser validada manualmente no sistema real do usuário
  antes de ser considerada pronta para um provider real.
- Nenhum provider real usa `SecretStore` ainda (não há Fase 6 implementada).
  A cobertura de testes desta entrega valida o contrato do `SecretStore`
  usando `InMemorySecretBackend`, não o backend de produção.
