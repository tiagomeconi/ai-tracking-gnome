import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildCompactRows, buildPanelReading, knownWindows } from '../extension/lib/compact.js';

const NOW = new Date('2026-01-01T12:00:00Z');
const usage = (providerId, providerName, windows, status = 'ok') => ({ providerId, providerName, status, windows });
const claude = usage('claude', 'Claude', [
    { id: '5h', label: '5 horas', percent: 40, unit: 'percentage', resetsAt: '2026-01-01T14:00:00Z' },
    { id: '7d', label: '7 dias', percent: 99, unit: 'percentage', resetsAt: '2026-01-04T12:00:00Z' },
]);
const codex = usage('codex', 'Codex (ChatGPT)', [{ id: 'w', label: 'Semanal', percent: 16, unit: 'percentage' }]);

test('buildCompactRows: maior consumo por padrão, janela escolhida e texto de renovação', () => {
    const [a, b] = buildCompactRows([claude, codex], {}, NOW);
    assert.deepEqual([a.label, a.percent, a.state, a.resetText], ['7 dias', 99, 'critical', 'renova em 3 dias']);
    assert.deepEqual([b.name, b.percent, b.resetText], ['Codex', 16, null]);

    const [chosen] = buildCompactRows([claude], { claude: '5h' }, NOW);
    assert.deepEqual([chosen.label, chosen.percent, chosen.resetText], ['5 horas', 40, 'renova em 2 h']);
});

test('buildCompactRows: provider sem dado fica com percent null e estado unknown', () => {
    const [row] = buildCompactRows([usage('x', 'X', [], 'auth_required')], {}, NOW);
    assert.deepEqual([row.percent, row.state, row.label], [null, 'unknown', null]);
});

test('buildPanelReading: automático, IA escolhida, escolhida sem dado e escolhida ausente', () => {
    assert.deepEqual(buildPanelReading([claude, codex]), { name: 'Claude', percent: 99, state: 'critical' });
    assert.deepEqual(buildPanelReading([claude, codex], 'codex'), { name: 'Codex', percent: 16, state: 'normal' });
    assert.deepEqual(buildPanelReading([usage('x', 'X', [], 'error')], 'x'), { name: 'X', percent: null, state: 'unknown' });
    assert.equal(buildPanelReading([claude], 'sumiu').name, 'Claude');
    assert.equal(buildPanelReading([]), null);
});

test('knownWindows: providerId -> [{id,label}]', () => {
    assert.deepEqual(knownWindows([codex]), { codex: [{ id: 'w', label: 'Semanal' }] });
});
