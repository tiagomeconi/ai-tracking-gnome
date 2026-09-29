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
