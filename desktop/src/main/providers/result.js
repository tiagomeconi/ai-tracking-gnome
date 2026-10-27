// Monta o AIProviderUsage devolvido pelos providers (mesmo formato da
// extensão GNOME — ver shared/types.js).

export function makeResult(provider, manageUrl, status, windows = [], errorCode) {
    return {
        providerId: provider.id,
        providerName: provider.name,
        manageUrl,
        status,
        windows,
        fetchedAt: new Date().toISOString(),
        stale: false,
        errorCode,
    };
}

export function logError(error, message) {
    console.error(message, error?.message ?? error);
}
