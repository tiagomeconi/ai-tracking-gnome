// Funções puras de formatação (sem dependências de GJS) para serem
// testáveis com Node puro, seguindo seção 13.1 do plano (datas/reset).

/** Formata tempo restante até resetsAt como "47 min" / "1 h 32 min" / "2 dias". */
export function formatRemaining(resetsAt, now = new Date()) {
    if (!resetsAt)
        return null;
    const diffMs = new Date(resetsAt).getTime() - now.getTime();
    if (Number.isNaN(diffMs) || diffMs <= 0)
        return null;

    const totalMinutes = Math.round(diffMs / 60_000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0)
        return `${days} dia${days > 1 ? 's' : ''}`;
    if (hours > 0)
        return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
    return `${minutes} min`;
}

/** Formata tempo decorrido desde fetchedAt como "agora mesmo" / "há 3 min". */
export function formatElapsed(fetchedAt, now = new Date()) {
    if (!fetchedAt)
        return 'nunca atualizado';

    const diffMs = now.getTime() - new Date(fetchedAt).getTime();
    if (Number.isNaN(diffMs))
        return 'desconhecido';
    if (diffMs < 60_000)
        return 'agora mesmo';

    const minutes = Math.round(diffMs / 60_000);
    if (minutes < 60)
        return `há ${minutes} min`;

    const hours = Math.round(minutes / 60);
    if (hours < 24)
        return `há ${hours} h`;

    const days = Math.round(hours / 24);
    return `há ${days} dia${days > 1 ? 's' : ''}`;
}

const UNIT_LABEL_PT = {
    messages: 'mensagens',
    tokens: 'tokens',
    requests: 'requests',
    credits: 'créditos',
    percentage: '%',
    unknown: 'unidades',
};

/** Formata um número com separador de milhar (pt-BR) e o rótulo da unidade. */
export function formatUsedWithUnit(used, unit) {
    if (typeof used !== 'number')
        return null;
    const label = UNIT_LABEL_PT[unit] ?? unit ?? 'unidades';
    return `${used.toLocaleString('pt-BR')} ${label}`;
}

/**
 * Nome curto do provider para o indicador da barra superior — remove
 * sufixos entre parênteses (ex.: "Antigravity (em desenvolvimento)" vira
 * "Antigravity") para não estourar o espaço da barra.
 */
export function shortProviderName(providerName) {
    return providerName.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Formata a projeção de ritmo sustentável (`computeBudgetProjection`, ver
 * normalizer.js) como "~X %/h" ou "~X %/dia" — escolhe a unidade pela
 * duração restante da janela, pra não mostrar "%/dia" numa janela que
 * renova em 2 horas (tecnicamente correto por extrapolação, mas confuso).
 */
export function formatBudgetProjection(projection) {
    if (!projection)
        return null;

    const { hoursUntilReset, percentPerHour, percentPerDay } = projection;
    const usePerHour = hoursUntilReset < 48;
    const value = usePerHour ? percentPerHour : percentPerDay;
    const unit = usePerHour ? '%/h' : '%/dia';

    return `~${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${unit} até renovar`;
}

/** fetchedAt mais recente entre uma lista de AIProviderUsage, ou null. */
export function mostRecentFetchedAt(usages) {
    const timestamps = usages
        .map((u) => Date.parse(u.fetchedAt))
        .filter((ms) => !Number.isNaN(ms));

    if (timestamps.length === 0)
        return null;

    return new Date(Math.max(...timestamps)).toISOString();
}

const STATUS_MESSAGE = {
    unavailable: 'Indisponível no momento. Tentaremos de novo automaticamente.',
    auth_required: 'Autenticação necessária. Reconecte esta conta para retomar o monitoramento.',
    error: 'Erro temporário ao buscar os dados. Tentando de novo automaticamente.',
};

/**
 * Mensagem acionável para um provider em `unavailable`/`auth_required`/
 * `error` (seção 14: converter códigos técnicos em texto útil). Distingue
 * "sessão expirada" (token vencido: abrir o CLI uma vez resolve) de "limite
 * de consultas" (rate limit: só esperar) do erro genérico.
 */
export function providerStatusMessage(usage, now = new Date()) {
    if (usage.errorCode === 'PROVIDER_SESSION_EXPIRED')
        return 'Sessão expirada. Abra o CLI deste provedor (ex.: rode `claude`) uma vez para renovar o login.';

    if (usage.errorCode === 'PROVIDER_RATE_LIMITED') {
        const wait = formatRemaining(usage.retryAt, now);
        return wait
            ? `O provedor limitou as consultas. Nova tentativa automática em ${wait}.`
            : 'O provedor limitou as consultas. Tentaremos de novo mais tarde.';
    }

    return STATUS_MESSAGE[usage.status] ?? usage.status;
}
