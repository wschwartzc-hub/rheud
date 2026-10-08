/* Rhēud · verificación en dos pasos (TOTP) opcional. Script clásico que usa
   las globales de la app (sb, showSheet, closeSheet, toast). Expone
   window.RheudMFA:
     - abrir(): hoja para activar/desactivar.
     - estado(): Promise<'activada' | 'desactivada' | 'desconocido'>.
     - verificarAntesDeEntrar(): Promise que se resuelve cuando la sesión ya
       tiene el nivel que necesita (pide el código si hace falta).
   Con la verificación activa, el expediente de piel exige sesión aal2
   (supabase/migrations/20261008_21_mfa.sql). */
(function () {
  'use strict';

  const svg = (d) => `<svg class="aj-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
  const ICONOS = {
    escudo: '<path d="M12 3 5 6v5.5c0 4.4 3 8.2 7 9.5 4-1.3 7-5.1 7-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    llave: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
  };

  function cliente() {
    try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; }
  }
  function avisar(m) { if (typeof window.toast === 'function') window.toast(m); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function mensaje(e) {
    const m = String((e && (e.message || e.code)) || '');
    if (/invalid|mfa_verification_failed|totp/i.test(m)) return 'El código no es correcto o ya cambió. Escribe el que aparece ahora.';
    if (/rate|too many|limit/i.test(m)) return 'Demasiados intentos. Espera un minuto.';
    if (/network|fetch/i.test(m)) return 'Sin conexión. Intenta de nuevo.';
    if (/aal2/i.test(m)) return 'Primero confirma con un código de tu app.';
    return 'No se pudo completar. Intenta de nuevo.';
  }

  /* Un código equivocado es parte del uso normal: no se registra como error. */
  function registrar(e) {
    if (!/invalid|mfa_verification_failed/i.test(String((e && (e.message || e.code)) || ''))) console.warn('MFA:', e);
  }

  async function factores() {
    const { data, error } = await cliente().auth.mfa.listFactors();
    if (error) throw error;
    const todos = ((data && data.all) || []).filter((f) => f.factor_type === 'totp');
    return {
      verificados: todos.filter((f) => f.status === 'verified'),
      pendientes: todos.filter((f) => f.status !== 'verified'),
    };
  }

  async function estado() {
    if (!cliente()) return 'desconocido';
    try { return (await factores()).verificados.length ? 'activada' : 'desactivada'; } catch (_) { return 'desconocido'; }
  }

  /* Supabase devuelve 'data:image/svg+xml;utf-8,<svg…>' sin codificar; un "#"
     dentro del SVG cortaría la URL, así que se vuelve a codificar. */
  function qrSrc(qr) {
    const s = String(qr || '');
    const i = s.indexOf('<svg');
    if (i >= 0) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.slice(i));
    return /^data:image\//.test(s) ? s : '';
  }

  /* ---------------- hoja #mfaSheet ---------------- */

  let hoja = null;
  let enrolando = null; // {id, qr, secreto, uri}
  let vista = 'cargando';

  function crearHoja() {
    if (hoja) return hoja;
    hoja = document.createElement('div');
    hoja.className = 'sheet mfa-sheet';
    hoja.id = 'mfaSheet';
    hoja.setAttribute('role', 'dialog');
    hoja.setAttribute('aria-modal', 'true');
    hoja.setAttribute('aria-labelledby', 'mfaTitulo');
    hoja.innerHTML = '<div class="grab"></div><h3 id="mfaTitulo">Verificación en dos pasos</h3>' +
      '<div class="mfa-cuerpo" id="mfaCuerpo" aria-live="polite"></div>';
    const toastEl = document.getElementById('toast');
    if (toastEl && toastEl.parentNode === document.body) document.body.insertBefore(hoja, toastEl);
    else document.body.appendChild(hoja);
    hoja.addEventListener('click', alClic);
    hoja.addEventListener('input', alEscribir);
    return hoja;
  }

  function campoCodigo(id) {
    return `<div class="field"><label for="${id}">Código de 6 dígitos</label>` +
      `<input id="${id}" class="mfa-codigo" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" placeholder="000000"></div>` +
      '<div class="mfa-err" role="alert"></div>';
  }

  async function pintar(v) {
    if (!hoja) return;
    const c = hoja.querySelector('#mfaCuerpo');
    if (v) vista = v;
    if (vista === 'cargando') {
      c.innerHTML = '<p class="ntf-nota">Revisando…</p>';
      let f;
      try { f = await factores(); } catch (e) {
        c.innerHTML = `<p>${esc(mensaje(e))}</p><button type="button" class="btn btn-line" data-mfa="cerrar">Cerrar</button>`;
        return;
      }
      return pintar(f.verificados.length ? 'activa' : 'inactiva');
    }
    if (vista === 'inactiva') {
      c.innerHTML = `<p>Además de tu contraseña, Rhēud te pedirá un código de 6 dígitos al iniciar sesión en un dispositivo nuevo. Así, aunque alguien sepa tu contraseña, no puede ver los expedientes de piel.</p>
        <p class="ntf-nota">Necesitas una app de códigos: <b>Contraseñas</b> de iPhone, Google Authenticator o Microsoft Authenticator.</p>
        <div class="mfa-err" role="alert"></div>
        <button type="button" class="btn btn-primary" data-mfa="empezar">Activar verificación en dos pasos</button>
        <button type="button" class="btn btn-line" data-mfa="cerrar">Cerrar</button>`;
      return;
    }
    if (vista === 'enrolar' && enrolando) {
      const clave = enrolando.secreto.replace(/(.{4})/g, '$1 ').trim();
      c.innerHTML = `<p><b>1.</b> En tu app de códigos, escanea este QR:</p>
        <div class="mfa-qr"><img alt="Código QR para la app de autenticación" id="mfaQr"></div>
        <p class="ntf-nota">¿Estás en este mismo teléfono? Agrega la clave directo o cópiala:</p>
        <div class="mfa-clave" id="mfaClave">${esc(clave)}</div>
        <div class="mfa-acciones">
          <a class="btn btn-line" id="mfaUri">Agregar a mi app</a>
          <button type="button" class="btn btn-line" data-mfa="copiar">Copiar clave</button>
        </div>
        <p><b>2.</b> Escribe el código que te muestra la app:</p>
        ${campoCodigo('mfaCodigoAlta')}
        <button type="button" class="btn btn-primary" data-mfa="confirmar">Verificar y activar</button>
        <button type="button" class="btn btn-ghost" data-mfa="cancelar">Cancelar</button>`;
      c.querySelector('#mfaQr').src = qrSrc(enrolando.qr);
      const a = c.querySelector('#mfaUri');
      if (/^otpauth:\/\//.test(enrolando.uri || '')) a.href = enrolando.uri;
      else a.remove();
      return;
    }
    if (vista === 'activa' || vista === 'quitar') {
      let f = { verificados: [] };
      try { f = await factores(); } catch (_) { /* se muestra sin lista */ }
      const lista = f.verificados.map((x) => `<div class="mfa-fac">${svg(ICONOS.llave)}<span><b>${esc(x.friendly_name || 'App de códigos')}</b>` +
        `<small>Activa desde ${esc(new Date(x.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }))}</small></span></div>`).join('');
      c.innerHTML = `<div class="ntf-estado ok">${svg(ICONOS.escudo)}<span>Activada<small>Te pediremos el código al iniciar sesión.</small></span></div>
        ${lista}
        ${vista === 'quitar'
          ? `<p class="mfa-sep">Para desactivarla, escribe un código de tu app:</p>${campoCodigo('mfaCodigoBaja')}
             <button type="button" class="btn btn-primary" data-mfa="quitar-ok">Desactivar</button>
             <button type="button" class="btn btn-ghost" data-mfa="activa">Cancelar</button>`
          : `<p class="ntf-nota mfa-sep">Si cambias de teléfono, desactívala antes o pide que la quiten desde Supabase (Authentication → Users).</p>
             <button type="button" class="btn btn-line" data-mfa="cerrar">Cerrar</button>
             <button type="button" class="btn btn-ghost aj-peligro" data-mfa="quitar">Desactivar</button>`}`;
    }
  }

  function codigoDe(id) {
    const i = hoja.querySelector('#' + id);
    return i ? i.value.replace(/\D/g, '') : '';
  }
  function error(m) {
    const e = hoja.querySelector('.mfa-err');
    if (e) e.textContent = m || '';
  }

  async function empezar() {
    const c = cliente();
    const f = await factores();
    if (f.verificados.length) return pintar('activa');
    // Un alta a medias deja un factor sin verificar con el mismo nombre.
    for (const p of f.pendientes) { try { await c.auth.mfa.unenroll({ factorId: p.id }); } catch (_) { /* sigue */ } }
    const { data, error: e } = await c.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Rhēud', issuer: 'Rhēud Beauty' });
    if (e) throw e;
    enrolando = { id: data.id, qr: data.totp.qr_code, secreto: data.totp.secret, uri: data.totp.uri };
    await pintar('enrolar');
    const i = hoja.querySelector('#mfaCodigoAlta');
    if (i && !esTactil()) i.focus();
  }

  function esTactil() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }

  async function confirmarAlta() {
    const code = codigoDe('mfaCodigoAlta');
    if (code.length !== 6) { error('Escribe los 6 dígitos.'); return; }
    const { error: e } = await cliente().auth.mfa.challengeAndVerify({ factorId: enrolando.id, code });
    if (e) throw e;
    enrolando = null;
    avisar('Verificación en dos pasos activada');
    await pintar('activa');
    reflejarEstado('activada');
  }

  async function cancelarAlta() {
    if (enrolando) { try { await cliente().auth.mfa.unenroll({ factorId: enrolando.id }); } catch (_) { /* queda pendiente; se limpia al reintentar */ } }
    enrolando = null;
    await pintar('inactiva');
  }

  async function confirmarBaja() {
    const code = codigoDe('mfaCodigoBaja');
    if (code.length !== 6) { error('Escribe los 6 dígitos.'); return; }
    const c = cliente();
    const f = await factores();
    if (!f.verificados.length) return pintar('inactiva');
    // Pedir un código nuevo evita que alguien con el teléfono desbloqueado la quite.
    const v = await c.auth.mfa.challengeAndVerify({ factorId: f.verificados[0].id, code });
    if (v.error) throw v.error;
    for (const x of f.verificados) {
      const { error: e } = await c.auth.mfa.unenroll({ factorId: x.id });
      if (e) throw e;
    }
    avisar('Verificación en dos pasos desactivada');
    await pintar('inactiva');
    reflejarEstado('desactivada');
  }

  function ocupado(b, txt, fn) {
    const antes = b.textContent;
    b.disabled = true;
    if (txt) b.textContent = txt;
    error('');
    return Promise.resolve().then(fn)
      .catch((e) => { registrar(e); error(mensaje(e)); })
      .then(() => { if (b.isConnected) { b.disabled = false; b.textContent = antes; } });
  }

  function alClic(e) {
    const b = e.target.closest('[data-mfa]');
    if (!b || b.disabled) return;
    const acc = b.dataset.mfa;
    if (acc === 'cerrar') { if (typeof window.closeSheet === 'function') window.closeSheet(); else hoja.classList.remove('show'); return; }
    if (acc === 'empezar') { ocupado(b, 'Preparando…', empezar); return; }
    if (acc === 'confirmar') { ocupado(b, 'Verificando…', confirmarAlta); return; }
    if (acc === 'cancelar') { ocupado(b, '', cancelarAlta); return; }
    if (acc === 'quitar') { pintar('quitar'); return; }
    if (acc === 'activa') { pintar('activa'); return; }
    if (acc === 'quitar-ok') { ocupado(b, 'Verificando…', confirmarBaja); return; }
    if (acc === 'copiar' && enrolando) {
      const t = enrolando.secreto;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => avisar('Clave copiada'), () => avisar('Mantén presionada la clave para copiarla'));
      else avisar('Mantén presionada la clave para copiarla');
    }
  }

  function alEscribir(e) {
    const i = e.target;
    if (!i.classList || !i.classList.contains('mfa-codigo')) return;
    i.value = i.value.replace(/\D/g, '').slice(0, 6);
    error('');
  }

  async function abrir() {
    if (!cliente()) return;
    crearHoja();
    if (vista !== 'enrolar') vista = 'cargando';
    const p = pintar();
    if (typeof window.showSheet === 'function') window.showSheet('mfaSheet');
    else hoja.classList.add('show');
    await p;
  }

  /* ---------------- código al entrar ---------------- */

  function pedirCodigoDeEntrada() {
    return new Promise((resolve) => {
      const g = document.createElement('div');
      g.id = 'mfaGate';
      g.className = 'mfa-gate';
      g.setAttribute('role', 'dialog');
      g.setAttribute('aria-modal', 'true');
      g.setAttribute('aria-labelledby', 'mfaGateTitulo');
      g.innerHTML = `<div class="mfa-card">
          <img class="mfa-logo" src="assets/logo.png" alt="Rhēud Beauty">
          <span class="ntf-ic">${svg(ICONOS.escudo)}</span>
          <h2 id="mfaGateTitulo">Verificación en dos pasos</h2>
          <p>Escribe el código de 6 dígitos que aparece en tu app de códigos.</p>
          ${campoCodigo('mfaGateCodigo')}
          <button type="button" class="btn btn-primary" id="mfaGateOk">Verificar</button>
          <button type="button" class="btn btn-ghost" id="mfaGateSalir">Cerrar sesión</button>
        </div>`;
      document.body.appendChild(g);
      const inp = g.querySelector('#mfaGateCodigo');
      const ok = g.querySelector('#mfaGateOk');
      const err = g.querySelector('.mfa-err');
      let enCurso = false;
      const intentar = async () => {
        if (enCurso) return;
        const code = inp.value.replace(/\D/g, '');
        if (code.length !== 6) { err.textContent = 'Escribe los 6 dígitos.'; return; }
        enCurso = true;
        ok.disabled = true;
        ok.textContent = 'Verificando…';
        err.textContent = '';
        try {
          const f = await factores();
          if (f.verificados.length) {
            const { error: e } = await cliente().auth.mfa.challengeAndVerify({ factorId: f.verificados[0].id, code });
            if (e) throw e;
          }
          g.remove();
          resolve();
        } catch (e) {
          registrar(e);
          err.textContent = mensaje(e);
          inp.value = '';
          inp.focus();
        } finally {
          enCurso = false;
          ok.disabled = false;
          ok.textContent = 'Verificar';
        }
      };
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '').slice(0, 6);
        if (inp.value.length === 6) intentar();
      });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') intentar(); });
      ok.addEventListener('click', intentar);
      g.querySelector('#mfaGateSalir').addEventListener('click', async () => {
        try { await cliente().auth.signOut(); } catch (_) { /* recarga igual */ }
        location.reload();
      });
      setTimeout(() => inp.focus(), 60);
    });
  }

  async function verificarAntesDeEntrar() {
    const c = cliente();
    if (!c || !c.auth || !c.auth.mfa) return;
    let nivel = null;
    try {
      const { data, error: e } = await c.auth.mfa.getAuthenticatorAssuranceLevel();
      if (e) return;
      nivel = data;
    } catch (_) { return; }
    if (!nivel || nivel.nextLevel !== 'aal2' || nivel.currentLevel === 'aal2') return;
    await pedirCodigoDeEntrada();
  }

  /* ---------------- fila en "Más" ---------------- */

  function reflejarEstado(est) {
    const s = document.getElementById('ajMfaEstado');
    if (s) s.textContent = est === 'activada' ? 'Activada' : est === 'desactivada' ? 'Desactivada' : '';
  }

  function inyectarFila() {
    const cont = document.getElementById('masAjustes');
    if (!cont || document.getElementById('ajMfa')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'aj-fila';
    b.id = 'ajMfa';
    b.innerHTML = `<span class="aj-ic">${svg(ICONOS.escudo)}</span><span class="aj-tx"><b>Verificación en dos pasos</b><small id="ajMfaEstado"></small></span><span class="aj-chev">${svg(ICONOS.chevron)}</span>`;
    b.addEventListener('click', () => { abrir(); });
    cont.appendChild(b);
    estado().then(reflejarEstado);
  }

  window.RheudMFA = { abrir, estado, verificarAntesDeEntrar };
  if (typeof window.abrirSeguridad !== 'function') window.abrirSeguridad = function () { return window.RheudMFA.abrir(); };

  new MutationObserver(() => {
    if (!document.getElementById('ajMfa') && document.getElementById('masAjustes')) inyectarFila();
  }).observe(document.body, { childList: true, subtree: true });
  inyectarFila();
})();
