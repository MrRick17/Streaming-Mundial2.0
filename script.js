document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 0. CONFIGURACIÓN
    // ==========================================
    const MODO_PRUEBA = false; // true = guarda en localStorage en vez de Firebase

    const firebaseConfig = {
        apiKey: "AIzaSyBA0NsciehTINXpRz50VzB-Vu2_KAFaOlc",
        authDomain: "streaming-mundial-2.firebaseapp.com",
        projectId: "streaming-mundial-2",
        storageBucket: "streaming-mundial-2.firebasestorage.app",
        messagingSenderId: "973602705953",
        appId: "1:973602705953:web:2b67d4e70198e93ea58960"
    };

    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    // ==========================================
    // 1. PLATAFORMAS (una sola fuente de verdad)
    //    Para agregar una plataforma nueva, añade una línea aquí.
    //    sinClave = el cliente no recibe contraseña (invitación por correo)
    // ==========================================
    const PLATAFORMAS = [
        { nombre: 'Netflix',          icono: 'fa-solid fa-play',                 color: '#E50914' },
        { nombre: 'Max',              icono: 'fa-solid fa-tv',                   color: '#4F6BFF' },
        { nombre: 'Spotify Familiar', icono: 'fa-brands fa-spotify',             color: '#1DB954', sinClave: true },
        { nombre: 'Spotify Personal', icono: 'fa-brands fa-spotify',             color: '#1ED760', sinClave: true },
        { nombre: 'Disney+',          icono: 'fa-solid fa-star',                 color: '#4C74FF' },
        { nombre: 'Amazon Prime',     icono: 'fa-brands fa-amazon',              color: '#00A8E1' },
        { nombre: 'Crunchyroll',      icono: 'fa-solid fa-fire',                 color: '#F47521' },
        { nombre: 'YouTube Premium',  icono: 'fa-brands fa-youtube',             color: '#FF3B3B' },
        { nombre: 'Canva',            icono: 'fa-solid fa-palette',              color: '#9D5CFF', sinClave: true },
        { nombre: 'CapCut',           icono: 'fa-solid fa-video',                color: '#00F2FE', sinClave: true },
        { nombre: 'IPTV',             icono: 'fa-solid fa-satellite-dish',       color: '#14B8A6' },
        { nombre: 'ViX',              icono: 'fa-solid fa-video',                color: '#FF1A75' },
        { nombre: 'Paramount+',       icono: 'fa-solid fa-mountain',             color: '#3D8BFF' },
        { nombre: 'Gemini',           icono: 'fa-solid fa-wand-magic-sparkles',  color: '#B26BFF', sinClave: true }
    ];
    const platDef = (n) => PLATAFORMAS.find(p => p.nombre === n) || { nombre: n, icono: 'fa-solid fa-play', color: '#94A3B8' };

    // ==========================================
    // 2. UTILIDADES
    // ==========================================
    const $ = (id) => document.getElementById(id);
    const pad = (n) => String(n).padStart(2, '0');
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const dinero = (n) => '$' + (parseFloat(n) || 0).toFixed(2);
    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const aInputFecha = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const desdeInputFecha = (v) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999).getTime(); };
    const fechaCorta = (ts) => { if (!ts) return 'Sin fecha'; const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
    const inicioDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diasHasta = (ts) => Math.round((inicioDia(new Date(ts)) - inicioDia(new Date())) / 86400000);
    const textoDias = (ts) => {
        if (!ts) return '';
        const n = diasHasta(ts);
        if (n === 0) return 'Hoy';
        if (n === 1) return 'Mañana';
        if (n === -1) return 'Ayer';
        return n > 0 ? `En ${n} días` : `Hace ${Math.abs(n)} días`;
    };
    const sumarDuracion = (base, dur) => {
        const d = new Date(base);
        if (dur === '1m') d.setDate(d.getDate() + 28);
        if (dur === '3m') d.setMonth(d.getMonth() + 3);
        if (dur === '6m') d.setMonth(d.getMonth() + 6);
        if (dur === '1y') d.setFullYear(d.getFullYear() + 1);
        return d;
    };

    // Estado global en memoria
    let cuentas = [];
    let clientes = [];
    let historialPagos = [];
    let costosProveedores = {};

    // ==========================================
    // 3. NOTIFICACIONES, MODALES Y COPIAR
    // ==========================================
    const mostrarNotificacion = (mensaje, tipo = 'success') => {
        const container = $('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast--${tipo}`;
        const icono = tipo === 'success' ? 'fa-circle-check' : (tipo === 'info' ? 'fa-circle-info' : 'fa-bell');
        toast.innerHTML = `<i class="fa-solid ${icono}"></i> ${esc(mensaje)}`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast--hiding');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    const toggleModal = (modalId, show) => {
        const modal = $(modalId);
        if (!modal) return;
        modal.classList.toggle('modal-oculto', !show);
        document.body.classList.toggle('modal-open', !!document.querySelector('.modal-overlay:not(.modal-oculto)'));
    };

    // Cerrar con Esc o tocando fuera
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const abiertos = document.querySelectorAll('.modal-overlay:not(.modal-oculto)');
        if (abiertos.length) toggleModal(abiertos[abiertos.length - 1].id, false);
    });
    document.querySelectorAll('.modal-overlay').forEach(ov => {
        ov.addEventListener('mousedown', (e) => { if (e.target === ov) toggleModal(ov.id, false); });
    });

    const copiarTexto = async (texto, msg = 'Copiado al portapapeles') => {
        try {
            await navigator.clipboard.writeText(texto);
        } catch (err) {
            const ta = document.createElement('textarea');
            ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); } catch (e2) { /* nada */ }
            ta.remove();
        }
        mostrarNotificacion(msg, 'info');
    };

    const animarNumero = (el, valor, formato) => {
        if (!el) return;
        const previo = parseFloat(el.dataset.val || 0) || 0;
        el.dataset.val = valor;
        cancelAnimationFrame(el._raf);
        if (previo === valor || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            el.textContent = formato(valor);
            return;
        }
        const t0 = performance.now(), dur = 600;
        const paso = (t) => {
            const p = Math.min((t - t0) / dur, 1);
            const e = 1 - Math.pow(1 - p, 3);
            el.textContent = formato(previo + (valor - previo) * e);
            if (p < 1) el._raf = requestAnimationFrame(paso);
        };
        el._raf = requestAnimationFrame(paso);
    };
    const fmtEntero = (v) => String(Math.round(v));

    // Brillo que sigue al cursor en las tarjetas
    document.addEventListener('pointermove', (e) => {
        const card = e.target.closest ? e.target.closest('.cuenta-card, .cliente-card, .kpi-card, .plat-card') : null;
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });

    // ==========================================
    // 4. MOTOR DE TEMAS (color inteligente + fondos)
    // ==========================================
    const CLAVE_TEMA = 'sm_tema_v1';
    const TEMA_DEFAULT = { acento: '#38BDF8', fondo: 'aurora', fondoCustom: '', blur: 22, opacidad: 8, oscurecer: 35, blurFondo: 0, auto: true };

    const ACENTOS = [
        { n: 'Cielo', c: '#38BDF8' }, { n: 'Índigo', c: '#818CF8' }, { n: 'Violeta', c: '#A855F7' },
        { n: 'Rosa', c: '#F472B6' }, { n: 'Rojo', c: '#F87171' }, { n: 'Naranja', c: '#FB923C' },
        { n: 'Ámbar', c: '#FBBF24' }, { n: 'Lima', c: '#A3E635' }, { n: 'Esmeralda', c: '#34D399' },
        { n: 'Turquesa', c: '#2DD4BF' }
    ];

    const FONDOS = [
        { id: 'aurora', nombre: 'Aurora', acento: '#38BDF8',
          css: 'radial-gradient(60% 55% at 12% 8%, rgba(56,189,248,.55), transparent 62%), radial-gradient(55% 50% at 88% 18%, rgba(139,92,246,.45), transparent 62%), radial-gradient(65% 60% at 62% 100%, rgba(16,185,129,.32), transparent 62%), linear-gradient(135deg,#060A14,#0E1627)' },
        { id: 'nebulosa', nombre: 'Nebulosa', acento: '#A78BFA',
          css: 'radial-gradient(55% 50% at 20% 15%, rgba(168,85,247,.55), transparent 62%), radial-gradient(50% 50% at 85% 30%, rgba(236,72,153,.40), transparent 62%), radial-gradient(60% 55% at 50% 100%, rgba(59,130,246,.35), transparent 62%), linear-gradient(135deg,#0B0718,#150B2B)' },
        { id: 'atardecer', nombre: 'Atardecer', acento: '#FB923C',
          css: 'radial-gradient(60% 55% at 15% 90%, rgba(251,146,60,.55), transparent 62%), radial-gradient(55% 50% at 85% 15%, rgba(244,63,94,.45), transparent 62%), radial-gradient(50% 50% at 60% 50%, rgba(168,85,247,.25), transparent 62%), linear-gradient(160deg,#1A0B14,#2A0F18)' },
        { id: 'oceano', nombre: 'Océano', acento: '#22D3EE',
          css: 'radial-gradient(60% 55% at 80% 10%, rgba(34,211,238,.50), transparent 62%), radial-gradient(60% 55% at 10% 80%, rgba(37,99,235,.50), transparent 62%), radial-gradient(40% 40% at 50% 50%, rgba(20,184,166,.25), transparent 62%), linear-gradient(135deg,#041320,#071E33)' },
        { id: 'bosque', nombre: 'Bosque', acento: '#34D399',
          css: 'radial-gradient(60% 55% at 15% 15%, rgba(16,185,129,.50), transparent 62%), radial-gradient(55% 55% at 85% 85%, rgba(132,204,22,.30), transparent 62%), radial-gradient(50% 50% at 70% 20%, rgba(20,184,166,.28), transparent 62%), linear-gradient(135deg,#04120D,#082016)' },
        { id: 'rosa', nombre: 'Rosa Neón', acento: '#F472B6',
          css: 'radial-gradient(55% 50% at 80% 15%, rgba(244,114,182,.55), transparent 62%), radial-gradient(55% 55% at 15% 85%, rgba(217,70,239,.45), transparent 62%), radial-gradient(40% 40% at 50% 50%, rgba(99,102,241,.25), transparent 62%), linear-gradient(135deg,#140614,#220A24)' },
        { id: 'dorado', nombre: 'Dorado', acento: '#FBBF24',
          css: 'radial-gradient(55% 50% at 15% 10%, rgba(251,191,36,.45), transparent 62%), radial-gradient(55% 55% at 90% 90%, rgba(217,119,6,.40), transparent 62%), linear-gradient(135deg,#0D0A05,#1A1409)' },
        { id: 'carbon', nombre: 'Carbón', acento: '#94A3B8',
          css: 'radial-gradient(60% 50% at 50% 0%, rgba(148,163,184,.18), transparent 62%), linear-gradient(135deg,#05070B,#10151D)' }
    ];

    // Conversión de colores
    const hexARgb = (hex) => {
        let h = String(hex || '#38BDF8').replace('#', '');
        if (h.length === 3) h = h.split('').map(x => x + x).join('');
        const n = parseInt(h, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const rgbAHsl = (r, g, b) => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        const l = (max + min) / 2;
        let h = 0, s = 0;
        if (d) {
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
        }
        return [h, s * 100, l * 100];
    };
    const hslARgb = (h, s, l) => {
        s /= 100; l /= 100;
        const k = (n) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
    };
    const rgbAHex = (r, g, b) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    const luminancia = (r, g, b) => {
        const c = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };

    let tema = { ...TEMA_DEFAULT };
    try { tema = { ...TEMA_DEFAULT, ...(JSON.parse(localStorage.getItem(CLAVE_TEMA)) || {}) }; } catch (e) { /* tema por defecto */ }

    const guardarTema = () => {
        try { localStorage.setItem(CLAVE_TEMA, JSON.stringify(tema)); return true; }
        catch (e) { mostrarNotificacion('No se pudo guardar (imagen muy pesada)', 'info'); return false; }
    };

    // A partir de UN color genera toda la paleta
    const aplicarTema = (t) => {
        const root = document.documentElement.style;
        const [r0, g0, b0] = hexARgb(t.acento);
        let [h, s, l] = rgbAHsl(r0, g0, b0);
        const gris = s < 12;
        if (!gris) s = Math.max(s, 55);
        l = Math.min(Math.max(l, 52), 68);

        const [r, g, b] = hslARgb(h, s, l);
        const [r2, g2, b2] = hslARgb((h + 38) % 360, gris ? s : Math.min(s, 90), Math.min(l + 4, 72));
        const sf = gris ? 6 : 38;
        const bg1 = hslARgb(h, sf, 5), bg2 = hslARgb(h, sf, 11), bg3 = hslARgb(h, sf + 4, 8);

        root.setProperty('--accent', rgbAHex(r, g, b));
        root.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
        root.setProperty('--accent-2', rgbAHex(r2, g2, b2));
        root.setProperty('--accent-2-rgb', `${r2}, ${g2, b2}`.replace(',', ',') );
        root.setProperty('--on-accent', luminancia(r, g, b) > 0.38 ? '#071019' : '#FFFFFF');
        root.setProperty('--bg-1', rgbAHex(...bg1));
        root.setProperty('--bg-2', rgbAHex(...bg2));
        root.setProperty('--bg-3', rgbAHex(...bg3));

        root.setProperty('--glass-blur', t.blur + 'px');
        root.setProperty('--card-alpha', (t.opacidad / 100).toFixed(2));
        root.setProperty('--wall-dim', (t.oscurecer / 100).toFixed(2));
        root.setProperty('--wall-blur', t.blurFondo + 'px');

        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', rgbAHex(...bg1));

        const wall = $('wallpaper');
        if (wall) {
            if (t.fondo === 'custom' && t.fondoCustom) {
                wall.style.background = `url("${String(t.fondoCustom).replace(/"/g, '%22')}") center / cover no-repeat`;
            } else {
                const f = FONDOS.find(x => x.id === t.fondo) || FONDOS[0];
                wall.style.background = f.css;
            }
        }
    };

    // Saca el color dominante (vivo) de una imagen
    const extraerColorDominante = (src) => new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const c = document.createElement('canvas');
                c.width = c.height = 40;
                const ctx = c.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, 40, 40);
                const data = ctx.getImageData(0, 0, 40, 40).data;
                const buckets = Array.from({ length: 12 }, () => ({ peso: 0, r: 0, g: 0, b: 0 }));
                for (let i = 0; i < data.length; i += 4) {
                    const [h, s, l] = rgbAHsl(data[i], data[i + 1], data[i + 2]);
                    if (s < 25 || l < 18 || l > 85) continue;
                    const peso = (s / 100) * (1 - Math.abs(l - 55) / 55);
                    const k = Math.floor(h / 30) % 12;
                    buckets[k].peso += peso;
                    buckets[k].r += data[i] * peso;
                    buckets[k].g += data[i + 1] * peso;
                    buckets[k].b += data[i + 2] * peso;
                }
                const mejor = buckets.reduce((a, b) => (b.peso > a.peso ? b : a));
                if (mejor.peso < 0.5) return resolve(null);
                resolve(rgbAHex(Math.round(mejor.r / mejor.peso), Math.round(mejor.g / mejor.peso), Math.round(mejor.b / mejor.peso)));
            } catch (e) { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = src;
    });

    // Comprime la imagen subida para no llenar el almacenamiento
    const procesarImagenSubida = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const max = 1920;
                const esc2 = Math.min(1, max / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = Math.round(img.width * esc2);
                c.height = Math.round(img.height * esc2);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/jpeg', 0.82));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });

    const colorDelFondoActual = async () => {
        if (tema.fondo === 'custom' && tema.fondoCustom) return await extraerColorDominante(tema.fondoCustom);
        const f = FONDOS.find(x => x.id === tema.fondo);
        return f ? f.acento : null;
    };

    // ----- UI de Apariencia -----
    const renderizarSwatches = () => {
        const cont = $('swatches');
        if (!cont) return;
        const actual = String(tema.acento).toLowerCase();
        cont.innerHTML = ACENTOS.map(a =>
            `<button type="button" class="swatch ${a.c.toLowerCase() === actual ? 'active' : ''}" style="--c:${a.c}" data-color="${a.c}" title="${a.n}"></button>`
        ).join('');
        const picker = $('tema-color'); if (picker) picker.value = tema.acento;
        const hex = $('tema-color-hex'); if (hex) hex.textContent = tema.acento;
    };

    const renderizarFondos = () => {
        const cont = $('fondos-grid');
        if (!cont) return;
        let html = FONDOS.map(f =>
            `<div class="fondo-thumb ${tema.fondo === f.id ? 'active' : ''}" data-fondo="${f.id}" style="background:${f.css}"><span>${f.nombre}</span></div>`
        ).join('');
        if (tema.fondoCustom) {
            html += `<div class="fondo-thumb ${tema.fondo === 'custom' ? 'active' : ''}" data-fondo="custom" style="background:url('${String(tema.fondoCustom).replace(/'/g, '%27')}') center/cover"><span>Mi imagen</span></div>`;
        }
        cont.innerHTML = html;
    };

    const sincronizarControlesTema = () => {
        const set = (id, v, sufijo, lbl) => { const el = $(id); if (el) el.value = v; const l = $(lbl); if (l) l.textContent = v + sufijo; };
        set('tema-blur', tema.blur, 'px', 'val-blur');
        set('tema-opacidad', tema.opacidad, '%', 'val-opacidad');
        set('tema-oscurecer', tema.oscurecer, '%', 'val-oscurecer');
        set('tema-blurfondo', tema.blurFondo, 'px', 'val-blurfondo');
        const auto = $('tema-auto'); if (auto) auto.checked = !!tema.auto;
        renderizarSwatches();
        renderizarFondos();
    };

    const refrescarTema = () => { aplicarTema(tema); guardarTema(); };

    const iniciarAjustesApariencia = () => {
        // Colores rápidos
        $('swatches')?.addEventListener('click', (e) => {
            const b = e.target.closest('.swatch'); if (!b) return;
            tema.acento = b.dataset.color; tema.auto = false;
            refrescarTema(); sincronizarControlesTema();
        });
        // Color personalizado
        $('tema-color')?.addEventListener('input', (e) => {
            tema.acento = e.target.value; tema.auto = false;
            aplicarTema(tema);
            const hex = $('tema-color-hex'); if (hex) hex.textContent = tema.acento;
            const auto = $('tema-auto'); if (auto) auto.checked = false;
            document.querySelectorAll('#swatches .swatch').forEach(s => s.classList.toggle('active', s.dataset.color.toLowerCase() === tema.acento.toLowerCase()));
        });
        $('tema-color')?.addEventListener('change', () => guardarTema());

        // Color automático según fondo
        $('tema-auto')?.addEventListener('change', async (e) => {
            tema.auto = e.target.checked;
            if (tema.auto) {
                const c = await colorDelFondoActual();
                if (c) tema.acento = c;
            }
            refrescarTema(); sincronizarControlesTema();
        });

        // Elegir fondo
        $('fondos-grid')?.addEventListener('click', async (e) => {
            const t = e.target.closest('.fondo-thumb'); if (!t) return;
            tema.fondo = t.dataset.fondo;
            if (tema.auto) { const c = await colorDelFondoActual(); if (c) tema.acento = c; }
            refrescarTema(); sincronizarControlesTema();
        });

        // Subir imagen
        $('fondo-archivo')?.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file) return;
            try {
                tema.fondoCustom = await procesarImagenSubida(file);
                tema.fondo = 'custom';
                if (tema.auto) { const c = await extraerColorDominante(tema.fondoCustom); if (c) tema.acento = c; }
                refrescarTema(); sincronizarControlesTema();
                mostrarNotificacion('Fondo aplicado');
            } catch (err) { mostrarNotificacion('No se pudo leer esa imagen', 'info'); }
        });

        // Imagen por URL
        $('btn-fondo-url')?.addEventListener('click', async () => {
            const url = ($('fondo-url').value || '').trim();
            if (!/^https?:\/\//i.test(url)) { mostrarNotificacion('Pega un enlace que empiece con https://', 'info'); return; }
            tema.fondoCustom = url; tema.fondo = 'custom';
            if (tema.auto) { const c = await extraerColorDominante(url); if (c) tema.acento = c; }
            refrescarTema(); sincronizarControlesTema();
            mostrarNotificacion('Fondo aplicado');
        });

        // Sliders de cristal
        [['tema-blur', 'blur', 'px', 'val-blur'], ['tema-opacidad', 'opacidad', '%', 'val-opacidad'],
         ['tema-oscurecer', 'oscurecer', '%', 'val-oscurecer'], ['tema-blurfondo', 'blurFondo', 'px', 'val-blurfondo']]
        .forEach(([id, clave, suf, lbl]) => {
            $(id)?.addEventListener('input', (e) => {
                tema[clave] = parseInt(e.target.value, 10);
                const l = $(lbl); if (l) l.textContent = tema[clave] + suf;
                aplicarTema(tema);
            });
            $(id)?.addEventListener('change', () => guardarTema());
        });

        // Restablecer
        $('btn-reset-tema')?.addEventListener('click', () => {
            tema = { ...TEMA_DEFAULT };
            try { localStorage.removeItem(CLAVE_TEMA); } catch (e) { /* nada */ }
            aplicarTema(tema); sincronizarControlesTema();
            mostrarNotificacion('Apariencia restablecida', 'info');
        });

        // Pestañas de Ajustes
        $('tabs-ajustes')?.addEventListener('click', (e) => {
            const b = e.target.closest('.tab-btn'); if (!b) return;
            irATab(b.dataset.tab);
        });
    };

    const irATab = (tab) => {
        document.querySelectorAll('#tabs-ajustes .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        document.querySelectorAll('#vista-configuracion .tab-panel').forEach(p => p.classList.toggle('vista-oculta', p.id !== `tab-${tab}`));
    };

    aplicarTema(tema);

    // ==========================================
    // 5. NAVEGACIÓN ENTRE VISTAS
    // ==========================================
    const navItems = document.querySelectorAll('.nav-item');
    const vistas = document.querySelectorAll('.vista-seccion');

    const irAVista = (destino) => {
        const vista = $(`vista-${destino}`);
        if (!vista) return;
        navItems.forEach(n => n.classList.toggle('active', n.getAttribute('data-vista') === destino));
        vistas.forEach(v => v.classList.add('vista-oculta'));
        vista.classList.remove('vista-oculta');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        try { localStorage.setItem('sm_vista', destino); } catch (e) { /* nada */ }
    };

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const destino = item.getAttribute('data-vista');
            if (destino) irAVista(destino);
        });
    });

    $('btn-tema-rapido')?.addEventListener('click', () => { irAVista('configuracion'); irATab('apariencia'); });

    // ==========================================
    // 6. SINCRONIZACIÓN (FIREBASE / LOCAL)
    // ==========================================
    const guardarNube = () => {
        if (MODO_PRUEBA) {
            localStorage.setItem('streamingMundialData', JSON.stringify({ cuentas, clientes, historialPagos, costosProveedores }));
            return;
        }
        db.collection('sistema').doc('datosPrincipales').set({ cuentas, clientes, historialPagos, costosProveedores })
            .catch(error => {
                console.error('Error al guardar en Firebase:', error);
                mostrarNotificacion('Error de conexión con la base de datos', 'info');
            });
    };

    const ocultarLoader = () => {
        const l = $('loader');
        if (!l) return;
        l.classList.add('loader--hide');
        setTimeout(() => l.remove(), 600);
    };
    setTimeout(ocultarLoader, 8000);

    const refrescarTodo = () => {
        actualizarDashboard();
        if (!document.activeElement || !document.activeElement.closest('#contenedor-costos')) renderizarVistaCostos();
        renderizarCuentas();
        renderizarClientes();
        const info = $('info-backup-auto');
        if (info) {
            try {
                const b = JSON.parse(localStorage.getItem('sm_backup_auto'));
                info.textContent = b ? `Copia automática en este dispositivo: ${new Date(b.fecha).toLocaleString('es')}` : '';
            } catch (e) { info.textContent = ''; }
        }
    };

    const escucharNubeEnTiempoReal = () => {
        const cargar = (data) => {
            cuentas = data.cuentas || [];
            clientes = data.clientes || [];
            historialPagos = data.historialPagos || [];
            costosProveedores = data.costosProveedores || {};
        };

        if (MODO_PRUEBA) {
            const local = JSON.parse(localStorage.getItem('streamingMundialData'));
            if (local) cargar(local);
            refrescarTodo();
            ocultarLoader();
            return;
        }

        db.collection('sistema').doc('datosPrincipales').onSnapshot((doc) => {
            if (doc.exists) {
                cargar(doc.data());
                // Copia de seguridad automática en este dispositivo
                try { localStorage.setItem('sm_backup_auto', JSON.stringify({ fecha: Date.now(), cuentas, clientes, historialPagos, costosProveedores })); } catch (e) { /* nada */ }
            }
            refrescarTodo();
            ocultarLoader();
        }, (error) => {
            console.error('Error al escuchar Firebase:', error);
            ocultarLoader();
            mostrarNotificacion('No se pudo conectar con la base de datos', 'info');
        });
    };

    // ==========================================
    // 7. HISTORIAL CONTABLE
    // ==========================================
    const registrarTransaccionHistorial = (monto, plataforma, clienteId) => {
        const f = new Date();
        historialPagos.push({
            id: Date.now(),
            clienteId,
            monto: parseFloat(monto) || 0,
            plataforma,
            fecha: f.getTime(),
            mes: `${f.getFullYear()}-${pad(f.getMonth() + 1)}`
        });
    };

    // ==========================================
    // 8. VENCIMIENTOS
    // ==========================================
    const verificarVencimientosClientes = () => {
        const ahora = new Date();
        const inicioHoy = inicioDia(ahora);
        const finManana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 23, 59, 59, 999).getTime();
        let cambio = false;
        clientes.forEach(c => {
            if (!c.fechaVencimiento) return;
            let nuevo = 'aldia';
            if (c.fechaVencimiento < inicioHoy) nuevo = 'moroso';
            else if (c.fechaVencimiento <= finManana) nuevo = 'vence-hoy';
            if (c.estado !== nuevo) { c.estado = nuevo; cambio = true; }
        });
        if (cambio) guardarNube();
    };

    const verificarVencimientosCuentas = () => {
        const hoyInicio = inicioDia(new Date());
        const limiteAviso = hoyInicio + (2 * 24 * 60 * 60 * 1000);
        let cambio = false;
        cuentas.forEach(c => {
            if (!c.fechaVencimiento) return;
            let nuevo = 'aldia';
            if (c.fechaVencimiento < hoyInicio) nuevo = 'vencida';
            else if (c.fechaVencimiento <= limiteAviso) nuevo = 'por-vencer';
            if (c.estado !== nuevo) { c.estado = nuevo; cambio = true; }
        });
        if (cambio) guardarNube();
    };

    // Aviso automático al entrar (clientes que vencen exactamente hoy)
    let alertaInicioMostrada = false;
    const verificarAlertasAlEntrar = () => {
        if (alertaInicioMostrada || !Array.isArray(clientes) || clientes.length === 0) return;
        alertaInicioMostrada = true;
        const hoy = new Date();
        const clientesHoy = clientes.filter(c => {
            if (!c.fechaVencimiento) return false;
            const f = new Date(c.fechaVencimiento);
            return f.getFullYear() === hoy.getFullYear() && f.getMonth() === hoy.getMonth() && f.getDate() === hoy.getDate();
        });
        if (clientesHoy.length === 0) return;
        const nombres = clientesHoy.slice(0, 5).map(c => esc(c.nombre)).join(', ') + (clientesHoy.length > 5 ? '…' : '');
        $('texto-aviso-hoy').innerHTML = `Tienes <strong>${clientesHoy.length}</strong> cliente(s) cuyo servicio vence exactamente el día de hoy.<span class="lista-nombres">${nombres}</span>`;
        setTimeout(() => toggleModal('modal-aviso-vencidos-hoy', true), 900);
    };
    $('btn-cerrar-aviso-hoy')?.addEventListener('click', () => toggleModal('modal-aviso-vencidos-hoy', false));

    // ==========================================
    // 9. MENSAJES DE WHATSAPP
    // ==========================================
    const construirMensajeEntrega = (c) => {
        const fecha = new Date(c.fechaVencimiento).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const clave = c.contrasena ? `\n• *Contraseña/PIN:* ${c.contrasena}` : '';
        const p = c.servicioPlataforma;
        if (p.includes('Spotify')) {
            return `Hola ${c.nombre}!\n\nAquí tienes los detalles de tu cuenta de *${p}*:\n\n• *Tu Correo (Invitación):* ${c.correoPersonal}\n• *Plan:* ${c.servicioDetalle}${clave}\n\n• *Tu cuenta vence el:* ${fecha}\n\n¡Gracias por tu compra!`;
        }
        if (p === 'Canva' || p === 'CapCut' || p === 'Gemini') {
            return `Hola ${c.nombre}!\n\nAquí tienes los detalles de tu acceso a *${p}*:\n\n• *Correo de Invitación:* ${c.servicioCorreo}\n• *Plan/Equipo:* ${c.servicioDetalle}${clave}\n\n• *Tu cuenta vence el:* ${fecha}\n\n¡Gracias por tu compra! Disfruta tu plataforma.`;
        }
        if (p === 'IPTV') {
            return `Nombre: ${c.nombre}\nUsuario: ${c.servicioCorreo}\nContraseña: ${c.contrasena}\nEnlace: ${c.enlaceIptv || 'N/A'}`;
        }
        return `Hola ${c.nombre}!\n\nAquí tienes los datos de acceso de tu cuenta de *${p}*:\n\n• *Correo:* ${c.servicioCorreo}${clave}\n• *Perfil Asignado:* ${c.servicioDetalle}\n\n• *Tu cuenta vence el:* ${fecha}\n\n¡Gracias por tu compra! Disfruta tu contenido.`;
    };

    const urlWhatsApp = (telefono, mensaje) => `https://api.whatsapp.com/send?phone=${telefono}&text=${encodeURIComponent(mensaje)}`;

    // ==========================================
    // 10. TARJETA DE CLIENTE
    // ==========================================
    const generarHTMLTarjetaCliente = (c) => {
        const esMoroso = c.estado === 'moroso';
        const esHoy = c.estado === 'vence-hoy';
        const tint = esMoroso ? 'tint-danger' : esHoy ? 'tint-warning' : 'tint-success';
        const chip = esMoroso ? 'chip--danger' : esHoy ? 'chip--warning' : 'chip--success';

        let badge = 'Al Día';
        if (esMoroso) badge = 'Atrasado';
        else if (esHoy) badge = diasHasta(c.fechaVencimiento) <= 0 ? 'Vence hoy' : 'Vence mañana';

        const iniciales = (c.nombre || 'CL').split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'CL';
        const d = platDef(c.servicioPlataforma);
        const correo = (c.servicioPlataforma.includes('Spotify') && c.correoPersonal) ? c.correoPersonal : c.servicioCorreo;
        const cobrar = esMoroso || esHoy;

        return `
        <article class="cliente-card ${tint}">
            <div class="card-head">
                <div class="card-id">
                    <div class="avatar">${esc(iniciales)}</div>
                    <div style="min-width:0">
                        <h3 class="card-name">${esc(c.nombre)}</h3>
                        <span class="chip ${chip}"><i class="dot"></i>${badge}</span>
                    </div>
                </div>
                <button class="icon-btn icon-btn--danger" type="button" data-accion="eliminar-cliente" data-id="${c.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </div>

            <div class="card-body">
                <div class="svc-icon" style="--c:${d.color}"><i class="${d.icono}"></i></div>
                <div class="svc-info">
                    <div class="svc-line">
                        <strong>${esc(c.servicioPlataforma)}</strong>
                        <span class="svc-detalle">(${esc(c.servicioDetalle)})</span>
                        <span class="price">${dinero(c.montoPago)}</span>
                    </div>
                    <p class="svc-mail">${esc(correo)}</p>
                    <p class="svc-date"><i class="fa-regular fa-calendar"></i> Vence: ${fechaCorta(c.fechaVencimiento)} <span class="rel">· ${textoDias(c.fechaVencimiento)}</span></p>
                </div>
            </div>

            <div class="card-actions">
                <button class="glass-btn" type="button" data-accion="editar-cliente" data-id="${c.id}"><i class="fa-solid fa-pen-to-square"></i> Editar</button>
                <button class="glass-btn ${cobrar ? 'danger' : 'success'}" type="button" data-accion="pago" data-id="${c.id}"><i class="${cobrar ? 'fa-solid fa-bell' : 'fa-solid fa-receipt'}"></i> ${cobrar ? 'Cobrar' : 'Renovar'}</button>
                ${cobrar ? `<button class="glass-btn wa" type="button" data-accion="recordar" data-id="${c.id}"><i class="fa-brands fa-whatsapp"></i> ${c.estadoAviso === 'avisado' ? 'Reenviar' : 'Avisar'}</button>` : ''}
                <button class="icon-btn icon-btn--sm push" type="button" data-accion="copiar-datos" data-id="${c.id}" title="Copiar datos de acceso"><i class="fa-regular fa-copy"></i></button>
            </div>
        </article>`;
    };

    // ==========================================
    // 11. DASHBOARD
    // ==========================================
    const actualizarDashboard = () => {
        verificarVencimientosClientes();
        verificarVencimientosCuentas();

        const totalAldia = clientes.filter(c => c.estado === 'aldia').length;
        const totalMorosos = clientes.filter(c => c.estado === 'moroso' || c.estado === 'vence-hoy').length;
        const totalEsperado = clientes.reduce((acc, c) => acc + (parseFloat(c.montoPago) || 0), 0);

        animarNumero($('kpi-madres'), cuentas.length, fmtEntero);
        animarNumero($('kpi-aldia'), totalAldia, fmtEntero);
        animarNumero($('kpi-mora'), totalMorosos, fmtEntero);
        animarNumero($('kpi-ingresos'), totalEsperado, dinero);

        renderizarDashboardServicios();
        renderizarReportesFinancieros(totalEsperado);

        const contHoy = $('contenedor-vence-hoy'), secHoy = $('section-vence-hoy');
        if (contHoy && secHoy) {
            const lista = clientes.filter(c => c.estado === 'vence-hoy');
            secHoy.classList.toggle('vista-oculta', lista.length === 0);
            contHoy.innerHTML = lista.map(generarHTMLTarjetaCliente).join('');
        }

        const contVen = $('contenedor-cuentas-vencen'), secVen = $('section-cuentas-vencen');
        if (contVen && secVen) {
            const lista = cuentas.filter(c => c.estado === 'por-vencer' || c.estado === 'vencida');
            secVen.classList.toggle('vista-oculta', lista.length === 0);
            contVen.innerHTML = lista.map(c => {
                const d = platDef(c.plataforma);
                const vencida = c.estado === 'vencida';
                return `
                <article class="cuenta-card compact ${vencida ? 'tint-danger' : 'tint-warning'}">
                    <div class="card-head">
                        <div class="card-id">
                            <div class="svc-icon" style="--c:${d.color}"><i class="${d.icono}"></i></div>
                            <div style="min-width:0">
                                <h3 class="card-name">${esc(c.plataforma)}</h3>
                                <p class="svc-mail">${esc(c.correo)}</p>
                            </div>
                        </div>
                        <span class="chip ${vencida ? 'chip--danger' : 'chip--warning'}"><i class="dot"></i>${vencida ? 'Vencida' : 'Vence pronto'}</span>
                    </div>
                    <p class="svc-date"><i class="fa-regular fa-calendar"></i> ${fechaCorta(c.fechaVencimiento)} <span class="rel">· ${textoDias(c.fechaVencimiento)}</span></p>
                </article>`;
            }).join('');
        }

        verificarAlertasAlEntrar();
    };

    const renderizarDashboardServicios = () => {
        const cont = $('contenedor-plataformas');
        if (!cont) return;
        cont.innerHTML = PLATAFORMAS.map(p => {
            const madres = cuentas.filter(c => c.plataforma === p.nombre).length;
            const perfiles = clientes.filter(c => c.servicioPlataforma === p.nombre).length;
            const activo = madres > 0 || perfiles > 0;
            return `
            <div class="plat-card ${activo ? '' : 'plat-card--off'}">
                <div class="plat-card__header">
                    <div class="plat-ident">
                        <div class="svc-icon" style="--c:${p.color}"><i class="${p.icono}"></i></div>
                        <h3 class="plat-name">${esc(p.nombre)}</h3>
                    </div>
                    <span class="tag ${activo ? '' : 'tag--off'}">${activo ? 'Activo' : 'Sin stock'}</span>
                </div>
                <div class="plat-stats">
                    <div><strong>${madres}</strong>Cuentas Madre</div>
                    <div><strong>${perfiles}</strong>Perfiles vendidos</div>
                </div>
            </div>`;
        }).join('');
    };

    // ==========================================
    // 12. REPORTES FINANCIEROS
    // ==========================================
    const calcularIngresoDiario = () => {
        const input = $('filtro-fecha-diario'), out = $('total-diario');
        if (!input || !out) return;
        if (!input.value) input.value = aInputFecha(Date.now());
        const [y, m, d] = input.value.split('-').map(Number);
        const ini = new Date(y, m - 1, d, 0, 0, 0).getTime();
        const fin = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
        const total = historialPagos.filter(p => p.fecha >= ini && p.fecha <= fin).reduce((acc, p) => acc + p.monto, 0);
        animarNumero(out, total, dinero);
    };
    $('filtro-fecha-diario')?.addEventListener('change', calcularIngresoDiario);

    const renderizarReportesFinancieros = (totalEsperado) => {
        const totalCobrado = clientes.filter(c => c.estado === 'aldia').reduce((acc, c) => acc + (parseFloat(c.montoPago) || 0), 0);
        const totalPendiente = totalEsperado - totalCobrado;
        const totalProv = cuentas.reduce((acc, c) => acc + (parseFloat(costosProveedores[c.plataforma]) || 0), 0);
        const ganancia = totalCobrado - totalProv;

        animarNumero($('rep-esperado'), totalEsperado, dinero);
        animarNumero($('rep-cobrado'), totalCobrado, dinero);
        animarNumero($('rep-pendiente'), totalPendiente, dinero);
        animarNumero($('rep-proveedores'), totalProv, dinero);
        animarNumero($('rep-proveedores-2'), totalProv, dinero);
        animarNumero($('rep-ganancia'), ganancia, dinero);
        animarNumero($('rep-ganancia-2'), ganancia, dinero);

        // Agrupado por mes
        const agrupado = historialPagos.reduce((acc, p) => { acc[p.mes] = (acc[p.mes] || 0) + p.monto; return acc; }, {});

        // Gráfico últimos 6 meses
        const graf = $('grafico-meses');
        if (graf) {
            const ahora = new Date();
            const ult = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
                ult.push({ lbl: MESES_CORTOS[d.getMonth()], total: agrupado[`${d.getFullYear()}-${pad(d.getMonth() + 1)}`] || 0 });
            }
            const max = Math.max(...ult.map(m => m.total), 1);
            graf.innerHTML = ult.map(m => `
                <div class="bar-col">
                    <span class="bar-val">${m.total ? dinero(m.total) : ''}</span>
                    <div class="bar-track"><div class="bar" style="height:${(m.total / max) * 100}%"></div></div>
                    <span class="bar-lbl">${m.lbl}</span>
                </div>`).join('');
        }

        // Historial mensual
        const contHist = $('contenedor-historial-meses');
        if (contHist) {
            const meses = Object.keys(agrupado).sort((a, b) => b.localeCompare(a));
            contHist.innerHTML = meses.length ? meses.map(mes => {
                const [y, m] = mes.split('-');
                return `
                <div class="plat-card hist-card">
                    <div class="hist-card__left">
                        <div class="hist-icon"><i class="fa-solid fa-calendar-check"></i></div>
                        <div>
                            <h3 class="plat-name">${MESES[parseInt(m, 10) - 1]} ${y}</h3>
                            <p class="muted-sm">Monto recaudado este mes</p>
                        </div>
                    </div>
                    <span class="hist-amount">${dinero(agrupado[mes])}</span>
                </div>`;
            }).join('') : `<p class="empty"><i class="fa-regular fa-calendar"></i>No hay ingresos registrados en el historial mensual aún.</p>`;
        }

        // Desglose por plataforma
        const contPlat = $('contenedor-reporte-plataformas');
        if (contPlat) {
            let html = '';
            PLATAFORMAS.forEach(p => {
                const cp = clientes.filter(c => c.servicioPlataforma === p.nombre);
                if (cp.length === 0) return;
                const esperado = cp.reduce((acc, c) => acc + (parseFloat(c.montoPago) || 0), 0);
                const cobrado = cp.filter(c => c.estado === 'aldia').reduce((acc, c) => acc + (parseFloat(c.montoPago) || 0), 0);
                const costo = cuentas.filter(c => c.plataforma === p.nombre).length * (parseFloat(costosProveedores[p.nombre]) || 0);
                const pct = esperado === 0 ? 0 : Math.round((cobrado / esperado) * 100);
                html += `
                <div class="plat-card">
                    <div class="plat-ident">
                        <div class="svc-icon" style="--c:${p.color}"><i class="${p.icono}"></i></div>
                        <h3 class="plat-name">${esc(p.nombre)}</h3>
                    </div>
                    <div class="rep-line">
                        <span>Cobrado: <strong style="color:#34D399">${dinero(cobrado)}</strong></span>
                        <span>Total: <strong>${dinero(esperado)}</strong></span>
                        <span>Ganancia: <strong>${dinero(cobrado - costo)}</strong></span>
                    </div>
                    <div class="progress-bg"><div class="progress-bar" style="width:${pct}%;background:${p.color}"></div></div>
                    <span class="prog-text">${pct}% Recaudado</span>
                </div>`;
            });
            contPlat.innerHTML = html || `<p class="empty"><i class="fa-solid fa-chart-pie"></i>No hay ingresos activos registrados.</p>`;
        }

        calcularIngresoDiario();
    };

    // ==========================================
    // 13. CUENTAS MADRE
    // ==========================================
    const guardarYRenderizarCuentas = () => {
        guardarNube();
        renderizarCuentas();
        actualizarDashboard();
    };

    const clientesVinculados = (cuenta) => clientes.filter(cl =>
        cl.servicioPlataforma === cuenta.plataforma &&
        String(cl.servicioCorreo || '').toLowerCase() === String(cuenta.correo || '').toLowerCase());

    const renderizarCuentas = () => {
        const grid = document.querySelector('#vista-cuentas .grid-cuentas');
        if (!grid) return;

        const texto = ($('buscador-cuentas')?.value || '').trim().toLowerCase();
        const activo = document.querySelector('#filtros-cuentas .btn-filtro.active');
        const filtro = activo ? activo.dataset.filtro : 'Todas';

        const lista = cuentas.filter(c => {
            if (texto) return String(c.correo || '').toLowerCase().includes(texto) || c.plataforma.toLowerCase().includes(texto);
            return filtro === 'Todas' || c.plataforma === filtro;
        }).sort((a, b) => (a.fechaVencimiento || Infinity) - (b.fechaVencimiento || Infinity));

        const resumen = $('resumen-cuentas');
        if (resumen) {
            const alertas = cuentas.filter(c => c.estado === 'por-vencer' || c.estado === 'vencida').length;
            resumen.textContent = `${cuentas.length} cuenta(s) madre${alertas ? ` · ${alertas} por atender` : ''}`;
        }

        if (lista.length === 0) {
            grid.innerHTML = `<p class="empty"><i class="fa-solid fa-box-open"></i>No hay cuentas con este filtro.</p>`;
            return;
        }

        grid.innerHTML = lista.map(c => {
            const d = platDef(c.plataforma);
            const tint = c.estado === 'vencida' ? 'tint-danger' : c.estado === 'por-vencer' ? 'tint-warning' : 'tint-success';
            const chip = c.estado === 'vencida' ? 'chip--danger' : c.estado === 'por-vencer' ? 'chip--warning' : 'chip--success';
            const badge = c.estado === 'vencida' ? 'Vencida' : c.estado === 'por-vencer' ? 'Por vencer' : 'Al día';
            const max = c.perfilesMax || 1;
            const ocupados = Math.min(max, Math.max(c.perfilesOcupados || 0, clientesVinculados(c).length));
            const pct = Math.round((ocupados / max) * 100);
            const clave = c.contrasena || '';

            return `
            <article class="cuenta-card ${tint}">
                <div class="card-head">
                    <div class="card-id">
                        <div class="svc-icon" style="--c:${d.color}"><i class="${d.icono}"></i></div>
                        <h3 class="card-name">${esc(c.plataforma)}</h3>
                    </div>
                    <span class="chip ${chip}" style="margin-top:0"><i class="dot"></i>${badge}</span>
                </div>

                <div class="fields">
                    <div class="field">
                        <span class="field-label">Correo</span>
                        <div class="field-row">
                            <strong class="field-value">${esc(c.correo)}</strong>
                            <div class="field-btns">
                                <button class="icon-btn icon-btn--sm" type="button" data-accion="copiar" data-valor="${esc(c.correo)}" title="Copiar correo"><i class="fa-regular fa-copy"></i></button>
                            </div>
                        </div>
                    </div>
                    <div class="field">
                        <span class="field-label">Contraseña</span>
                        <div class="field-row">
                            ${clave
                                ? `<strong class="field-value pass-value" data-pass="${esc(clave)}">••••••••</strong>
                                   <div class="field-btns">
                                       <button class="icon-btn icon-btn--sm" type="button" data-accion="ver-pass" title="Mostrar / ocultar"><i class="fa-solid fa-eye"></i></button>
                                       <button class="icon-btn icon-btn--sm" type="button" data-accion="copiar" data-valor="${esc(clave)}" title="Copiar contraseña"><i class="fa-regular fa-copy"></i></button>
                                   </div>`
                                : `<strong class="field-value muted">Sin contraseña guardada</strong>
                                   <div class="field-btns"><button class="icon-btn icon-btn--sm" type="button" data-accion="editar-cuenta" data-id="${c.id}" title="Agregar contraseña"><i class="fa-solid fa-plus"></i></button></div>`}
                        </div>
                    </div>
                </div>

                <div class="meta-row">
                    <div>Vencimiento<b>${fechaCorta(c.fechaVencimiento)}</b><span class="rel">${textoDias(c.fechaVencimiento)}</span></div>
                    <div>Ocupados<b>${ocupados} / ${max}</b></div>
                </div>
                <div class="occ-bar"><div class="occ-bar__fill" style="width:${pct}%"></div></div>

                <div class="card-actions">
                    <button class="glass-btn" type="button" data-accion="subcuentas" data-id="${c.id}"><i class="fa-solid fa-users"></i> Gestionar</button>
                    <div class="push">
                        <button class="icon-btn" type="button" data-accion="editar-cuenta" data-id="${c.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                        <button class="icon-btn icon-btn--danger" type="button" data-accion="eliminar-cuenta" data-id="${c.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </article>`;
        }).join('');
    };

    // Filtros de cuentas (se generan desde PLATAFORMAS)
    const filtrosCuentas = $('filtros-cuentas');
    if (filtrosCuentas) {
        filtrosCuentas.innerHTML = `<button class="btn-filtro active" data-filtro="Todas" type="button">Todas</button>` +
            PLATAFORMAS.map(p => `<button class="btn-filtro" data-filtro="${esc(p.nombre)}" type="button"><i class="${p.icono}" style="color:${p.color}"></i> ${esc(p.nombre)}</button>`).join('');
        filtrosCuentas.addEventListener('click', (e) => {
            const b = e.target.closest('.btn-filtro'); if (!b) return;
            filtrosCuentas.querySelectorAll('.btn-filtro').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            const buscador = $('buscador-cuentas'); if (buscador) buscador.value = '';
            renderizarCuentas();
        });
    }
    $('buscador-cuentas')?.addEventListener('input', (e) => {
        const todas = filtrosCuentas?.querySelector('[data-filtro="Todas"]');
        filtrosCuentas?.querySelectorAll('.btn-filtro').forEach(x => x.classList.remove('active'));
        if (!e.target.value.trim() && todas) todas.classList.add('active');
        renderizarCuentas();
    });

    // Selects de plataforma (se generan desde PLATAFORMAS)
    const opcionesPlat = PLATAFORMAS.map(p => `<option value="${esc(p.nombre)}">${esc(p.nombre)}</option>`).join('');
    if ($('nuevo-plataforma')) $('nuevo-plataforma').innerHTML = opcionesPlat;
    if ($('cliente-plataforma')) $('cliente-plataforma').innerHTML = opcionesPlat;

    // ----- Duración -> fecha (cliente y cuenta) -----
    const enlazarDuracion = (idSelect, idFecha) => {
        const sel = $(idSelect), fecha = $(idFecha);
        if (!sel || !fecha) return;
        sel.addEventListener('change', () => {
            if (sel.value === 'custom') return;
            fecha.value = aInputFecha(sumarDuracion(new Date(), sel.value));
        });
        fecha.addEventListener('input', () => { sel.value = 'custom'; });
    };
    enlazarDuracion('cliente-duracion', 'cliente-fecha-vencimiento');
    enlazarDuracion('nuevo-duracion-cuenta', 'nuevo-vencimiento-cuenta');

    // ----- Ojito para ver contraseñas en formularios -----
    document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-toggle-pass]');
        if (!b) return;
        const input = b.parentElement.querySelector('input');
        if (!input) return;
        const mostrar = input.type === 'password';
        input.type = mostrar ? 'text' : 'password';
        b.innerHTML = `<i class="fa-solid ${mostrar ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
    });

    // ----- Agregar cuenta madre -----
    const formAgregarCuenta = $('form-agregar-cuenta');
    $('btn-agregar-cuenta')?.addEventListener('click', () => {
        formAgregarCuenta.reset();
        const sel = $('nuevo-duracion-cuenta');
        sel.value = '1m';
        sel.dispatchEvent(new Event('change'));
        $('nuevo-perfiles').removeAttribute('readonly');
        const pass = $('nuevo-contrasena');
        pass.type = 'password';
        pass.parentElement.querySelector('[data-toggle-pass]').innerHTML = '<i class="fa-solid fa-eye"></i>';
        toggleModal('modal-agregar-cuenta', true);
    });
    $('cerrar-modal-agregar')?.addEventListener('click', () => toggleModal('modal-agregar-cuenta', false));

    $('nuevo-plataforma')?.addEventListener('change', (e) => {
        const inp = $('nuevo-perfiles');
        if (e.target.value === 'Spotify Personal') { inp.value = 1; inp.setAttribute('readonly', 'true'); }
        else inp.removeAttribute('readonly');
    });

    formAgregarCuenta?.addEventListener('submit', (e) => {
        e.preventDefault();
        const plataforma = $('nuevo-plataforma').value;
        const d = platDef(plataforma);
        let perfilesMax = parseInt($('nuevo-perfiles').value, 10) || 5;
        if (plataforma === 'Spotify Personal') perfilesMax = 1;

        const subcuentas = [];
        for (let i = 0; i < perfilesMax; i++) subcuentas.push({ nombre: '', correoPerfil: '' });

        cuentas.push({
            id: Date.now(),
            plataforma,
            icono: d.icono,
            color: d.color,
            correo: $('nuevo-correo').value.trim(),
            contrasena: $('nuevo-contrasena').value,
            perfilesMax,
            perfilesOcupados: 0,
            estado: 'aldia',
            fechaVencimiento: desdeInputFecha($('nuevo-vencimiento-cuenta').value),
            subcuentas
        });

        guardarYRenderizarCuentas();
        toggleModal('modal-agregar-cuenta', false);
        mostrarNotificacion('¡Cuenta Madre guardada con éxito!');
    });

    // ----- Eliminar cuenta -----
    let cuentaAEliminar = null;
    $('btn-cancelar-eliminar')?.addEventListener('click', () => { toggleModal('modal-eliminar', false); cuentaAEliminar = null; });
    $('btn-confirmar-eliminar')?.addEventListener('click', () => {
        if (cuentaAEliminar === null) return;
        cuentas = cuentas.filter(c => c.id !== cuentaAEliminar);
        cuentaAEliminar = null;
        guardarYRenderizarCuentas();
        toggleModal('modal-eliminar', false);
        mostrarNotificacion('Cuenta eliminada', 'info');
    });

    // ----- Subcuentas -----
    let cuentaEnEdicionId = null;
    $('cerrar-modal-sub')?.addEventListener('click', () => toggleModal('modal-subcuentas', false));

    const abrirModalSubcuentas = (idCuenta) => {
        const cuenta = cuentas.find(c => c.id === idCuenta);
        if (!cuenta) return;
        cuentaEnEdicionId = cuenta.id;
        $('modal-correo-ref').textContent = `${cuenta.plataforma} — ${cuenta.correo}`;

        // Conserva lo ya escrito: solo completa o recorta
        const prev = Array.isArray(cuenta.subcuentas) ? cuenta.subcuentas : [];
        cuenta.subcuentas = [];
        for (let i = 0; i < cuenta.perfilesMax; i++) cuenta.subcuentas.push(prev[i] || { nombre: '', correoPerfil: '' });

        $('contenedor-lista-perfiles').innerHTML = cuenta.subcuentas.map((sub, i) => `
            <div class="perfil-item">
                <div class="perfil-item__head"><span>Perfil ${i + 1}</span><span>Slot ${i + 1} de ${cuenta.perfilesMax}</span></div>
                <div class="perfil-item__inputs">
                    <input type="text" class="input-nombre-perfil" placeholder="Nombre del cliente" value="${esc(sub.nombre)}">
                    <input type="text" class="input-correo-perfil" placeholder="Correo o PIN" value="${esc(sub.correoPerfil)}">
                </div>
            </div>`).join('');
        toggleModal('modal-subcuentas', true);
    };

    $('btn-guardar-cambios-subcuentas')?.addEventListener('click', () => {
        const cuenta = cuentas.find(c => c.id === cuentaEnEdicionId);
        if (!cuenta) return;
        let ocupados = 0;
        cuenta.subcuentas = [];
        document.querySelectorAll('#contenedor-lista-perfiles .perfil-item').forEach(item => {
            const nombre = item.querySelector('.input-nombre-perfil').value.trim();
            const correoPerfil = item.querySelector('.input-correo-perfil').value.trim();
            cuenta.subcuentas.push({ nombre, correoPerfil });
            if (nombre !== '') ocupados++;
        });
        cuenta.perfilesOcupados = ocupados;
        guardarYRenderizarCuentas();
        toggleModal('modal-subcuentas', false);
        mostrarNotificacion('Perfiles actualizados');
    });

    // ----- Editar cuenta madre (correo + contraseña + fecha) -----
    const formEditarCuenta = $('form-editar-cuenta');
    $('cerrar-modal-editar-cuenta')?.addEventListener('click', () => toggleModal('modal-editar-cuenta', false));

    const abrirModalEditarCuenta = (id) => {
        const cuenta = cuentas.find(c => c.id === id);
        if (!cuenta) return;
        $('edit-cuenta-id').value = cuenta.id;
        $('edit-cuenta-ref').textContent = `${cuenta.plataforma} — ${cuenta.correo}`;
        $('edit-cuenta-correo').value = cuenta.correo || '';
        const pass = $('edit-cuenta-contrasena');
        pass.value = cuenta.contrasena || '';
        pass.type = 'password';
        pass.parentElement.querySelector('[data-toggle-pass]').innerHTML = '<i class="fa-solid fa-eye"></i>';
        $('edit-cuenta-vencimiento').value = cuenta.fechaVencimiento ? aInputFecha(cuenta.fechaVencimiento) : '';
        $('edit-cuenta-propagar').checked = false;
        $('edit-cuenta-notificar').checked = false;
        // Las plataformas por invitación no usan contraseña con el cliente
        $('grupo-propagar').style.display = platDef(cuenta.plataforma).sinClave ? 'none' : 'flex';
        toggleModal('modal-editar-cuenta', true);
    };

    const abrirModalNotificacionMasiva = (afectados, plataforma, cambioCorreo, cambioClave) => {
        const cont = $('lista-clientes-notificar');
        if (!cont) return;
        const partes = [];
        if (cambioCorreo) partes.push('el correo');
        if (cambioClave) partes.push('la contraseña');
        
        let textoNotif = 'Toca "Notificar" para enviar los datos de acceso a cada cliente vinculado.';
        if (partes.length > 0) {
            textoNotif = `Se actualizó ${partes.join(' y ')}. ` + textoNotif;
        }
        $('texto-notificacion-masiva').textContent = textoNotif;

        cont.innerHTML = afectados.map(c => {
            const lineas = [
                `• *Correo:* ${c.servicioCorreo}`,
                `• *Contraseña/PIN:* ${c.contrasena || 'La misma que ya tenías'}`,
                `• *Perfil:* ${c.servicioDetalle}`
            ].join('\n');
            
            const intro = partes.length > 0 
                ? `Te informamos que por motivos de mantenimiento hemos actualizado los datos de acceso de tu cuenta de *${plataforma}*:`
                : `Te compartimos los datos de acceso actualizados de tu cuenta de *${plataforma}*:`;

            const mensaje = `Hola ${c.nombre}!\n\n${intro}\n\n${lineas}\n\nPor favor, utiliza estos datos para iniciar sesión a partir de ahora. ¡Gracias por tu comprensión!`;
            
            return `
            <div class="notify-item">
                <div><strong>${esc(c.nombre)}</strong><span>Perfil: ${esc(c.servicioDetalle)}</span></div>
                <a class="btn-wa-mini" href="${urlWhatsApp(c.telefono, mensaje)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Notificar</a>
            </div>`;
        }).join('');
        toggleModal('modal-notificacion-masiva', true);
    };
    $('cerrar-modal-notificacion')?.addEventListener('click', () => toggleModal('modal-notificacion-masiva', false));
    $('lista-clientes-notificar')?.addEventListener('click', (e) => {
        const a = e.target.closest('.btn-wa-mini'); if (!a) return;
        a.classList.add('done');
        a.innerHTML = '<i class="fa-solid fa-check"></i> Listo';
    });

    formEditarCuenta?.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = parseInt($('edit-cuenta-id').value, 10);
        const cuenta = cuentas.find(c => c.id === id);
        if (!cuenta) return;

        const nuevoCorreo = $('edit-cuenta-correo').value.trim();
        const nuevaClave = $('edit-cuenta-contrasena').value;
        const fechaInput = $('edit-cuenta-vencimiento').value;
        const propagar = $('edit-cuenta-propagar').checked && !platDef(cuenta.plataforma).sinClave;
        const forzarNotificacion = $('edit-cuenta-notificar').checked;

        const correoViejo = cuenta.correo || '';
        const claveVieja = cuenta.contrasena || '';
        const cambioCorreo = nuevoCorreo.toLowerCase() !== correoViejo.toLowerCase();
        const cambioClave = nuevaClave !== claveVieja;

        // Clientes vinculados (se buscan con el correo VIEJO)
        const afectados = clientes.filter(c =>
            String(c.servicioCorreo || '').toLowerCase() === correoViejo.toLowerCase() && c.servicioPlataforma === cuenta.plataforma);

        cuenta.correo = nuevoCorreo;
        cuenta.contrasena = nuevaClave;
        if (fechaInput) cuenta.fechaVencimiento = desdeInputFecha(fechaInput);

        const propagarClave = propagar && cambioClave;
        if (cambioCorreo) afectados.forEach(c => { c.servicioCorreo = nuevoCorreo; });
        if (propagarClave) afectados.forEach(c => { c.contrasena = nuevaClave; });

        guardarYRenderizarCuentas();
        if (afectados.length) guardarYRenderizarClientes();
        toggleModal('modal-editar-cuenta', false);

        if (afectados.length && (cambioCorreo || propagarClave || forzarNotificacion)) {
            abrirModalNotificacionMasiva(afectados, cuenta.plataforma, cambioCorreo, propagarClave);
        } else {
            mostrarNotificacion(afectados.length ? 'Cuenta actualizada' : 'Cuenta actualizada. No hay clientes vinculados a este correo.');
        }
    });

    // ==========================================
    // 14. CLIENTES
    // ==========================================
    const guardarYRenderizarClientes = () => {
        guardarNube();
        renderizarClientes();
        actualizarDashboard();
    };

    const ORDEN_ESTADO = { 'moroso': 0, 'vence-hoy': 1, 'aldia': 2 };

    const renderizarClientes = () => {
        verificarVencimientosClientes();
        const grid = document.querySelector('#vista-clientes .grid-clientes');
        if (!grid) return;

        const texto = ($('buscador-clientes')?.value || '').toLowerCase();
        const activo = document.querySelector('#filtros-clientes .btn-filtro.active');
        const filtroEstado = activo ? activo.dataset.filtro : 'todos';

        const lista = clientes.filter(c => {
            const busca = !texto || [c.nombre, c.servicioCorreo, c.correoPersonal, c.servicioPlataforma, c.servicioDetalle, c.telefono]
                .some(v => String(v || '').toLowerCase().includes(texto));
            const estado = filtroEstado === 'todos' ||
                (filtroEstado === 'aldia' && c.estado === 'aldia') ||
                (filtroEstado === 'vencidos' && (c.estado === 'moroso' || c.estado === 'vence-hoy'));
            return busca && estado;
        }).sort((a, b) => {
            const o = (ORDEN_ESTADO[a.estado] ?? 3) - (ORDEN_ESTADO[b.estado] ?? 3);
            return o !== 0 ? o : (a.fechaVencimiento || 0) - (b.fechaVencimiento || 0);
        });

        const resumen = $('resumen-clientes');
        if (resumen) {
            const porCobrar = clientes.filter(c => c.estado === 'moroso' || c.estado === 'vence-hoy').length;
            resumen.textContent = `${clientes.length} cliente(s)${porCobrar ? ` · ${porCobrar} por cobrar` : ''}`;
        }

        grid.innerHTML = lista.length
            ? lista.map(generarHTMLTarjetaCliente).join('')
            : `<p class="empty"><i class="fa-regular fa-user"></i>No se encontraron clientes registrados.</p>`;
    };

    $('buscador-clientes')?.addEventListener('input', renderizarClientes);
    $('filtros-clientes')?.addEventListener('click', (e) => {
        const b = e.target.closest('.btn-filtro'); if (!b) return;
        document.querySelectorAll('#filtros-clientes .btn-filtro').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const buscador = $('buscador-clientes'); if (buscador) buscador.value = '';
        renderizarClientes();
    });

    // ----- Formulario adaptable según plataforma -----
    const selectPlataforma = $('cliente-plataforma');
    const inputContrasena = $('cliente-contrasena');
    const inputCorreoBase = $('cliente-correo');

    const adaptarFormularioSegunPlataforma = (plat) => {
        if (!inputContrasena || !inputCorreoBase) return;
        $('grupo-correo-personal').style.display = 'none';
        $('grupo-enlace-iptv').style.display = 'none';
        inputCorreoBase.type = 'email';

        if (plat.includes('Spotify')) {
            $('grupo-correo-personal').style.display = 'flex';
            inputContrasena.required = false;
            inputContrasena.placeholder = 'No requiere contraseña (Invitación)';
            inputCorreoBase.placeholder = 'Correo Admin / Cuenta Madre';
        } else if (plat === 'Canva' || plat === 'CapCut' || plat === 'Gemini') {
            inputContrasena.required = false;
            inputContrasena.placeholder = 'No requiere contraseña (Invitación por correo)';
            inputCorreoBase.placeholder = 'Correo personal o vinculado del cliente';
        } else if (plat === 'IPTV') {
            $('grupo-enlace-iptv').style.display = 'flex';
            inputContrasena.required = true;
            inputContrasena.placeholder = 'Contraseña del IPTV';
            inputCorreoBase.type = 'text';
            inputCorreoBase.placeholder = 'Usuario del IPTV';
        } else {
            inputContrasena.required = true;
            inputContrasena.placeholder = 'Contraseña o PIN del perfil';
            inputCorreoBase.placeholder = 'correo.vinculado@gmail.com';
        }
    };

    // Sugerencias de correo y contraseña tomadas de las cuentas madre
    const actualizarSugerenciasCorreo = () => {
        const dl = $('lista-correos-madre');
        if (!dl || !selectPlataforma) return;
        const correos = [...new Set(cuentas.filter(c => c.plataforma === selectPlataforma.value).map(c => c.correo))];
        dl.innerHTML = correos.map(c => `<option value="${esc(c)}"></option>`).join('');
    };

    const autocompletarClaveDesdeMadre = () => {
        const hint = $('hint-clave-madre');
        if (hint) hint.style.display = 'none';
        if (!selectPlataforma || !inputContrasena || inputContrasena.value.trim() !== '') return;
        if (platDef(selectPlataforma.value).sinClave) return;
        const correo = inputCorreoBase.value.trim().toLowerCase();
        if (!correo) return;
        const madre = cuentas.find(c => c.plataforma === selectPlataforma.value && String(c.correo || '').toLowerCase() === correo && c.contrasena);
        if (madre) {
            inputContrasena.value = madre.contrasena;
            if (hint) hint.style.display = 'block';
        }
    };

    selectPlataforma?.addEventListener('change', (e) => {
        adaptarFormularioSegunPlataforma(e.target.value);
        actualizarSugerenciasCorreo();
        autocompletarClaveDesdeMadre();
    });
    inputCorreoBase?.addEventListener('input', autocompletarClaveDesdeMadre);
    inputCorreoBase?.addEventListener('change', autocompletarClaveDesdeMadre);

    const formCliente = $('form-cliente');

    $('btn-agregar-cliente')?.addEventListener('click', () => {
        formCliente.reset();
        $('cliente-id').value = '';
        $('titulo-modal-cliente').textContent = 'Agregar Cliente';
        const sel = $('cliente-duracion');
        sel.value = '1m';
        sel.dispatchEvent(new Event('change'));
        adaptarFormularioSegunPlataforma(selectPlataforma.value);
        actualizarSugerenciasCorreo();
        $('hint-clave-madre').style.display = 'none';
        toggleModal('modal-cliente', true);
    });
    $('cerrar-modal-cliente')?.addEventListener('click', () => toggleModal('modal-cliente', false));

    const abrirModalCliente = (id) => {
        const c = clientes.find(x => x.id === id);
        if (!c) return;
        $('cliente-id').value = c.id;
        $('cliente-nombre').value = c.nombre;
        $('cliente-monto').value = c.montoPago || '';
        selectPlataforma.value = c.servicioPlataforma;
        $('cliente-detalle').value = c.servicioDetalle;
        $('cliente-correo').value = c.servicioCorreo;
        $('cliente-telefono').value = c.telefono || '';
        $('cliente-metodo-pago').value = c.metodoPago || 'Binance';
        $('cliente-contrasena').value = c.contrasena || '';
        $('cliente-correo-personal').value = c.correoPersonal || '';
        $('cliente-enlace').value = c.enlaceIptv || '';
        $('cliente-fecha-vencimiento').value = c.fechaVencimiento ? aInputFecha(c.fechaVencimiento) : '';
        $('cliente-duracion').value = 'custom'; // no toca la fecha real
        adaptarFormularioSegunPlataforma(c.servicioPlataforma);
        actualizarSugerenciasCorreo();
        $('hint-clave-madre').style.display = 'none';
        $('titulo-modal-cliente').textContent = 'Editar Cliente';
        toggleModal('modal-cliente', true);
    };

    formCliente?.addEventListener('submit', (e) => {
        e.preventDefault();
        const idForm = $('cliente-id').value;
        const fechaManual = desdeInputFecha($('cliente-fecha-vencimiento').value);

        let telefono = $('cliente-telefono').value.replace(/\D/g, '');
        if (telefono.startsWith('0') && telefono.length === 11) telefono = '58' + telefono.substring(1);
        else if (telefono.length === 10 && !telefono.startsWith('58')) telefono = '58' + telefono;

        const plataforma = selectPlataforma.value;
        const idNum = idForm ? parseInt(idForm, 10) : Date.now();
        const previo = idForm ? clientes.find(c => c.id === idNum) : null;

        const datos = {
            id: idNum,
            nombre: $('cliente-nombre').value.trim(),
            estado: 'aldia',
            montoPago: parseFloat($('cliente-monto').value) || 0,
            servicioPlataforma: plataforma,
            servicioDetalle: $('cliente-detalle').value.trim(),
            servicioCorreo: $('cliente-correo').value.trim(),
            correoPersonal: plataforma.includes('Spotify') ? $('cliente-correo-personal').value.trim() : '',
            enlaceIptv: plataforma === 'IPTV' ? $('cliente-enlace').value.trim() : '',
            fechaVencimiento: fechaManual,
            telefono,
            metodoPago: $('cliente-metodo-pago').value,
            contrasena: $('cliente-contrasena').value.trim(),
            estadoAviso: previo ? (previo.estadoAviso || 'pendiente') : 'pendiente'
        };

        if (previo) {
            clientes[clientes.findIndex(c => c.id === idNum)] = datos;
            // Solo corrige el último pago si fue registrado hace menos de 24 h (error de dedo).
            // Antes se reescribían TODOS los pagos pasados al cambiar el precio.
            const ultimo = historialPagos.filter(p => p.clienteId === idNum).sort((a, b) => b.fecha - a.fecha)[0];
            if (ultimo && (Date.now() - ultimo.fecha) < 86400000) {
                ultimo.monto = datos.montoPago;
                ultimo.plataforma = datos.servicioPlataforma;
            }
        } else {
            clientes.push(datos);
            registrarTransaccionHistorial(datos.montoPago, datos.servicioPlataforma, datos.id);
        }

        guardarYRenderizarClientes();
        toggleModal('modal-cliente', false);
        mostrarNotificacion('¡Cliente guardado! Abriendo WhatsApp...');
        window.open(urlWhatsApp(datos.telefono, construirMensajeEntrega(datos)), '_blank');
    });

    // ----- Eliminar cliente -----
    let clienteAEliminarId = null;
    $('btn-cancelar-eliminar-cliente')?.addEventListener('click', () => { toggleModal('modal-eliminar-cliente', false); clienteAEliminarId = null; });
    $('btn-confirmar-eliminar-cliente')?.addEventListener('click', () => {
        if (clienteAEliminarId === null) return;
        clientes = clientes.filter(c => c.id !== clienteAEliminarId);
        historialPagos = historialPagos.filter(p => p.clienteId !== clienteAEliminarId);
        clienteAEliminarId = null;
        guardarYRenderizarClientes();
        toggleModal('modal-eliminar-cliente', false);
        mostrarNotificacion('Cliente eliminado', 'info');
    });

    // ----- Pago / renovación -----
    let clientePagoId = null;
    $('btn-cancelar-pago')?.addEventListener('click', () => { toggleModal('modal-pago', false); clientePagoId = null; });
    $('btn-confirmar-pago')?.addEventListener('click', () => {
        if (clientePagoId === null) return;
        const c = clientes.find(x => x.id === clientePagoId);
        if (c) {
            const base = c.fechaVencimiento > Date.now() ? new Date(c.fechaVencimiento) : new Date();
            const nueva = sumarDuracion(base, $('pago-duracion').value);
            c.estado = 'aldia';
            c.estadoAviso = 'pendiente';
            c.fechaVencimiento = nueva.setHours(23, 59, 59, 999);
            registrarTransaccionHistorial(c.montoPago, c.servicioPlataforma, c.id);
            guardarYRenderizarClientes();
        }
        toggleModal('modal-pago', false);
        clientePagoId = null;
        mostrarNotificacion('¡Pago registrado con éxito!');
    });

    const enviarRecordatorio = (id) => {
        const c = clientes.find(x => x.id === id);
        if (!c) return;
        const moroso = c.estado === 'moroso';
        const mensaje = `Hola ${c.nombre}!\n\nTe escribimos de *Streaming Mundial* para recordarte que tu suscripción de *${c.servicioPlataforma}* ${moroso ? 'ha vencido' : 'vence el día de hoy'}.\n\nPuedes renovar tu servicio realizando el pago de *${dinero(c.montoPago)}* vía *${c.metodoPago || 'tu método habitual'}*.\n\n¡Quedamos atentos para renovar tu acceso!`;
        c.estadoAviso = 'avisado';
        guardarYRenderizarClientes();
        window.open(urlWhatsApp(c.telefono, mensaje), '_blank');
        mostrarNotificacion('Recordatorio enviado', 'info');
    };

    // ==========================================
    // 15. ACCIONES DE LAS TARJETAS (un solo listener)
    // ==========================================
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-accion]');
        if (!btn) return;
        const accion = btn.dataset.accion;
        const id = btn.dataset.id ? parseInt(btn.dataset.id, 10) : null;

        switch (accion) {
            case 'editar-cliente': abrirModalCliente(id); break;
            case 'eliminar-cliente': clienteAEliminarId = id; toggleModal('modal-eliminar-cliente', true); break;
            case 'pago': clientePagoId = id; $('pago-duracion').value = '1m'; toggleModal('modal-pago', true); break;
            case 'recordar': enviarRecordatorio(id); break;
            case 'copiar-datos': {
                const c = clientes.find(x => x.id === id);
                if (c) copiarTexto(construirMensajeEntrega(c), 'Datos copiados');
                break;
            }
            case 'subcuentas': abrirModalSubcuentas(id); break;
            case 'editar-cuenta': abrirModalEditarCuenta(id); break;
            case 'eliminar-cuenta': cuentaAEliminar = id; toggleModal('modal-eliminar', true); break;
            case 'copiar': copiarTexto(btn.dataset.valor || '', 'Copiado'); break;
            case 'ver-pass': {
                const span = btn.closest('.field-row').querySelector('.pass-value');
                if (!span) break;
                const visible = span.dataset.visible === '1';
                span.textContent = visible ? '••••••••' : span.dataset.pass;
                span.dataset.visible = visible ? '0' : '1';
                btn.innerHTML = `<i class="fa-solid ${visible ? 'fa-eye' : 'fa-eye-slash'}"></i>`;
                break;
            }
        }
    });

    // ==========================================
    // 16. AJUSTES: COSTOS
    // ==========================================
    const renderizarVistaCostos = () => {
        const cont = $('contenedor-costos');
        if (!cont) return;
        cont.innerHTML = PLATAFORMAS.map(p => `
            <div class="costo-item">
                <label><i class="${p.icono}" style="color:${p.color}"></i> ${esc(p.nombre)}</label>
                <div class="input-icon-wrapper">
                    <i class="fa-solid fa-dollar-sign"></i>
                    <input type="number" step="0.01" min="0" class="input-costo" data-plat="${esc(p.nombre)}" value="${parseFloat(costosProveedores[p.nombre]) || 0}">
                </div>
            </div>`).join('');
    };

    $('btn-guardar-costos')?.addEventListener('click', () => {
        document.querySelectorAll('.input-costo').forEach(input => {
            costosProveedores[input.dataset.plat] = parseFloat(input.value) || 0;
        });
        guardarNube();
        actualizarDashboard();
        mostrarNotificacion('Costos guardados y calculados');
    });

    // ==========================================
    // 17. AJUSTES: RESPALDO DE DATOS
    // ==========================================
    $('btn-exportar')?.addEventListener('click', () => {
        const datos = { version: 1, fecha: new Date().toISOString(), cuentas, clientes, historialPagos, costosProveedores };
        const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `streaming-mundial-respaldo-${aInputFecha(Date.now())}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        mostrarNotificacion('Respaldo descargado');
    });

    $('archivo-importar')?.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const d = JSON.parse(reader.result);
                if (!Array.isArray(d.cuentas) || !Array.isArray(d.clientes)) throw new Error('formato');
                if (!confirm('Esto reemplazará TODOS tus datos actuales por los del respaldo. ¿Continuar?')) return;
                cuentas = d.cuentas;
                clientes = d.clientes;
                historialPagos = d.historialPagos || [];
                costosProveedores = d.costosProveedores || {};
                guardarNube();
                refrescarTodo();
                mostrarNotificacion('Respaldo restaurado');
            } catch (err) {
                mostrarNotificacion('Ese archivo no es un respaldo válido', 'info');
            }
        };
        reader.readAsText(file);
    });

    // ==========================================
    // 18. INICIO
    // ==========================================
    const fechaHoy = $('fecha-hoy');
    if (fechaHoy) fechaHoy.textContent = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

    iniciarAjustesApariencia();
    sincronizarControlesTema();

    try {
        const ultima = localStorage.getItem('sm_vista');
        if (ultima && ultima !== 'inicio') irAVista(ultima);
    } catch (e) { /* nada */ }

    escucharNubeEnTiempoReal();
});