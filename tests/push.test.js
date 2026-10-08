// Tests de los avisos push: node --test
// Cubren lo que no necesita red: cifrado Web Push (vector del RFC 8291),
// firma VAPID, selección de citas por hora de Monterrey y los textos.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const FN = path.join(RAIZ, 'supabase/functions/rheud-push');
let W, L;
test.before(async () => {
  W = await import(path.join(FN, 'webpush.mjs'));
  L = await import(path.join(FN, 'logica.mjs'));
});

/* Descifrado independiente (node:crypto) de un cuerpo aes128gcm de RFC 8291. */
function descifrar(cuerpo, uaPrivada, uaPublica, auth) {
  const buf = Buffer.from(cuerpo);
  const sal = buf.subarray(0, 16);
  const rs = buf.readUInt32BE(16);
  const idlen = buf[20];
  const asPublica = buf.subarray(21, 21 + idlen);
  const cifrado = buf.subarray(21 + idlen);
  assert.equal(rs, 4096);
  assert.equal(idlen, 65);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(uaPrivada, 'base64url'));
  const secreto = ecdh.computeSecret(asPublica);
  const ua = Buffer.from(uaPublica, 'base64url');
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secreto, Buffer.from(auth, 'base64url'),
    Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPublica]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(cifrado.subarray(cifrado.length - 16));
  const claro = Buffer.concat([d.update(cifrado.subarray(0, cifrado.length - 16)), d.final()]);
  let i = claro.length - 1;
  while (i >= 0 && claro[i] === 0) i--;
  assert.equal(claro[i], 2, 'delimitador de último registro');
  return claro.subarray(0, i).toString('utf8');
}

function parUA() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publica: ecdh.getPublicKey().toString('base64url'),
    privada: ecdh.getPrivateKey().toString('base64url'),
    auth: crypto.randomBytes(16).toString('base64url'),
  };
}

function vapidPrueba() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const j = privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(j.x, 'base64url'), Buffer.from(j.y, 'base64url')]);
  return { publicKey: pub.toString('base64url'), privateKey: j.d, subject: 'mailto:prueba@example.com', jwk: j };
}

/* ---------------- cifrado ---------------- */

// RFC 8291 §5 (Push Message Encryption Example).
const RFC = {
  claro: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublica: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivada: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublica: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivada: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  sal: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  mensaje: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

test('cifrado: reproduce exactamente el vector del RFC 8291', async () => {
  const out = await W.cifrar(W.b64urlABytes(RFC.claro), RFC.uaPublica, RFC.auth,
    { asPublica: RFC.asPublica, asPrivada: RFC.asPrivada, sal: RFC.sal });
  assert.equal(W.bytesAB64url(out), RFC.mensaje);
});

test('cifrado: el descifrado independiente del vector da el texto del RFC', () => {
  const t = descifrar(Buffer.from(RFC.mensaje, 'base64url'), RFC.uaPrivada, RFC.uaPublica, RFC.auth);
  assert.equal(t, 'When I grow up, I want to be a watermelon');
});

test('cifrado: ida y vuelta con clave efímera y sal aleatorias', async () => {
  const ua = parUA();
  const msg = JSON.stringify({ title: 'Cita en 30 min', body: '10:30 AM · Daniela C. · Extensiones soft gel' });
  const a = await W.cifrar(msg, ua.publica, ua.auth);
  const b = await W.cifrar(msg, ua.publica, ua.auth);
  assert.notDeepEqual(Buffer.from(a), Buffer.from(b), 'cada envío usa clave y sal nuevas');
  assert.equal(descifrar(a, ua.privada, ua.publica, ua.auth), msg);
  assert.equal(a.length, 86 + Buffer.byteLength(msg) + 1 + 16);
});

test('cifrado: rechaza claves inválidas y mensajes demasiado largos', async () => {
  const ua = parUA();
  await assert.rejects(W.cifrar('x', 'AAAA', ua.auth), /p256dh/);
  await assert.rejects(W.cifrar('x', ua.publica, 'AAAA'), /auth/);
  await assert.rejects(W.cifrar('x'.repeat(W.MAX_CONTENIDO + 1), ua.publica, ua.auth), /largo/);
});

/* ---------------- VAPID ---------------- */

test('VAPID: JWT ES256 válido con aud del servicio, exp ≤ 24 h y sub', async () => {
  const v = vapidPrueba();
  const ahora = 1_790_000_000;
  const h = await W.autorizacionVapid('https://web.push.apple.com/QGuQyavXutnMmd0-1hbP0h8', v, ahora);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h);
  assert.ok(m, h);
  assert.equal(m[4], v.publicKey);
  assert.deepEqual(JSON.parse(Buffer.from(m[1], 'base64url')), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(Buffer.from(m[2], 'base64url'));
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.sub, 'mailto:prueba@example.com');
  assert.ok(claims.exp > ahora && claims.exp <= ahora + 24 * 3600);
  const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: v.jwk.x, y: v.jwk.y }, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url'));
  assert.ok(ok, 'la firma verifica con la clave pública');
});

test('enviarPush: cabeceras, cuerpo descifrable y manejo de 201/410/errores', async () => {
  const v = vapidPrueba();
  const ua = parUA();
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', p256dh: ua.publica, auth: ua.auth };
  let visto = null;
  const responde = (status) => async (url, init) => { visto = { url, init }; return new Response(status === 201 ? '' : 'gone', { status }); };

  const r1 = await W.enviarPush(sub, { title: 'Hola' }, v, { ttl: 1800, urgencia: 'high', topic: 'resumen', fetch: responde(201) });
  assert.deepEqual(r1, { ok: true, status: 201, vencida: false, error: '' });
  assert.equal(visto.url, sub.endpoint);
  assert.equal(visto.init.method, 'POST');
  assert.equal(visto.init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(visto.init.headers.TTL, '1800');
  assert.equal(visto.init.headers.Urgency, 'high');
  assert.equal(visto.init.headers.Topic, 'resumen');
  assert.match(visto.init.headers.Authorization, /^vapid t=.+, k=/);
  assert.equal(descifrar(visto.init.body, ua.privada, ua.publica, ua.auth), '{"title":"Hola"}');

  const r2 = await W.enviarPush(sub, 'x', v, { fetch: responde(410) });
  assert.equal(r2.vencida, true);
  assert.equal(r2.ok, false);
  const r3 = await W.enviarPush(sub, 'x', v, { fetch: responde(404) });
  assert.equal(r3.vencida, true);
  const r4 = await W.enviarPush(sub, 'x', v, { fetch: responde(429) });
  assert.deepEqual([r4.ok, r4.vencida, r4.status], [false, false, 429]);
  const r5 = await W.enviarPush(sub, 'x', v, { fetch: async () => { throw new Error('sin red'); } });
  assert.deepEqual([r5.ok, r5.vencida, r5.status], [false, false, 0]);
});

test('la clave VAPID pública es la misma en js/push.js y sw.js, y es un punto P-256 válido', async () => {
  const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const k1 = /VAPID_PUBLICA = '([\w-]+)'/.exec(leer('js/push.js'))[1];
  const k2 = /VAPID_PUBLICA = '([\w-]+)'/.exec(leer('sw.js'))[1];
  assert.equal(k1, k2);
  const raw = Buffer.from(k1, 'base64url');
  assert.equal(raw.length, 65);
  assert.equal(raw[0], 4);
  await crypto.webcrypto.subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
});

/* ---------------- horas de Monterrey ---------------- */

test('ahoraLocal: convierte a America/Monterrey (UTC−6, sin horario de verano)', () => {
  const a = L.ahoraLocal(new Date('2026-10-08T15:00:00Z'));
  assert.equal(a.fecha, '2026-10-08');
  assert.equal(a.min, 9 * 60);
  const b = L.ahoraLocal(new Date('2026-10-09T05:30:00Z'));
  assert.equal(b.fecha, '2026-10-08', 'a las 23:30 locales sigue siendo el día 8');
  assert.equal(b.min, 23 * 60 + 30);
  const c = L.ahoraLocal(new Date('2026-07-01T06:00:00Z'));
  assert.equal(c.fecha, '2026-07-01');
  assert.equal(c.min, 0, 'en verano también es UTC−6');
});

test('fechaMas cruza meses y años', () => {
  assert.equal(L.fechaMas('2026-10-31', 1), '2026-11-01');
  assert.equal(L.fechaMas('2026-12-31', 1), '2027-01-01');
  assert.equal(L.fechaMas('2028-02-28', 1), '2028-02-29');
  assert.equal(L.fechaMas('2026-03-01', -1), '2026-02-28');
});

test('citasEnVentana: solo agendadas que empiezan en 25–35 min', () => {
  const ahora = L.ahoraLocal(new Date('2026-10-08T16:00:00Z')); // 10:00 en Monterrey
  const c = (id, hora, estado = 'agendada', fecha = '2026-10-08') => ({ id, fecha, hora, estado });
  const r = L.citasEnVentana([
    c('a', '10:24'), c('b', '10:25'), c('c', '10:30'), c('d', '10:35'), c('e', '10:36'),
    c('f', '10:30', 'cancelada'), c('g', '10:30', 'atendida'), c('h', ''), c('i', 'xx:yy'),
    c('j', '10:30', 'agendada', '2026-10-09'), c('k', '9:30'),
  ], ahora);
  assert.deepEqual(r.map((x) => [x.id, x.faltan]), [['b', 25], ['c', 30], ['d', 35]]);
});

test('citasEnVentana: cruza la medianoche', () => {
  const ahora = L.ahoraLocal(new Date('2026-10-09T05:50:00Z')); // 23:50 del día 8
  const r = L.citasEnVentana([
    { id: 'x', fecha: '2026-10-09', hora: '00:20', estado: 'agendada' },
    { id: 'y', fecha: '2026-10-08', hora: '00:20', estado: 'agendada' },
  ], ahora);
  assert.deepEqual(r.map((x) => [x.id, x.faltan]), [['x', 30]]);
});

test('horaAMin y fmtHora', () => {
  assert.equal(L.horaAMin('09:05'), 545);
  assert.equal(L.horaAMin('9:05'), 545);
  assert.equal(L.horaAMin('24:00'), null);
  assert.equal(L.horaAMin(null), null);
  assert.equal(L.fmtHora('10:30'), '10:30 AM');
  assert.equal(L.fmtHora('12:00'), '12:00 PM');
  assert.equal(L.fmtHora('00:15'), '12:15 AM');
  assert.equal(L.fmtHora('16:00'), '4:00 PM');
});

/* ---------------- textos ---------------- */

test('nombreCorto: nombre e inicial del apellido', () => {
  assert.equal(L.nombreCorto('Daniela Cantú Garza'), 'Daniela C.');
  assert.equal(L.nombreCorto('Ana de la Garza'), 'Ana G.');
  assert.equal(L.nombreCorto('  maría   lópez '), 'maría L.');
  assert.equal(L.nombreCorto('Sofía'), 'Sofía');
  assert.equal(L.nombreCorto(''), 'Clienta');
  assert.equal(L.nombreCorto(null), 'Clienta');
});

test('serviciosTexto: uno, varios cortos y varios largos', () => {
  assert.equal(L.serviciosTexto([{ n: 'Extensiones soft gel' }]), 'Extensiones soft gel');
  assert.equal(L.serviciosTexto([{ n: 'Retiro de gel' }, { n: 'Gel express' }]), 'Retiro de gel + Gel express');
  assert.equal(L.serviciosTexto([{ n: 'Gel semipermanente + manicura rusa' }, { n: 'Hidrafacial' }, { n: 'Diseño' }]), 'Gel semipermanente + manicura rusa +2');
  assert.equal(L.serviciosTexto(null), '');
});

test('recordatorio: "10:30 AM · Daniela C. · Extensiones soft gel"', () => {
  const m = L.msgRecordatorio({ id: 'c1', fecha: '2026-10-08', hora: '10:30', faltan: 30, items: [{ n: 'Extensiones soft gel', p: 650 }] }, 'Daniela Cantú');
  assert.equal(m.title, 'Cita en 30 min');
  assert.equal(m.body, '10:30 AM · Daniela C. · Extensiones soft gel');
  assert.equal(m.tag, 'cita-c1');
  assert.equal(L.refRecordatorio({ id: 'c1', fecha: '2026-10-08', hora: '10:30' }), 'c1@2026-10-08T10:30');
});

test('resumen: citas, total esperado con descuento y primera hora', () => {
  const citas = [
    { hora: '12:00', estado: 'agendada', precio: 730 },
    { hora: '09:00', estado: 'agendada', precio: 430 },
    { hora: '16:00', estado: 'agendada', precio: 900, descuento_monto: 100 },
    { hora: '17:30', estado: 'atendida', precio: 560 },
    { hora: '18:00', estado: 'agendada', precio: 440 },
    { hora: '19:00', estado: 'cancelada', precio: 999 },
  ];
  const m = L.msgResumen(citas);
  assert.equal(m.body, 'Hoy: 5 citas · $2,960 esperados · primera a las 9:00 AM');
  assert.equal(L.msgResumen([]).body, 'Hoy no tienes citas');
  assert.equal(L.msgResumen([{ estado: 'cancelada', precio: 1 }]).body, 'Hoy no tienes citas');
  assert.equal(L.msgResumen([{ hora: '10:00', estado: 'agendada', precio: 430 }]).body, 'Hoy: 1 cita · $430 esperados · primera a las 10:00 AM');
});

test('fmtDinero', () => {
  assert.equal(L.fmtDinero(2960), '$2,960');
  assert.equal(L.fmtDinero(1234567.4), '$1,234,567');
  assert.equal(L.fmtDinero(0), '$0');
  assert.equal(L.fmtDinero('abc'), '$0');
});

test('confirmar: lista ordenada, máximo 3 y "y N más"; nada si todo está confirmado', () => {
  const nombres = new Map([['a', 'Ana Torres'], ['b', 'Lucía Méndez'], ['c', 'Valeria Ruiz'], ['d', 'Sofía Garza'], ['e', 'Camila']]);
  const citas = [
    { clienta_id: 'd', hora: '16:00', estado: 'agendada' },
    { clienta_id: 'a', hora: '09:00', estado: 'agendada' },
    { clienta_id: 'b', hora: '10:30', estado: 'agendada', confirmada_at: '2026-10-08T20:00:00Z' },
    { clienta_id: 'c', hora: '12:00', estado: 'agendada' },
    { clienta_id: 'e', hora: '18:00', estado: 'agendada' },
    { clienta_id: 'b', hora: '13:00', estado: 'cancelada' },
  ];
  const m = L.msgConfirmar(citas, nombres);
  assert.equal(m.title, 'Confirma las 4 citas de mañana');
  assert.equal(m.body, '9:00 AM Ana T., 12:00 PM Valeria R., 4:00 PM Sofía G. y 1 más');
  assert.equal(m.badge, 4);
  assert.equal(m.url, '/?app&abrir=confirmar');
  assert.equal(L.msgConfirmar([{ clienta_id: 'a', hora: '9:00', estado: 'agendada' }], { a: 'Ana Torres' }).title, 'Confirma la cita de mañana');
  assert.equal(L.msgConfirmar([citas[2]], nombres), null);
});

test('tipoCambio: qué cambios avisan', () => {
  const hoy = '2026-10-08';
  const cita = (o) => ({ id: 'x', fecha: '2026-10-09', hora: '10:30', estado: 'agendada', ...o });
  assert.equal(L.tipoCambio('INSERT', null, cita(), hoy), 'nueva');
  assert.equal(L.tipoCambio('INSERT', null, cita({ fecha: '2026-10-07' }), hoy), null);
  assert.equal(L.tipoCambio('INSERT', null, cita({ estado: 'atendida' }), hoy), null);
  const antes = { fecha: '2026-10-09', hora: '10:30', estado: 'agendada' };
  assert.equal(L.tipoCambio('UPDATE', antes, cita({ hora: '12:00' }), hoy), 'movida');
  assert.equal(L.tipoCambio('UPDATE', antes, cita({ fecha: '2026-10-10' }), hoy), 'movida');
  assert.equal(L.tipoCambio('UPDATE', antes, cita(), hoy), null, 'sin cambios');
  assert.equal(L.tipoCambio('UPDATE', antes, cita({ estado: 'atendida' }), hoy), null, 'atendida no avisa');
  assert.equal(L.tipoCambio('UPDATE', antes, cita({ estado: 'cancelada' }), hoy), 'cancelada');
  assert.equal(L.tipoCambio('UPDATE', { ...antes, estado: 'cancelada' }, cita(), hoy), 'reactivada');
  assert.equal(L.tipoCambio('UPDATE', { fecha: '2026-10-01', hora: '10:00', estado: 'agendada' }, cita({ fecha: '2026-10-02' }), hoy), null, 'citas pasadas no avisan');
  assert.equal(L.tipoCambio('DELETE', antes, cita(), hoy), null);
});

test('msgCambio: textos de cita nueva, movida y cancelada', () => {
  const hoy = '2026-10-08';
  const cita = { id: 'x', fecha: '2026-10-09', hora: '12:00', estado: 'agendada', items: [{ n: 'Hidrafacial' }] };
  assert.deepEqual(L.msgCambio('nueva', cita, null, 'Regina Salinas', hoy),
    { tag: 'cita-x', url: '/?app', title: 'Cita nueva', body: 'Mañana 12:00 PM · Regina S. · Hidrafacial' });
  assert.equal(L.msgCambio('movida', cita, { fecha: '2026-10-09', hora: '10:30' }, 'Regina Salinas', hoy).body,
    'Regina S.: Mañana 10:30 AM → 12:00 PM');
  assert.equal(L.msgCambio('movida', { ...cita, fecha: '2026-10-15' }, { fecha: '2026-10-09', hora: '10:30' }, 'Regina Salinas', hoy).body,
    'Regina S.: Mañana 10:30 AM → Jue 15 oct 12:00 PM');
  assert.equal(L.msgCambio('cancelada', { ...cita, fecha: hoy, estado: 'cancelada' }, null, 'Regina Salinas', hoy).body,
    'Hoy 12:00 PM · Regina S.');
  assert.equal(L.msgCambio('otro', cita, null, '', hoy), null);
});

/* ---------------- seguridad ---------------- */

test('endpointPermitido: solo servicios push conocidos por https', () => {
  for (const ok of [
    'https://web.push.apple.com/QGuQyavXutnMmd0-1hbP0h8',
    'https://fcm.googleapis.com/fcm/send/abc:def',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
    'https://wns2-by3p.notify.windows.com/w/?token=BQYAAA',
  ]) assert.equal(L.endpointPermitido(ok), true, ok);
  for (const no of [
    'http://web.push.apple.com/x', 'https://web.push.apple.com.evil.com/x', 'https://evil.com/fcm.googleapis.com',
    'https://user:pw@fcm.googleapis.com/x', 'https://169.254.169.254/latest', 'no es url', '',
  ]) assert.equal(L.endpointPermitido(no), false, no);
});

test('CORS: la app en Netlify, sus vistas previas y localhost', () => {
  assert.equal(L.origenPermitido('https://rheud-app.netlify.app'), true);
  assert.equal(L.origenPermitido('https://deploy-preview-7--rheud-app.netlify.app'), true);
  assert.equal(L.origenPermitido('http://localhost:8080'), true);
  assert.equal(L.origenPermitido('http://127.0.0.1'), true);
  assert.equal(L.origenPermitido('https://evil.com'), false);
  assert.equal(L.origenPermitido('http://localhost.evil.com'), false);
  assert.equal(L.origenPermitido('https://rheud-app.netlify.app.evil.com'), false);
  assert.equal(L.origenPermitido(null), false);
  assert.equal(L.cabecerasCors('https://evil.com')['Access-Control-Allow-Origin'], undefined);
  assert.equal(L.cabecerasCors('http://localhost:5173')['Access-Control-Allow-Origin'], 'http://localhost:5173');
});

test('igualesTiempoConstante', async () => {
  assert.equal(await L.igualesTiempoConstante('abc123', 'abc123'), true);
  assert.equal(await L.igualesTiempoConstante('abc123', 'abc124'), false);
  assert.equal(await L.igualesTiempoConstante('abc', 'abc123'), false);
  assert.equal(await L.igualesTiempoConstante('', ''), false);
  assert.equal(await L.igualesTiempoConstante(undefined, 'x'), false);
});

test('preferencias por suscripción', () => {
  assert.equal(L.quiere({ prefs: { recordatorio: false } }, 'recordatorio'), false);
  assert.equal(L.quiere({ prefs: { recordatorio: false } }, 'resumen'), true);
  assert.equal(L.quiere({ prefs: null }, 'cambios'), true);
});

test('las migraciones v7 (20261008_2x) no usan DROP: la herramienta que las aplica se detiene', () => {
  const dir = path.join(RAIZ, 'supabase/migrations');
  const v7 = fs.readdirSync(dir).filter((f) => /^20261008_2\d_.*\.sql$/.test(f));
  assert.ok(v7.length >= 1);
  for (const f of v7) assert.doesNotMatch(fs.readFileSync(path.join(dir, f), 'utf8'), /\bdrop\b/i, f);
});
