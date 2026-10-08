/* ================= EVENTOS DELEGADOS =================
   Reemplaza los onclick="…" en línea para poder usar una CSP sin
   'unsafe-inline'. Un elemento declara data-on-click="fn('a', 2)" (también
   data-on-input, data-on-change, data-on-blur) y aquí se llama a window.fn.
   Nunca se evalúa código: solo se entienden llamadas a funciones globales con
   argumentos literales, `this`, `this.value`, `this.checked`,
   `this.dataset.x` y `event`, separadas por «;». `event.stopPropagation()`
   detiene la búsqueda en los ancestros, igual que con los atributos en línea. */
(function () {
  'use strict';
  const TIPOS = { click: 'click', input: 'input', change: 'change', blur: 'focusout' };
  const cache = new Map();

  function partir(s, sep) {
    const out = []; let prof = 0, q = null, cur = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        cur += ch;
        if (ch === '\\') { cur += s[++i] || ''; continue; }
        if (ch === q) q = null;
        continue;
      }
      if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
      if (ch === '(') prof++;
      else if (ch === ')') prof--;
      if (ch === sep && prof === 0) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
  }

  function argumento(a) {
    if (/^'(?:[^'\\]|\\.)*'$/.test(a) || /^"(?:[^"\\]|\\.)*"$/.test(a)) return { v: a.slice(1, -1).replace(/\\(.)/g, '$1') };
    if (/^-?\d+(?:\.\d+)?$/.test(a)) return { v: Number(a) };
    if (a === 'true') return { v: true };
    if (a === 'false') return { v: false };
    if (a === 'null') return { v: null };
    if (a === 'undefined') return { v: undefined };
    if (a === 'event') return { evento: true };
    if (a === 'this') return { ruta: [] };
    const m = a.match(/^this\.(value|checked|dataset\.[A-Za-z_][\w]*)$/);
    if (m) return { ruta: m[1].split('.') };
    throw new Error('Argumento no soportado: ' + a);
  }

  function instruccion(st) {
    if (st === 'event.stopPropagation()') return { detener: true };
    if (st === 'event.preventDefault()') return { prevenir: true };
    const m = st.match(/^([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/);
    if (!m) throw new Error('Expresión no soportada: ' + st);
    return { fn: m[1], args: partir(m[2], ',').map((x) => argumento(x.trim())) };
  }

  function compilar(expr) {
    let c = cache.get(expr);
    if (!c) {
      c = partir(expr, ';').map((s) => s.trim()).filter(Boolean).map(instruccion);
      cache.set(expr, c);
    }
    return c;
  }

  function valor(arg, el, e) {
    if ('v' in arg) return arg.v;
    if (arg.evento) return e;
    let x = el;
    for (const k of arg.ruta) x = x == null ? undefined : x[k];
    return x;
  }

  function despachar(tipo, e) {
    const attr = 'data-on-' + tipo;
    // La ruta se calcula al disparar el evento: si un manejador vuelve a
    // pintar la lista, los ancestros originales siguen recibiéndolo.
    for (const nodo of e.composedPath()) {
      if (!(nodo instanceof Element) || !nodo.hasAttribute(attr)) continue;
      let detener = false;
      try {
        for (const ins of compilar(nodo.getAttribute(attr))) {
          if (ins.detener) { detener = true; e.stopPropagation(); continue; }
          if (ins.prevenir) { e.preventDefault(); continue; }
          const fn = window[ins.fn];
          if (typeof fn !== 'function') { console.error('Función no encontrada:', ins.fn); continue; }
          fn.apply(nodo, ins.args.map((a) => valor(a, nodo, e)));
        }
      } catch (err) {
        console.error(err);
      }
      if (detener) return;
    }
  }

  for (const [tipo, evento] of Object.entries(TIPOS)) {
    document.addEventListener(evento, (e) => despachar(tipo, e));
  }
})();
