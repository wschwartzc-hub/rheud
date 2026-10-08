// Tests de las funciones puras de la app. Correr con TZ=America/Monterrey (npm test).
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../js/nucleo.js');

// Hora local de Monterrey (UTC−6): new Date(año, mes, día, h, m)
const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);

test('la zona horaria de los tests es la de Monterrey', () => {
  assert.equal(new Date(2026, 9, 8, 12).getTimezoneOffset(), 360);
});

/* ---------------- Fechas ---------------- */
test('daysSince cuenta medianoches, no se adelanta después de mediodía', () => {
  assert.equal(N.daysSince('2026-10-08', at(2026, 10, 8, 15, 30)), 0);
  assert.equal(N.daysSince('2026-10-07', at(2026, 10, 8, 0, 5)), 1);
  assert.equal(N.daysSince('2026-10-07', at(2026, 10, 8, 23, 59)), 1);
  assert.equal(N.daysSince('2026-09-24', at(2026, 10, 8, 13, 0)), 14);
});

test('daysSince de noche no se pasa al día siguiente (UTC ya es mañana)', () => {
  // 20:00 en Monterrey = 02:00 UTC del día siguiente
  assert.equal(N.daysSince('2026-10-08', at(2026, 10, 8, 20, 0)), 0);
});

test('diasRestantes: vence hoy solo el día que vence', () => {
  const ahora = at(2026, 10, 8, 15, 30);
  assert.equal(N.diasRestantes('2026-10-09', ahora), 1);   // antes decía "Vence hoy"
  assert.equal(N.diasRestantes('2026-10-08', ahora), 0);
  assert.equal(N.diasRestantes('2026-10-01', ahora), 0);   // vencida: nunca negativo
  assert.equal(N.diasRestantes('2026-11-07', ahora), 30);
  assert.equal(N.diasRestantes('', ahora), null);
});

test('fechaLocal convierte la marca UTC a la fecha de Monterrey', () => {
  // 03:30 UTC del 8 = 21:30 del 7 en Monterrey
  assert.equal(N.fechaLocal('2026-10-08T03:30:00+00:00'), '2026-10-07');
  assert.equal(N.fechaLocal('2026-10-08T18:00:00Z'), '2026-10-08');
  assert.equal(N.fechaLocal(''), '');
  assert.equal(N.fechaLocal('basura'), '');
});

test('parseYmd y sumarDias usan medianoche local y cruzan meses', () => {
  assert.equal(N.parseYmd('2026-10-08').getHours(), 0);
  assert.equal(N.sumarDias('2026-10-31', 1), '2026-11-01');
  assert.equal(N.sumarDias('2026-03-01', -1), '2026-02-28');
  assert.equal(N.diasEntre('2026-12-31', '2027-01-01'), 1);
});

/* ---------------- Agenda ---------------- */
const gel = { id: 's1', n: 'Gel', d: 60, r: 'mesa', l: 0, cat: 'nails' };
const hidra = { id: 's2', n: 'Hidrafacial', d: 60, r: 'cabina', l: 15, cat: 'skin' };

test('segmentos: servicios en secuencia, cada uno en su recurso', () => {
  const s = N.segmentos(600, [gel, hidra], 120);
  assert.deepEqual(s.map(x => [x.r, x.s, x.e, x.l]), [['mesa', 600, 660, 0], ['cabina', 660, 720, 15]]);
});

test('segmentos: la duración editada a mano alarga el último servicio', () => {
  const s = N.segmentos(600, [gel], 120);
  assert.deepEqual(s.map(x => [x.s, x.e]), [[600, 720]]);
});

test('segmentos: una duración menor recorta los servicios', () => {
  const s = N.segmentos(600, [gel, hidra], 90);
  assert.deepEqual(s.map(x => [x.r, x.s, x.e]), [['mesa', 600, 660], ['cabina', 660, 690]]);
  assert.deepEqual(N.segmentos(600, [gel, hidra], 45).map(x => [x.r, x.e]), [['mesa', 645]]);
});

test('segmentos: cita vieja sin duración por servicio es un solo bloque', () => {
  const info = id => ({ s9: { recurso: 'cabina', cat: 'skin' } })[id];
  assert.deepEqual(N.segmentos(540, [{ id: 's9', n: 'Facial', p: 700 }], 90, info), [{ r: 'cabina', s: 540, e: 630, l: 0, cat: 'skin' }]);
  assert.deepEqual(N.segmentos(540, [], 0), [{ r: 'mesa', s: 540, e: 600, l: 0, cat: 'nails' }]);
  assert.deepEqual(N.segmentos(null, [gel], 60), []);
});

test('segsClash: mesa y cabina no chocan entre sí; la limpieza sí bloquea', () => {
  const busy = [{ r: 'cabina', s: 600, e: 675 }]; // 10:00–11:00 + 15 de limpieza
  assert.equal(N.segsClash([{ r: 'mesa', s: 600, e: 660, l: 0 }], busy), null);
  assert.ok(N.segsClash([{ r: 'cabina', s: 660, e: 720, l: 0 }], busy));
  assert.equal(N.segsClash([{ r: 'cabina', s: 675, e: 735, l: 0 }], busy), null);
  assert.equal(N.segsClash([{ r: 'ninguno', s: 600, e: 700 }], busy), null);
});

test('segsClash con la duración manual: una cita alargada bloquea la siguiente hora', () => {
  const busy = N.segmentos(600, [gel], 120).map(s => ({ s: s.s, e: s.e + s.l, r: s.r }));
  assert.ok(N.segsClash(N.segmentos(660, [gel], 60), busy));
});

test('libresPorRecurso cuenta mesa y cabina por separado y une encimados', () => {
  const busy = [{ r: 'mesa', s: 540, e: 840 }, { r: 'cabina', s: 540, e: 840 }, { r: 'mesa', s: 600, e: 660 }];
  const l = N.libresPorRecurso(busy, 480, 1260, ['mesa', 'cabina']);
  assert.equal(l.mesa, 780 - 300);
  assert.equal(l.cabina, 780 - 300);
});

test('bloquesEvento: aparta mesa y cabina; todo el día; si no bloquea, nada', () => {
  assert.deepEqual(N.bloquesEvento({ hora: '13:00', dur: 90, bloquea: true }),
    [{ r: 'mesa', s: 780, e: 870, l: 0 }, { r: 'cabina', s: 780, e: 870, l: 0 }]);
  assert.deepEqual(N.bloquesEvento({ hora: '', dur: 60, bloquea: true }).map(b => [b.s, b.e]), [[0, 1440], [0, 1440]]);
  assert.deepEqual(N.bloquesEvento({ hora: '13:00', dur: 60, bloquea: false }), []);
  assert.deepEqual(N.bloquesEvento(null), []);
  // una cita propuesta encima del evento choca; después, no
  const busy = N.bloquesEvento({ hora: '13:00', dur: 60, bloquea: true });
  assert.ok(N.segsClash([{ r: 'cabina', s: 750, e: 810, l: 0 }], busy));
  assert.equal(N.segsClash([{ r: 'mesa', s: 840, e: 900, l: 0 }], busy), null);
  // los huecos saltan el evento
  const props = t => [{ r: 'mesa', s: t, e: t + 60, l: 0 }];
  assert.deepEqual(N.huecos(busy, props, 720, 900, 60, null, 3), [720, 840]); // 12:00 termina justo cuando empieza
});

test('huecos: no sugiere horas que ya pasaron', () => {
  const props = t => N.segmentos(t, [gel], 60);
  assert.deepEqual(N.huecos([], props, 480, 1260, 60, null, 3), [480, 510, 540]);
  assert.deepEqual(N.huecos([], props, 480, 1260, 60, 15 * 60 + 47, 2), [960, 990]); // 15:47 → 16:00
  assert.deepEqual(N.huecos([{ r: 'mesa', s: 960, e: 1020 }], props, 480, 1260, 60, 900, 2), [900, 1020]);
  assert.deepEqual(N.huecos([], props, 480, 1260, 60, 1250, 2), []);
});

test('toMin y hhmm', () => {
  assert.equal(N.toMin('09:30'), 570);
  assert.equal(N.toMin(''), null);
  assert.equal(N.hhmm(570), '09:30');
});

/* ---------------- Precios variables ---------------- */
test('parsePrecios: separador de miles y separadores / ; o coma con espacio', () => {
  assert.deepEqual(N.parsePrecios('1,200, 1,500'), [1200, 1500]);
  assert.deepEqual(N.parsePrecios('80 / 100 / 1,300'), [80, 100, 1300]);
  assert.deepEqual(N.parsePrecios('80; 100;130'), [80, 100, 130]);
  assert.deepEqual(N.parsePrecios('80, 100, 130'), [80, 100, 130]);
  assert.deepEqual(N.parsePrecios('$1,250.50 / $99'), [1250.5, 99]);
  assert.deepEqual(N.parsePrecios('12,00 / abc / 0 / -5'), []);
  assert.deepEqual(N.parsePrecios(''), []);
});

/* ---------------- Insights ---------------- */
test('rangoInsights mes: del día 1 al mismo día del mes anterior', () => {
  assert.deepEqual(N.rangoInsights('mes', '2026-10-08'), { desde: '2026-10-01', hasta: '2026-10-08', prevDesde: '2026-09-01', prevHasta: '2026-09-08' });
  assert.deepEqual(N.rangoInsights('mes', '2026-03-31'), { desde: '2026-03-01', hasta: '2026-03-31', prevDesde: '2026-02-01', prevHasta: '2026-02-28' });
  assert.deepEqual(N.rangoInsights('mes', '2026-01-15'), { desde: '2026-01-01', hasta: '2026-01-15', prevDesde: '2025-12-01', prevHasta: '2025-12-15' });
});

test('rangoInsights semana: lunes a hoy contra los mismos días de la semana pasada', () => {
  // 8 oct 2026 es jueves
  assert.deepEqual(N.rangoInsights('sem', '2026-10-08'), { desde: '2026-10-05', hasta: '2026-10-08', prevDesde: '2026-09-28', prevHasta: '2026-10-01' });
  // domingo: semana completa
  assert.deepEqual(N.rangoInsights('sem', '2026-10-11'), { desde: '2026-10-05', hasta: '2026-10-11', prevDesde: '2026-09-28', prevHasta: '2026-10-04' });
});

test('rangoInsights día: hoy contra ayer (también al cambiar de mes)', () => {
  assert.deepEqual(N.rangoInsights('dia', '2026-10-08'), { desde: '2026-10-08', hasta: '2026-10-08', prevDesde: '2026-10-07', prevHasta: '2026-10-07' });
  assert.deepEqual(N.rangoInsights('dia', '2026-11-01'), { desde: '2026-11-01', hasta: '2026-11-01', prevDesde: '2026-10-31', prevHasta: '2026-10-31' });
});

test('rangoInsights año y rango libre', () => {
  assert.deepEqual(N.rangoInsights('ano', '2028-02-29'), { desde: '2028-01-01', hasta: '2028-02-29', prevDesde: '2027-01-01', prevHasta: '2027-02-28' });
  assert.deepEqual(N.rangoInsights('rango', '2026-10-08', '2026-10-10', '2026-10-01'), { desde: '2026-10-01', hasta: '2026-10-10', prevDesde: '2026-09-21', prevHasta: '2026-09-30' });
});

test('repartir un cobro entre servicios según su precio', () => {
  assert.deepEqual(N.repartir(400, [300, 100]), [300, 100]);
  assert.deepEqual(N.repartir(360, [300, 100]), [270, 90]);
  assert.deepEqual(N.repartir(100, [0, 0]), [50, 50]);
});

/* ---------------- CSV ---------------- */
test('celdaCSV neutraliza fórmulas y entrecomilla', () => {
  assert.equal(N.celdaCSV('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(N.celdaCSV('+52 81'), "'+52 81");
  assert.equal(N.celdaCSV('-algo'), "'-algo");
  assert.equal(N.celdaCSV('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(N.celdaCSV('Gel, uñas'), '"Gel, uñas"');
  assert.equal(N.celdaCSV('línea\notra'), '"línea\notra"');
  assert.equal(N.celdaCSV(-50), '-50');
  assert.equal(N.celdaCSV(null), '');
  assert.equal(N.csv([['a', 'b'], [1, '=1+1']]), "a,b\r\n1,'=1+1");
});

/* ---------------- Comprobantes ---------------- */
test('tipoComprobante acepta solo rutas del bucket o imágenes data:', () => {
  assert.equal(N.tipoComprobante('9b2c7f1e-1234-4abc-9def-0123456789ab/1700000000000_ab12c.jpg'), 'ruta');
  assert.equal(N.tipoComprobante('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), 'data');
  assert.equal(N.tipoComprobante("x');alert(1);('"), null);
  assert.equal(N.tipoComprobante('https://evil.example/a.jpg'), null);
  assert.equal(N.tipoComprobante('"><img src=x onerror=alert(1)>'), null);
  assert.equal(N.tipoComprobante('data:text/html;base64,PHNjcmlwdD4='), null);
  assert.equal(N.tipoComprobante('9b2c7f1e-1234-4abc-9def-0123456789ab/../x.jpg'), null); // no sale de la carpeta
  assert.equal(N.tipoComprobante('9b2c7f1e-1234-4abc-9def-0123456789ab/a/b.jpg'), null);
  assert.equal(N.tipoComprobante('9b2c7f1e-1234-4abc-9def-0123456789ab/x.svg'), null);
});

/* ---------------- Expediente ---------------- */
test('idNota es estable y distingue notas del mismo día', () => {
  const a = { fecha: '2026-10-01', nota: 'A' }, b = { fecha: '2026-10-01', nota: 'B' };
  assert.equal(N.idNota(a, 0), N.idNota({ ...a }, 0));
  assert.notEqual(N.idNota(a, 0), N.idNota(b, 1));
});
