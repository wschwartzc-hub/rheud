// Revisa que la app no tenga manejadores en línea (la CSP los bloquea) y que
// cada data-on-* se pueda despachar con js/app/00-eventos.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const dirApp = path.join(raiz, 'js', 'app');
const archivos = [path.join(raiz, 'index.html'), ...fs.readdirSync(dirApp)
  .filter((f) => f.endsWith('.js') && f !== '00-eventos.js')
  .map((f) => path.join(dirApp, f))];
const leer = (f) => fs.readFileSync(f, 'utf8');

// Carga el intérprete real del despachador en un contexto aislado.
function cargarCompilador() {
  const src = leer(path.join(dirApp, '00-eventos.js'))
    .replace('for (const [tipo, evento] of Object.entries(TIPOS))', 'window.__compilar = compilar;\n  for (const [tipo, evento] of Object.entries(TIPOS))');
  const ctx = { document: { addEventListener() {} }, window: {}, Element: class {}, console, Map };
  vm.runInNewContext(src, ctx);
  return ctx.window.__compilar;
}

test('no quedan manejadores de eventos en línea', () => {
  const malos = [];
  for (const f of archivos) {
    const m = leer(f).match(/(?<![\w.-])on(click|input|change|blur|load|error|submit|keydown|keyup|focus)\s*=\s*["']/g);
    if (m) malos.push(`${path.basename(f)}: ${m.length}`);
  }
  assert.deepEqual(malos, []);
});

test('no hay <script> en línea en index.html', () => {
  assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/.test(leer(path.join(raiz, 'index.html'))), false);
});

test('cada data-on-* se puede interpretar y su función existe', () => {
  const compilar = cargarCompilador();
  const globales = new Set();
  for (const f of fs.readdirSync(path.join(raiz, 'js'), { recursive: true })) {
    if (!String(f).endsWith('.js')) continue;
    for (const m of leer(path.join(raiz, 'js', String(f))).matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) globales.add(m[1]);
  }
  const problemas = [];
  let n = 0;
  for (const f of archivos) {
    for (const m of leer(f).matchAll(/data-on-(click|input|change|blur)="((?:[^"$]|\$\{(?:[^{}]|\{[^{}]*\})*\})*)"/g)) {
      n++;
      const expr = m[2].replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '0');
      try {
        for (const ins of compilar(expr)) if (ins.fn && !globales.has(ins.fn)) problemas.push(`${path.basename(f)}: falta ${ins.fn}()`);
      } catch (e) {
        problemas.push(`${path.basename(f)}: ${m[2]} → ${e.message}`);
      }
    }
  }
  assert.ok(n > 0, 'no se encontraron data-on-*');
  assert.deepEqual(problemas, []);
});
