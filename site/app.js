// AI Usage Monitor — landing page. Bibliotecas (via CDN, todas opcionais):
// GSAP + ScrollTrigger (animações), Lenis (rolagem suave), vanilla-tilt.
// Se alguma falhar, a página continua legível e funcional.

(() => {
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
    const hasGsap = typeof window.gsap !== 'undefined';
    const hasST = hasGsap && typeof window.ScrollTrigger !== 'undefined';
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const store = {
        get: (k) => { try { return localStorage.getItem(k); } catch (_e) { return null; } },
        set: (k, v) => { try { localStorage.setItem(k, v); } catch (_e) { /* modo privado */ } },
    };

    // ---------- Idioma ----------
    const PT_EXTRA = {
        'story.s1': 'Atenção: o seu ritmo está acelerando.',
        'story.s2': 'Alto: hora de priorizar o que importa.',
        'story.s3': 'Crítico — o limite chegou no meio da tarefa.',
    };
    const STATE_NAMES = {
        pt: { ok: 'Normal', warn: 'Atenção', hi: 'Alto', crit: 'Crítico' },
        en: { ok: 'Normal', warn: 'Warning', hi: 'High', crit: 'Critical' },
    };
    let lang = store.get('aum-lang') || ((navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en');

    $$('[data-i18n]').forEach((el) => { el.dataset.pt = el.innerHTML; });
    const tr = (key) => {
        if (lang === 'en') return (window.AUM_EN || {})[key] ?? PT_EXTRA[key] ?? key;
        const el = $(`[data-i18n="${key}"]`);
        return PT_EXTRA[key] ?? el?.dataset.pt ?? key;
    };

    function applyLang() {
        document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
        $('#lang-label').textContent = lang.toUpperCase();
        $$('[data-i18n]').forEach((el) => {
            const html = lang === 'en' ? (window.AUM_EN || {})[el.dataset.i18n] : el.dataset.pt;
            if (html != null) el.innerHTML = html;
        });
        splitHero(true);
        renderDemo();
        updateStory(storyProgress, true);
        heroState(heroP);
    }

    $('#lang').addEventListener('click', () => {
        lang = lang === 'pt' ? 'en' : 'pt';
        store.set('aum-lang', lang);
        applyLang();
    });

    // ---------- Tema ----------
    $('#theme').addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        store.set('aum-theme', next);
        drawTray();
    });

    // ---------- Utilidades de estado (mesmos limites do app: 70 / 85 / 95) ----------
    const stateOf = (p) => (p >= 95 ? 'crit' : p >= 85 ? 'hi' : p >= 70 ? 'warn' : 'ok');
    const COLOR = { ok: '#3a9c3a', warn: '#d0a020', hi: '#d97706', crit: '#cc3333' };
    const fmtMinutes = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`);

    // ---------- Partículas de texto (hero) ----------
    function splitHero(redo) {
        const h1 = $('.hero h1');
        if (!h1 || !hasGsap || h1.querySelector('.word')) return;
        const walk = (node) => {
            [...node.childNodes].forEach((n) => {
                if (n.nodeType === 3) {
                    const frag = document.createDocumentFragment();
                    n.textContent.split(/(\s+)/).forEach((part) => {
                        if (!part) return;
                        if (/^\s+$/.test(part)) { frag.append(part); return; }
                        const span = document.createElement('span');
                        span.className = 'word';
                        span.textContent = part;
                        frag.append(span);
                    });
                    n.replaceWith(frag);
                } else if (n.nodeType === 1) walk(n);
            });
        };
        walk(h1);
        if (redo) gsap.set($$('.word', h1), { opacity: 1, y: 0 });
    }

    // ---------- Hero: velocímetro em loop ----------
    const hg = { fill: $('#hg-fill'), needle: $('#hg-needle'), pct: $('#hg-pct'), state: $('#hg-state'), bars: [0, 1, 2].map((i) => $(`#hb-${i}`)), provider: $('#hero-provider') };
    let heroP = 31;
    function heroState(p) {
        heroP = p;
        const s = stateOf(p);
        hg.fill.style.strokeDashoffset = String(100 - p);
        hg.fill.style.stroke = COLOR[s];
        hg.needle.style.transform = `rotate(${-90 + p * 1.8}deg)`;
        hg.pct.textContent = `${Math.round(p)}%`;
        hg.pct.style.color = COLOR[s];
        hg.state.textContent = STATE_NAMES[lang][s];
        const widths = [p, 18 + p * 0.28, 12 + p * 0.4];
        hg.bars.forEach((b, i) => {
            b.style.setProperty('--w', `${widths[i]}%`);
            b.className = stateOf(widths[i]);
        });
    }

    function startHeroLoop() {
        const o = { p: 31 };
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.4 });
        [62, 87, 98, 31].forEach((to) => {
            tl.to(o, { p: to, duration: 1.6, ease: 'power2.inOut', onUpdate: () => heroState(o.p) });
            tl.to({}, { duration: 1.1 });
        });
    }

    // ---------- História: o limite chegando ----------
    let storyProgress = 0;
    const st = { bar: $('#story-bar'), pct: $('#story-pct'), pill: $('#story-state'), renew: $('#story-renew'), line: $('#story-line'), toast: $('#story-toast'), toastText: $('#toast-text') };
    let lastStoryKey = '';
    let toastShown = false;
    function updateStory(progress, force) {
        storyProgress = progress;
        const p = Math.min(100, Math.round(progress * 104));
        const s = stateOf(p);
        st.bar.style.width = `${p}%`;
        st.bar.style.background = COLOR[s];
        st.pct.textContent = `${p}%`;
        st.pill.textContent = STATE_NAMES[lang][s];
        st.pill.style.color = COLOR[s];
        st.pill.style.background = `${COLOR[s]}2e`;
        const minutes = Math.max(4, 299 - Math.round(progress * 280));
        st.renew.textContent = lang === 'pt' ? `renova em ${fmtMinutes(minutes)}` : `renews in ${fmtMinutes(minutes)}`;
        const key = { ok: 's0', warn: 's1', hi: 's2', crit: 's3' }[s];
        if (key !== lastStoryKey || force) {
            lastStoryKey = key;
            const text = tr(`story.${key}`);
            if (hasGsap && !force) {
                gsap.fromTo(st.line, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' });
            }
            st.line.textContent = text;
            st.line.style.color = s === 'ok' ? '' : COLOR[s];
        }
        const show = p >= 80;
        if (show !== toastShown) {
            toastShown = show;
            st.toastText.textContent = lang === 'pt'
                ? `80% usado · Atenção — renova em ${fmtMinutes(minutes)}`
                : `80% used · Warning — renews in ${fmtMinutes(minutes)}`;
            if (hasGsap) gsap.to(st.toast, { opacity: show ? 1 : 0, y: show ? 0 : 24, scale: show ? 1 : 0.96, duration: 0.5, ease: 'back.out(1.6)' });
            else st.toast.style.opacity = show ? '1' : '0';
        }
    }

    // ---------- Demo ao vivo ----------
    const AIS = [
        { name: 'Claude', hours: 2.25, win: { pt: '5 horas', en: '5-hour' }, renew: { pt: 'renova em 2 h 15', en: 'renews in 2 h 15' } },
        { name: 'Codex', hours: 120, win: { pt: 'semanal', en: 'weekly' }, renew: { pt: 'renova em 5 dias', en: 'renews in 5 days' } },
        { name: 'Antigravity', hours: 5, win: { pt: 'Gemini 3 Pro', en: 'Gemini 3 Pro' }, renew: { pt: 'renova em 5 h', en: 'renews in 5 h' } },
    ];
    const demo = { values: [62, 34, 41], ai: 'auto', style: 'gauge' };

    function paceText(i) {
        const left = 100 - demo.values[i];
        const hours = AIS[i].hours;
        const perDay = hours > 24;
        const v = perDay ? left / (hours / 24) : left / hours;
        const num = v.toFixed(1).replace('.', lang === 'pt' ? ',' : '.');
        return lang === 'pt' ? `Ritmo seguro: ~${num} %/${perDay ? 'dia' : 'h'}` : `Safe pace: ~${num} %/${perDay ? 'day' : 'h'}`;
    }

    function trayReading() {
        if (demo.ai === 'auto') return Math.max(...demo.values);
        return demo.values[Number(demo.ai)];
    }

    function drawTray() {
        const p = Math.round(trayReading());
        const s = stateOf(p);
        const c = COLOR[s];
        const dark = document.documentElement.dataset.theme === 'dark';
        const ink = dark ? '#ffffff' : '#1d1738';
        const track = dark ? 'rgba(255,255,255,.28)' : 'rgba(29,23,56,.22)';
        let svg;
        if (demo.style === 'gauge') {
            const L = Math.PI * 11;
            const angle = (-90 + Math.min(100, p) * 1.8) * Math.PI / 180;
            const nx = 16 + Math.sin(angle) * 8;
            const ny = 22 - Math.cos(angle) * 8;
            svg = `<svg viewBox="0 0 32 32"><path d="M5 22 A11 11 0 0 1 27 22" fill="none" stroke="${track}" stroke-width="4.2" stroke-linecap="round"/>
                <path d="M5 22 A11 11 0 0 1 27 22" fill="none" stroke="${c}" stroke-width="4.2" stroke-linecap="round" stroke-dasharray="${L} ${L}" stroke-dashoffset="${L * (1 - p / 100)}"/>
                <line x1="16" y1="22" x2="${nx.toFixed(2)}" y2="${ny.toFixed(2)}" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>
                <text x="16" y="31" text-anchor="middle" font-size="8.5" font-weight="800" fill="${ink}" font-family="Inter,sans-serif">${Math.min(99, p)}</text></svg>`;
        } else {
            svg = `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="${c}"/>
                <text x="16" y="21" text-anchor="middle" font-size="14" font-weight="800" fill="${s === 'warn' ? '#1d1738' : '#fff'}" font-family="Inter,sans-serif">${Math.min(99, p)}</text></svg>`;
        }
        $('#tray-icon').innerHTML = svg;
    }

    function renderDemo() {
        $$('.slider').forEach((label) => {
            const input = $('input', label);
            const i = Number(input.dataset.ai);
            $('output', label).textContent = `${demo.values[i]}%`;
            input.style.setProperty('--p', `${demo.values[i]}%`);
        });
        const renderRows = (selector, pctSel, subSel, withPace) => {
            $$(selector).forEach((row) => {
                const i = Number(row.dataset.i);
                const p = demo.values[i];
                const s = stateOf(p);
                $(pctSel, row).textContent = `${p}%`;
                $(pctSel, row).style.color = COLOR[s];
                const b = $('.bar b', row);
                b.style.setProperty('--w', `${p}%`);
                b.className = s;
                $(subSel, row).textContent = withPace
                    ? `${AIS[i].win[lang]} · ${AIS[i].renew[lang]} · ${paceText(i)}`
                    : `${AIS[i].win[lang]} · ${AIS[i].renew[lang]}`;
            });
        };
        renderRows('.pp-row', '.pp-pct', '.pp-sub', true);
        renderRows('.wd-row', '.wd-pct', '.wd-sub', false);
        drawTray();
    }

    function initDemo() {
        $$('.slider input').forEach((input) => {
            input.addEventListener('input', () => {
                demo.values[Number(input.dataset.ai)] = Number(input.value);
                renderDemo();
            });
        });
        const seg = (id, key) => {
            const group = $(id);
            group.addEventListener('click', (event) => {
                const btn = event.target.closest('button');
                if (!btn) return;
                $$('button', group).forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
                demo[key] = btn.dataset.v;
                renderDemo();
            });
        };
        seg('#seg-ai', 'ai');
        seg('#seg-style', 'style');

        const trayBtn = $('#tray-btn');
        const pop = $('#panel-pop');
        const toggle = () => {
            const open = pop.hidden;
            pop.hidden = !open;
            trayBtn.setAttribute('aria-expanded', String(open));
            if (open && hasGsap) gsap.fromTo(pop, { opacity: 0, y: -10, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'back.out(1.6)' });
        };
        trayBtn.addEventListener('click', toggle);

        // Widget arrastável dentro da "área de trabalho".
        const desk = $('#desktop');
        const widget = $('#widget-demo');
        let drag = null;
        widget.addEventListener('pointerdown', (e) => {
            const r = widget.getBoundingClientRect();
            drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
            widget.classList.add('dragging');
            widget.setPointerCapture(e.pointerId);
            $('.drag-hint', widget)?.remove();
        });
        widget.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const d = desk.getBoundingClientRect();
            const x = Math.min(Math.max(0, e.clientX - d.left - drag.dx), d.width - widget.offsetWidth);
            const y = Math.min(Math.max(48, e.clientY - d.top - drag.dy), d.height - widget.offsetHeight);
            widget.style.left = `${x}px`;
            widget.style.top = `${y}px`;
        });
        const end = () => { drag = null; widget.classList.remove('dragging'); };
        widget.addEventListener('pointerup', end);
        widget.addEventListener('pointercancel', end);
    }

    // ---------- Abas, copiar, FAQ ----------
    function initTabs() {
        const buttons = $$('[role="tab"]');
        buttons.forEach((btn) => btn.addEventListener('click', () => {
            buttons.forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
            $$('.tab-panel').forEach((panel) => {
                const show = panel.dataset.panel === btn.dataset.tab;
                panel.hidden = !show;
                if (show && hasGsap) gsap.fromTo(panel, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' });
            });
        }));
    }

    function initCopy() {
        $$('.copy').forEach((btn) => btn.addEventListener('click', async () => {
            const text = $('code', btn.parentElement).textContent;
            try { await navigator.clipboard.writeText(text); } catch (_e) { /* sem permissão: ignora */ }
            const old = btn.textContent;
            btn.textContent = lang === 'pt' ? 'Copiado!' : 'Copied!';
            btn.classList.add('done');
            setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); }, 1500);
        }));
    }

    // ---------- Navegação: seção ativa ----------
    function initNavSpy() {
        const links = $$('.nav-links a');
        const sections = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`));
            });
        }, { rootMargin: '-45% 0px -50% 0px' });
        sections.forEach((s) => io.observe(s));
    }

    // ---------- Efeitos de mouse ----------
    function initSpotlight() {
        $$('.spot').forEach((card) => card.addEventListener('pointermove', (e) => {
            const r = card.getBoundingClientRect();
            card.style.setProperty('--mx', `${e.clientX - r.left}px`);
            card.style.setProperty('--my', `${e.clientY - r.top}px`);
        }));
    }

    function initParallax() {
        const hero = $('#hero-visual');
        if (!hero || !hasGsap || reduceMotion) return;
        window.addEventListener('pointermove', (e) => {
            const x = e.clientX / innerWidth - 0.5;
            const y = e.clientY / innerHeight - 0.5;
            $$('.float', hero).forEach((el) => {
                const depth = Number(el.dataset.depth);
                gsap.to(el, { x: x * depth * 2, y: y * depth * 2, duration: 0.9, ease: 'power3.out', overwrite: 'auto' });
            });
        });
    }

    // ---------- Início ----------
    if (lang !== 'pt') applyLang();
    initDemo();
    initTabs();
    initCopy();
    initNavSpy();
    initSpotlight();
    renderDemo();
    heroState(31);
    updateStory(0, true);

    if (!hasGsap || reduceMotion) return;

    document.documentElement.classList.add('has-gsap');
    if (hasST) gsap.registerPlugin(ScrollTrigger);
    splitHero();
    gsap.set('.hero h1 .word', { opacity: 0, y: 40 });

    // Rolagem suave.
    if (typeof window.Lenis !== 'undefined' && hasST) {
        const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((t) => lenis.raf(t * 1000));
        gsap.ticker.lagSmoothing(0);
        $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
            const target = $(a.getAttribute('href'));
            if (!target) return;
            e.preventDefault();
            lenis.scrollTo(target, { offset: -70 });
        }));
    }

    // Entrada do hero.
    const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
    intro.to('.hero h1 .word', { opacity: 1, y: 0, duration: 0.9, stagger: 0.06 }, 0.1)
        .to('.hero .reveal', { opacity: 1, y: 0, duration: 0.8, stagger: 0.1 }, 0.35);
    startHeroLoop();
    initParallax();

    if (typeof window.VanillaTilt !== 'undefined')
        VanillaTilt.init($$('[data-tilt]'), { max: 6, speed: 600, glare: true, 'max-glare': 0.12, scale: 1.01 });

    if (!hasST) { $$('.reveal').forEach((el) => { el.style.opacity = 1; el.style.transform = 'none'; }); return; }

    // Revelar ao rolar.
    ScrollTrigger.batch('.reveal:not(.hero .reveal)', {
        start: 'top 90%',
        once: true,
        onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out', overwrite: true }),
    });

    // História (pin via CSS sticky; só lemos o progresso).
    ScrollTrigger.create({ trigger: '#story', start: 'top top', end: 'bottom bottom', scrub: true, onUpdate: (self) => updateStory(self.progress) });

    // Barras de exemplo nos cartões.
    $$('.mock-row').forEach((row) => ScrollTrigger.create({ trigger: row, start: 'top 92%', once: true, onEnter: () => row.classList.add('in') }));

    // Linha do fluxo "Como funciona".
    ScrollTrigger.create({
        trigger: '.flow', start: 'top 75%', end: 'bottom 60%', scrub: true,
        onUpdate: (self) => { $('.flow-line i').style.width = `${self.progress * 100}%`; },
    });

    // Cadeado fecha ao entrar.
    ScrollTrigger.create({ trigger: '.privacy', start: 'top 70%', once: true, onEnter: () => $('.privacy').classList.add('locked') });

    // Imagens preguiçosas e fontes mudam a altura da página depois da primeira
    // medição: remede as posições (com debounce) quando terminarem de carregar.
    let refreshTimer = null;
    const scheduleRefresh = () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 150);
    };
    window.addEventListener('load', scheduleRefresh);
    document.fonts?.ready.then(scheduleRefresh);
    $$('img[loading="lazy"]').forEach((img) => { if (!img.complete) img.addEventListener('load', scheduleRefresh, { once: true }); });

    // Leve parallax do aurora.
    gsap.to('.aurora', { yPercent: -8, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } });
})();
