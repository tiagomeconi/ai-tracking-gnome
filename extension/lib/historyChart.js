// Funções puras (sem I/O/GJS) para transformar o histórico de uso num
// gráfico de barras por dia — usado pela aba "Estatísticas" das
// preferências (prefs.js, que desenha com Cairo via Gtk.DrawingArea).
// Mantém a lógica de agregação/escala testável com Node puro, sem
// depender de GTK/Cairo (seção 13.1 do plano).
//
// Por quê barras por dia (pico do dia) em vez de uma linha contínua: uma
// janela como "5 horas" reseta várias vezes por dia, então uma linha
// ligando todos os snapshots fica cada vez mais apertada/difícil de ler
// conforme o histórico acumula dias, e "somar" os percentuais de cada
// checagem não tem significado (não é uma métrica cumulativa). O pico do
// dia ("até onde você chegou nessa janela, naquele dia") é a leitura que
// continua fazendo sentido independente de quantos resets aconteceram.

/**
 * Agrupa amostras por dia (calendário local do processo que roda esta
 * função) e mantém o valor máximo de cada dia.
 *
 * @param {{timestamp: string, percent: number}[]} samples
 * @returns {{date: string, percent: number}[]} ordenado por data
 *   crescente; `date` no formato "AAAA-MM-DD".
 */
export function aggregateDailyMax(samples) {
    const byDate = new Map();

    for (const s of samples) {
        if (typeof s.percent !== 'number')
            continue;

        const date = new Date(s.timestamp);
        if (Number.isNaN(date.getTime()))
            continue;

        const key = localDateKey(date);
        const current = byDate.get(key);
        if (current === undefined || s.percent > current)
            byDate.set(key, s.percent);
    }

    return [...byDate.entries()]
        .map(([date, percent]) => ({ date, percent }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Converte dados diários (`aggregateDailyMax`) em retângulos prontos pra
 * desenhar com Cairo — uma barra por dia, distribuídas uniformemente na
 * largura disponível.
 *
 * @param {{date: string, percent: number}[]} dailyData
 * @param {{width: number, height: number, padding?: number, gap?: number}} dims
 * @returns {{bars: {x: number, y: number, width: number, height: number, date: string, percent: number}[]}}
 */
export function layoutBarChart(dailyData, { width, height, padding = 24, gap = 4 }) {
    if (dailyData.length === 0)
        return { bars: [] };

    const plotWidth = Math.max(1, width - padding * 2);
    const plotHeight = Math.max(1, height - padding * 2);
    const barSlot = plotWidth / dailyData.length;
    const barWidth = Math.max(1, barSlot - gap);

    const bars = dailyData.map((d, index) => {
        const percent = Math.max(0, Math.min(100, d.percent));
        const barHeight = (percent / 100) * plotHeight;
        return {
            x: padding + index * barSlot + gap / 2,
            y: padding + (plotHeight - barHeight),
            width: barWidth,
            height: barHeight,
            date: d.date,
            percent: d.percent,
        };
    });

    return { bars };
}
