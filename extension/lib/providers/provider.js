// Contrato base dos providers (seção 6 do plano). Providers concretos devem
// estender esta classe e nunca acessar componentes de UI diretamente.

export class UsageProvider {
    constructor(id, name) {
        if (new.target === UsageProvider)
            throw new Error('UsageProvider é abstrata; estenda-a em vez de instanciar diretamente.');

        this.id = id;
        this.name = name;
    }

    /** @returns {Promise<boolean>} */
    async isConfigured() {
        throw new Error(`${this.constructor.name}.isConfigured() não implementado`);
    }

    /** @returns {Promise<void>} */
    async connect() {
        // Opcional: providers sem autenticação podem não sobrescrever.
    }

    /** @returns {Promise<void>} */
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
