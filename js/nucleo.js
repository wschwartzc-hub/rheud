/* Rhēud · funciones puras de la app: fechas, agenda, precios, periodos y CSV.
   Sin DOM ni Supabase, para poder probarlas con node --test. Funciona como
   script clásico (expone window.RheudNucleo) y como módulo de Node. */
(function (root) {
  'use strict';
  const DIA = 86400000;

  /* ---------------- Fechas (siempre en la hora local del teléfono) ---------------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  // 'YYYY-MM-DD' → medianoche local (new Date('YYYY-MM-DD') sería UTC)
  function parseYmd(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  // Días entre dos fechas contando medianoches locales (no horas transcurridas)
  function diasEntre(a, b) {
    const x = parseYmd(a), y = parseYmd(b);
    if (!x || !y) return null;
    return Math.round((y - x) / DIA); // round absorbe un cambio de horario de ±1 h
  }
  function sumarDias(key, n) { const d = parseYmd(key); d.setDate(d.getDate() + n); return ymd(d); }
  function daysSince(key, ahora) { return diasEntre(key, ymd(ahora || new Date())); }
  // Días que le quedan a una cortesía: 0 el día que vence, null sin vencimiento
  function diasRestantes(fechaVence, ahora) {
    if (!fechaVence) return null;
    const d = diasEntre(ymd(ahora || new Date()), fechaVence);
    return d == null ? null : Math.max(0, d);
  }
  // Marca de tiempo de Supabase (UTC) → fecha local; slice(0,10) daría la fecha UTC
  function fechaLocal(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return isNaN(d) ? '' : ymd(d);
  }

  /* ---------------- Agenda: segmentos por recurso y traslapes ---------------- */
  function toMin(t) {
    if (!t) return null;
    const p = String(t).split(':'), h = Number(p[0]), m = Number(p[1] || 0);
    return (isFinite(h) && isFinite(m)) ? h * 60 + m : null;
  }
  function hhmm(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  /* Bloques que ocupa una cita que empieza en s0. Cada servicio usa su recurso
     d min y lo deja l min en limpieza. La duración de la cita (editable a mano)
     manda: si es mayor que la suma, el último servicio se alarga; si es menor,
     se recorta. Las citas viejas sin duración por servicio son un solo bloque. */
  function segmentos(s0, items, dur, infoSvc) {
    if (s0 == null) return [];
    items = Array.isArray(items) ? items : [];
    const total = Number(dur) > 0 ? Number(dur) : 0;
    const conDur = items.filter(i => i && Number(i.d) > 0);
    if (!conDur.length) {
      const i0 = items[0] || {}, s = (infoSvc && i0.id) ? infoSvc(i0.id) : null;
      return [{ r: i0.r || (s && s.recurso) || 'mesa', s: s0, e: s0 + (total || 60), l: 0, cat: i0.cat || (s && s.cat) || 'nails' }];
    }
    let cur = s0; const segs = [];
    conDur.forEach(i => { const d = Number(i.d); segs.push({ r: i.r || 'mesa', s: cur, e: cur + d, l: Number(i.l) || 0, cat: i.cat || 'nails', n: i.n }); cur += d; });
    if (!total) return segs;
    const fin = s0 + total;
    if (fin > cur) segs[segs.length - 1].e = fin;
    else if (fin < cur) {
      const out = segs.filter(sg => sg.s < fin);
      out[out.length - 1].e = Math.min(out[out.length - 1].e, fin);
      return out;
    }
    return segs;
  }
  // Primer choque entre los bloques propuestos y los ocupados del mismo recurso
  function segsClash(props, busy) {
    for (const p of props) {
      if (p.r === 'ninguno') continue;
      for (const b of busy) {
        if (b.r !== p.r || b.r === 'ninguno') continue;
        if (p.s < b.e && (p.e + (p.l || 0)) > b.s) return { p, b };
      }
    }
    return null;
  }
  // Minutos ocupados de un recurso dentro de la ventana (une los bloques encimados)
  function minutosOcupados(busy, r, winS, winE) {
    const iv = busy.filter(b => b.r === r).map(b => [Math.max(b.s, winS), Math.min(b.e, winE)])
      .filter(x => x[1] > x[0]).sort((a, b) => a[0] - b[0]);
    let tot = 0, cs = null, ce = null;
    iv.forEach(([s, e]) => {
      if (cs == null || s > ce) { if (cs != null) tot += ce - cs; cs = s; ce = e; }
      else ce = Math.max(ce, e);
    });
    if (cs != null) tot += ce - cs;
    return tot;
  }
  function libresPorRecurso(busy, winS, winE, recursos) {
    const out = {};
    recursos.forEach(r => { out[r] = Math.max(0, (winE - winS) - minutosOcupados(busy, r, winS, winE)); });
    return out;
  }
  /* Horas sugeridas cada 30 min sin choque; `desde` (minutos) evita sugerir
     horas que ya pasaron. propuestos(t) da los bloques de la cita en t. */
  function huecos(busy, propuestos, winS, winE, dur, desde, max) {
    const out = [];
    let t = winS;
    if (desde != null && desde > t) t = Math.ceil(desde / 30) * 30;
    for (; t + dur <= winE && out.length < (max || 4); t += 30) if (!segsClash(propuestos(t), busy)) out.push(t);
    return out;
  }

  /* ---------------- Precios variables ---------------- */
  /* "80 / 100 / 1,300" → [80, 100, 1300]. Separadores: / ; salto de línea o
     coma seguida de espacio ("1,200, 1,500" → [1200, 1500]). La coma pegada a
     tres dígitos es separador de miles. */
  function parsePrecios(str) {
    return String(str || '').split(/[\/;\n]|,\s+/).map(x => x.replace(/[\s$]/g, '')).filter(Boolean).map(x => {
      if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) x = x.replace(/,/g, '');
      return /^\d+(\.\d+)?$/.test(x) ? Number(x) : NaN;
    }).filter(n => isFinite(n) && n > 0);
  }

  /* ---------------- Insights: periodo actual y el anterior equivalente ---------------- */
  /* Devuelve {desde, hasta, prevDesde, prevHasta} (claves YYYY-MM-DD).
     sem: lunes → hoy contra lunes → mismo día de la semana pasada
     mes: día 1 → hoy contra día 1 → mismo día del mes anterior (o su último día)
     ano: 1 ene → hoy contra 1 ene → mismo día del año anterior
     rango: [a, b] contra los mismos días justo antes de a */
  function rangoInsights(periodo, hoy, a, b) {
    const h = parseYmd(hoy);
    let desde, hasta, prevDesde, prevHasta;
    if (periodo === 'sem') {
      const dow = h.getDay(), diff = dow === 0 ? 6 : dow - 1;
      desde = sumarDias(hoy, -diff); hasta = hoy;
      prevDesde = sumarDias(desde, -7); prevHasta = sumarDias(hoy, -7);
    } else if (periodo === 'mes') {
      desde = ymd(new Date(h.getFullYear(), h.getMonth(), 1)); hasta = hoy;
      const ult = new Date(h.getFullYear(), h.getMonth(), 0).getDate();
      prevDesde = ymd(new Date(h.getFullYear(), h.getMonth() - 1, 1));
      prevHasta = ymd(new Date(h.getFullYear(), h.getMonth() - 1, Math.min(h.getDate(), ult)));
    } else if (periodo === 'ano') {
      desde = ymd(new Date(h.getFullYear(), 0, 1)); hasta = hoy;
      const y = h.getFullYear() - 1, ult = new Date(y, h.getMonth() + 1, 0).getDate();
      prevDesde = ymd(new Date(y, 0, 1));
      prevHasta = ymd(new Date(y, h.getMonth(), Math.min(h.getDate(), ult)));
    } else {
      desde = a || hoy; hasta = b || hoy;
      if (hasta < desde) { const t = desde; desde = hasta; hasta = t; }
      const n = diasEntre(desde, hasta) + 1;
      prevHasta = sumarDias(desde, -1); prevDesde = sumarDias(desde, -n);
    }
    return { desde, hasta, prevDesde, prevHasta };
  }
  // Reparte un monto entre partes según su peso (precio de cada servicio)
  function repartir(total, pesos) {
    const s = pesos.reduce((a, p) => a + (Number(p) || 0), 0);
    return pesos.map(p => s > 0 ? total * (Number(p) || 0) / s : total / (pesos.length || 1));
  }

  /* ---------------- CSV ---------------- */
  /* Excel ejecuta celdas que empiezan con = + - @ (inyección de fórmulas):
     a los textos así se les antepone '. Se entrecomilla lo que lleva
     comas, comillas o saltos de línea. Los números se dejan como números. */
  function celdaCSV(v) {
    if (v == null) return '';
    let s = String(v);
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(filas) { return filas.map(f => f.map(celdaCSV).join(',')).join('\r\n'); }

  /* ---------------- Comprobantes ---------------- */
  // Solo rutas del bucket (negocio/archivo.jpg) o una imagen recién capturada
  const RUTA_COMP = /^[0-9a-f-]{36}\/[\w.-]+\.(jpg|jpeg|png|webp)$/;
  const DATA_IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
  function tipoComprobante(v) {
    if (typeof v !== 'string' || !v) return null;
    if (RUTA_COMP.test(v)) return 'ruta';
    if (DATA_IMG.test(v)) return 'data';
    return null;
  }

  /* ---------------- Expediente: id estable para notas viejas sin id ---------------- */
  function idNota(n, i) {
    let h = 0; const s = (n && n.fecha || '') + '|' + (n && n.nota || '');
    for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) | 0;
    return 'n' + i + '-' + (h >>> 0).toString(36);
  }

  const api = {
    ymd, parseYmd, diasEntre, sumarDias, daysSince, diasRestantes, fechaLocal,
    toMin, hhmm, segmentos, segsClash, minutosOcupados, libresPorRecurso, huecos,
    parsePrecios, rangoInsights, repartir, celdaCSV, csv, tipoComprobante, idNota
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RheudNucleo = api;
})(typeof window !== 'undefined' ? window : globalThis);
