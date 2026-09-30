// Contrato base dos providers (seção 6 do plano). Providers concretos devem
// estender esta classe e nunca acessar componentes de UI diretamente.

export class UsageProvider {
    constructor(id, name) {
        if (new.target === UsageProvider)
            throw new Error('UsageProvider é abstrata; estenda-a em vez de instanciar diretamente.');

        this.id = id;
        this.name = name;
    }

    /**
     * Providers com autenticação normalmente implementam isto consultando
     * `SecretStore.has(this.id)` (ver lib/secrets.js, ADR-004).
     * @returns {Promise<boolean>}
     */
    async isConfigured() {
        throw new Error(`${this.constructor.name}.isConfigured() não implementado`);
    }

    /**
     * Recebe a credencial digitada pelo usuário (tela de preferências,
     * Fase 8) e a repassa a um `SecretStore` — nunca deve persisti-la em
     * outro lugar (arquivo, GSettings, log). Providers sem autenticação
     * podem não sobrescrever.
     * @param {string} [secret]
     * @returns {Promise<void>}
     */
    async connect(secret) {
        // Opcional: providers sem autenticação podem não sobrescrever.
    }

    /**
     * Invalida/remove a credencial local (tipicamente via
     * `SecretStore.clear(this.id)`). Opcional para providers sem
     * autenticação.
     * @returns {Promise<void>}
     */
    async disconnect() {
        // Opcional.
    }

    /** @returns {Promise<import('../types.js').AIProviderUsage>} */
    async fetchUsage() {
        throw new Error(`${this.constructor.name}.fetchUsage() não implementado`);
    }

    /** @returns {Promise<boolean>} */
    async healthCheck() {
        throw new Error(`${this.constructor.name}.healthCheck() não implementado`);
    }
}
