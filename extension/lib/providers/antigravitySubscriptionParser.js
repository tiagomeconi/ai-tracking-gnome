// Parser puro (sem I/O) das respostas de
// `POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist` e
// `POST https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`
// — o backend real que o Antigravity CLI oficial (antigravity.google) chama
// internamente por trás do comando `/usage`/`/quota`. Endpoint não
// documentado publicamente pelo Google — formato de resposta verificado a
// partir do projeto open-source antigravity-usage
// (github.com/skainguyen1412/antigravity-usage, MIT), que implementa a
// mesma integração (papel equivalente ao tokidachi para Claude/Codex). Ver
// docs/providers/gemini.md e ADR-007.

function shouldShowModel(modelId, model) {
    if (!model?.quotaInfo)
        return false;
    // Filtra modelos internos/experimentais que a própria UI do Antigravity
    // esconde do usuário (mesmos prefixos/substrings usados pelo parser de
    // referência do antigravity-usage).
    if (modelId.startsWith('chat_') || modelId.startsWith('tab_') || modelId.startsWith('rev'))
        return false;
    if (modelId.includes('image') || modelId.includes('mquery') || modelId.includes('lite'))
        return false;
    return true;
}

function normalizeResetsAt(value) {
    if (value == null)
        return undefined;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function clampPercent(raw) {
    return Math.max(0, Math.min(100, raw));
}

function parseModelWindows(modelsResponse) {
    const windows = [];
    const modelsMap = modelsResponse?.models;
    if (!modelsMap || typeof modelsMap !== 'object')
        return windows;

    for (const [modelId, model] of Object.entries(modelsMap)) {
        if (!shouldShowModel(modelId, model))
            continue;

        const remainingFraction = model.quotaInfo?.remainingFraction;
        if (typeof remainingFraction !== 'number' || !Number.isFinite(remainingFraction))
            continue;

        windows.push({
            id: modelId,
            label: model.displayName || model.label || modelId,
            unit: 'percentage',
            percent: clampPercent((1 - remainingFraction) * 100),
            window: 'unknown',
            resetsAt: normalizeResetsAt(model.quotaInfo?.resetTime),
            estimated: false,
        });
    }

    return windows;
}

/**
 * A Cloud Code API às vezes retorna mais de um `modelId` com o mesmo
 * `displayName`/percentual/reset (ex.: variantes internas do mesmo modelo
 * visível) — resultando em linhas idênticas duplicadas na UI. Como
 * `label`+`percent`+`resetsAt` são exatamente o que o usuário vê, duas
 * janelas com essa combinação idêntica são indistinguíveis na prática;
 * mantém só a primeira ocorrência.
 */
function dedupeByVisibleContent(windows) {
    const seen = new Set();
    const result = [];
    for (const window of windows) {
        const key = JSON.stringify([window.label, window.percent, window.resetsAt ?? null]);
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(window);
    }
    return result;
}

function parsePromptCreditsWindow(codeAssistResponse) {
    const monthly = codeAssistResponse?.planInfo?.monthlyPromptCredits;
    const available = codeAssistResponse?.availablePromptCredits;
    if (typeof monthly !== 'number' || monthly <= 0 || typeof available !== 'number')
        return null;

    const used = monthly - available;
    return {
        id: 'prompt-credits',
        label: 'Créditos de prompt (mensal)',
        unit: 'credits',
        used,
        limit: monthly,
        remaining: available,
        percent: clampPercent((used / monthly) * 100),
        window: 'month',
        estimated: false,
    };
}

/**
 * @param {unknown} codeAssistResponse - JSON já parseado da resposta de
 *   `loadCodeAssist`
 * @param {unknown} modelsResponse - JSON já parseado da resposta de
 *   `fetchAvailableModels` (pode ser `{}` se a chamada falhou/foi omitida)
 * @returns {import('../types.js').UsageWindow[]}
 */
export function parseAntigravityQuota(codeAssistResponse, modelsResponse) {
    const windows = dedupeByVisibleContent(
        parseModelWindows(modelsResponse).sort((a, b) => a.label.localeCompare(b.label))
    );

    const promptCredits = parsePromptCreditsWindow(codeAssistResponse);
    if (promptCredits)
        windows.push(promptCredits);

    return windows;
}
