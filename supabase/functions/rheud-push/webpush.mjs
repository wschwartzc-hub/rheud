/* Rhēud · Web Push sin dependencias.
   Cifrado del mensaje (RFC 8291 sobre RFC 8188, "aes128gcm") y autenticación
   VAPID (RFC 8292) con WebCrypto. El mismo archivo corre en Deno (Supabase
   Edge Runtime) y en Node ≥ 20 (tests/push.test.js). */

const te = new TextEncoder();
const subtle = globalThis.crypto.subtle;

/* Tamaño máximo del texto en claro: los servicios push aceptan 4096 bytes de
   cuerpo y la cabecera aes128gcm ocupa 86 (más 17 de delimitador y etiqueta). */
export const MAX_CONTENIDO = 3990;

export function b64urlABytes(s) {
  const t = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const relleno = t.length % 4 ? '='.repeat(4 - (t.length % 4)) : '';
  const bin = atob(t + relleno);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesAB64url(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unir(...partes) {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { out.set(p, i); i += p.length; }
  return out;
}

function aBytes(v) {
  return typeof v === 'string' ? b64urlABytes(v) : new Uint8Array(v);
}

/* HKDF-SHA-256 completo (extract + expand) de WebCrypto. */
async function hkdf(sal, ikm, info, largo) {
  const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal, info }, k, largo * 8));
}

/* Clave P-256 en JWK a partir del punto público sin comprimir (65 bytes) y,
   si se da, el escalar privado d. */
export function jwkP256(publicaRaw, privadaD) {
  const pub = aBytes(publicaRaw);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('Clave pública P-256 inválida');
  const jwk = { kty: 'EC', crv: 'P-256', x: bytesAB64url(pub.slice(1, 33)), y: bytesAB64url(pub.slice(33, 65)), ext: true };
  if (privadaD != null) jwk.d = typeof privadaD === 'string' ? privadaD.replace(/=+$/, '') : bytesAB64url(privadaD);
  return jwk;
}

/**
 * Cifra `contenido` para la suscripción (p256dh, auth) del navegador.
 * Devuelve el cuerpo completo: sal(16) | rs(4) | idlen(1) | clave del
 * servidor(65) | registro cifrado. `fijo` solo se usa en los tests para
 * reproducir el vector del RFC 8291 (clave efímera y sal conocidas).
 */
export async function cifrar(contenido, p256dh, authSecret, fijo = {}) {
  const uaPublica = aBytes(p256dh);
  const auth = aBytes(authSecret);
  if (uaPublica.length !== 65 || uaPublica[0] !== 4) throw new Error('p256dh inválida');
  if (auth.length < 16) throw new Error('auth inválido');
  const texto = typeof contenido === 'string' ? te.encode(contenido) : new Uint8Array(contenido);
  if (texto.length > MAX_CONTENIDO) throw new Error('Mensaje demasiado largo');

  let asPrivada, asPublica;
  if (fijo.asPublica && fijo.asPrivada) {
    asPublica = aBytes(fijo.asPublica);
    asPrivada = await subtle.importKey('jwk', jwkP256(asPublica, fijo.asPrivada), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  } else {
    const par = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    asPrivada = par.privateKey;
    asPublica = new Uint8Array(await subtle.exportKey('raw', par.publicKey));
  }
  const uaClave = await subtle.importKey('raw', uaPublica, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaClave }, asPrivada, 256));

  // RFC 8291 §3.4: IKM = HKDF(auth, ecdh, "WebPush: info" 0x00 ua_public as_public, 32)
  const ikm = await hkdf(auth, ecdh, unir(te.encode('WebPush: info\0'), uaPublica, asPublica), 32);
  const sal = fijo.sal ? aBytes(fijo.sal) : globalThis.crypto.getRandomValues(new Uint8Array(16));
  // RFC 8188 §2.2 y §2.3
  const cek = await hkdf(sal, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  // Un solo registro: contenido + delimitador 0x02 (último registro), sin relleno.
  const llave = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, llave, unir(texto, new Uint8Array([2]))));

  const cabecera = new Uint8Array(16 + 4 + 1 + asPublica.length);
  cabecera.set(sal, 0);
  new DataView(cabecera.buffer).setUint32(16, 4096);
  cabecera[20] = asPublica.length;
  cabecera.set(asPublica, 21);
  return unir(cabecera, cifrado);
}

const clavesFirma = new Map();
async function claveFirma(vapid) {
  const k = vapid.publicKey + '|' + vapid.privateKey;
  if (!clavesFirma.has(k)) {
    clavesFirma.set(k, subtle.importKey('jwk', jwkP256(vapid.publicKey, vapid.privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']));
  }
  return clavesFirma.get(k);
}

/**
 * Cabecera Authorization de VAPID (RFC 8292 §3): JWT ES256 con aud = origen
 * del servicio push, exp ≤ 24 h y sub = contacto (mailto: o https:).
 */
export async function autorizacionVapid(endpoint, vapid, ahoraSeg = Math.floor(Date.now() / 1000)) {
  const enc = (o) => bytesAB64url(te.encode(JSON.stringify(o)));
  const datos = enc({ typ: 'JWT', alg: 'ES256' }) + '.' +
    enc({ aud: new URL(endpoint).origin, exp: ahoraSeg + 12 * 3600, sub: vapid.subject });
  // WebCrypto entrega la firma ECDSA como r||s (64 bytes), que es lo que pide JWS.
  const firma = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await claveFirma(vapid), te.encode(datos));
  return `vapid t=${datos}.${bytesAB64url(new Uint8Array(firma))}, k=${vapid.publicKey}`;
}

/**
 * Envía un mensaje a una suscripción {endpoint, p256dh, auth}.
 * Devuelve {ok, status, vencida, error}; vencida = el servicio respondió
 * 404/410 y la suscripción debe borrarse.
 */
export async function enviarPush(sub, contenido, vapid, op = {}) {
  const cuerpo = await cifrar(typeof contenido === 'string' ? contenido : JSON.stringify(contenido), sub.p256dh, sub.auth);
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    TTL: String(Math.max(0, Math.floor(op.ttl ?? 3600))),
    Urgency: op.urgencia || 'normal',
    Authorization: await autorizacionVapid(sub.endpoint, vapid),
  };
  if (op.topic) headers.Topic = op.topic;
  const f = op.fetch || globalThis.fetch;
  let res;
  try {
    res = await f(sub.endpoint, { method: 'POST', headers, body: cuerpo, signal: AbortSignal.timeout(10000) });
  } catch (e) {
    return { ok: false, status: 0, vencida: false, error: String((e && e.message) || e) };
  }
  const texto = await res.text().catch(() => '');
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    vencida: res.status === 404 || res.status === 410,
    error: res.ok ? '' : texto.slice(0, 300),
  };
}
