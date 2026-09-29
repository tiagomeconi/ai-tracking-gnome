// Modelo de domínio normalizado (ver seção 4 do AI_Tracking_PLAN.md).
// GJS não possui checagem de tipos em runtime; os typedefs abaixo existem
// para documentação e para editores/linters com suporte a JSDoc.

/**
 * @typedef {"messages"|"tokens"|"requests"|"credits"|"percentage"|"unknown"} UsageUnit
 */

/**
 * @typedef {"minute"|"hour"|"3h"|"5h"|"day"|"week"|"month"|"custom"|"unknown"} UsageWindowKind
 */

/**
 * @typedef {Object} UsageWindow
 * @property {string} id
 * @property {string} label
 * @property {UsageUnit} unit
 * @property {number} [used]
 * @property {number} [limit]
 * @property {number} [remaining]
 * @property {number} [percent]
 * @property {UsageWindowKind} window
 * @property {string} [resetsAt] - ISO 8601
 * @property {boolean} estimated
 */

/**
 * @typedef {"ok"|"warning"|"critical"|"unavailable"|"auth_required"|"error"} ProviderStatus
 */

/**
 * @typedef {Object} AIProviderUsage
 * @property {string} providerId
 * @property {string} providerName
 * @property {string} [accountLabel]
 * @property {ProviderStatus} status
 * @property {UsageWindow[]} windows
 * @property {string} fetchedAt - ISO 8601
 * @property {boolean} stale
 * @property {string} [errorCode]
 */

// Códigos de erro internos estáveis (seção 14 do plano).
export const ErrorCode = Object.freeze({
    PROVIDER_AUTH_REQUIRED: 'PROVIDER_AUTH_REQUIRED',
    PROVIDER_RATE_LIMITED: 'PROVIDER_RATE_LIMITED',
    PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
    PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
    PROVIDER_INVALID_RESPONSE: 'PROVIDER_INVALID_RESPONSE',
    IPC_UNAVAILABLE: 'IPC_UNAVAILABLE',
    CACHE_INVALID: 'CACHE_INVALID',
});

// Thresholds de referência (seção 3, RF-03). Ponto único de verdade — a UI
// não deve duplicar esses valores.
export const USAGE_THRESHOLDS = Object.freeze({
    ATTENTION: 70,
    HIGH: 85,
    CRITICAL: 95,
});
