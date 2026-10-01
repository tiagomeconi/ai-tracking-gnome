// SecretStore (Fase 5, ADR-004): abstração sobre armazenamento seguro de
// credenciais de provider. Regra inegociável (seção 8.1 do plano): o valor
// de um secret nunca aparece em log, exceção ou texto de erro — apenas o
// providerId e o resultado da operação.

const SCHEMA_NAME = 'io.prohound.AIUsageMonitor.ProviderCredential';

/**
 * Backend em memória — **somente para desenvolvimento/testes**. Não é
 * criptografado, não persiste entre sessões e nunca deve ser usado como
 * backend padrão em produção. Existe para permitir testar `SecretStore`
 * sem depender de libsecret/D-Bus, indisponíveis neste ambiente de
 * desenvolvimento.
 */
export class InMemorySecretBackend {
    constructor() {
        this._values = new Map();
    }

    async store(providerId, secret) {
        this._values.set(providerId, secret);
    }

    async lookup(providerId) {
        return this._values.get(providerId) ?? null;
    }

    async clear(providerId) {
        this._values.delete(providerId);
    }
}

/**
 * Backend real via libsecret/GNOME Keyring (`gi://Secret`). O import é
 * feito de forma dinâmica/lazy no primeiro uso para que este módulo
 * continue importável em ambientes sem GJS (ex.: testes em Node) — o
 * `gi://Secret` só é resolvido quando `store`/`lookup`/`clear` é realmente
 * chamado dentro do processo do GNOME Shell.
 *
 * NÃO validado contra um Secret Service real neste ambiente de
 * desenvolvimento (sandbox sem sessão D-Bus/GNOME Keyring) — ver
 * docs/decisions/ADR-004-secret-storage.md.
 */
export class LibsecretBackend {
    constructor() {
        this._Secret = null;
        this._schema = null;
    }

    async _ensureLoaded() {
        if (this._Secret)
            return;

        const module = await import('gi://Secret');
        const Secret = module.default ?? module;
        this._Secret = Secret;
        this._schema = new Secret.Schema(
            SCHEMA_NAME,
            Secret.SchemaFlags.NONE,
            { 'provider-id': Secret.SchemaAttributeType.STRING }
        );
    }

    async store(providerId, secret) {
        await this._ensureLoaded();
        const Secret = this._Secret;

        return new Promise((resolve, reject) => {
            // GJS expõe a variante GI-friendly `secret_password_storev` (C)
            // sob o nome sem "v" — confirmado em runtime real ao validar
            // AntigravitySubscriptionProvider (ver ADR-008).
            Secret.password_store(
                this._schema,
                { 'provider-id': providerId },
                Secret.COLLECTION_DEFAULT,
                `AI Usage Monitor — ${providerId}`,
                secret,
                null,
                (_source, result) => {
                    try {
                        Secret.password_store_finish(result);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                }
            );
        });
    }

    async lookup(providerId) {
        await this._ensureLoaded();
        const Secret = this._Secret;

        return new Promise((resolve, reject) => {
            Secret.password_lookup(
                this._schema,
                { 'provider-id': providerId },
                null,
                (_source, result) => {
                    try {
                        resolve(Secret.password_lookup_finish(result) ?? null);
                    } catch (error) {
                        reject(error);
                    }
                }
            );
        });
    }

    async clear(providerId) {
        await this._ensureLoaded();
        const Secret = this._Secret;

        return new Promise((resolve, reject) => {
            Secret.password_clear(
                this._schema,
                { 'provider-id': providerId },
                null,
                (_source, result) => {
                    try {
                        resolve(Secret.password_clear_finish(result));
                    } catch (error) {
                        reject(error);
                    }
                }
            );
        });
    }
}

/**
 * Fachada usada pelos providers. Nunca loga o valor do secret — apenas o
 * providerId deve aparecer em mensagens de erro/observabilidade.
 */
export class SecretStore {
    constructor(backend = new LibsecretBackend()) {
        this._backend = backend;
    }

    async store(providerId, secret) {
        if (typeof secret !== 'string' || secret.length === 0)
            throw new Error(`SecretStore: secret inválido para provider "${providerId}"`);
        await this._backend.store(providerId, secret);
    }

    async lookup(providerId) {
        return this._backend.lookup(providerId);
    }

    async has(providerId) {
        return (await this.lookup(providerId)) != null;
    }

    async clear(providerId) {
        await this._backend.clear(providerId);
    }
}
