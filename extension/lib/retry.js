// Timeout + retry controlado com backoff (Fase 3 do plano). Puro/testável
// com Node — depende apenas de setTimeout/clearTimeout, disponíveis tanto em
// Node quanto em GJS moderno (GNOME 45+).

export class TimeoutError extends Error {
    constructor(message = 'Operação expirou') {
        super(message);
        this.name = 'TimeoutError';
    }
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Corre `fn()` e rejeita com TimeoutError se ela não resolver em timeoutMs. */
export function withTimeout(fn, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new TimeoutError()), timeoutMs);
        fn().then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}

/**
 * Executa `fn` com até `retries` tentativas extras, backoff linear entre
 * elas, e timeout opcional por tentativa. `shouldRetry(error)` decide se uma
 * falha específica merece nova tentativa (ex.: não insistir em rate limit).
 */
export async function withRetry(fn, {
    retries = 0,
    backoffMs = 0,
    timeoutMs,
    shouldRetry = () => true,
} = {}) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return typeof timeoutMs === 'number'
                ? await withTimeout(fn, timeoutMs)
                : await fn();
        } catch (error) {
            lastError = error;
            const isLastAttempt = attempt === retries;
            if (isLastAttempt || !shouldRetry(error))
                throw error;
            if (backoffMs > 0)
                await delay(backoffMs * (attempt + 1));
        }
    }

    throw lastError;
}
