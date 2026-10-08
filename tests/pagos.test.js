// Tests del cálculo de pagos: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { resumenPago } = require('../js/pagos.js');

test('sin pagos y marcada como deuda: el saldo descuenta el descuento', () => {
  const r = resumenPago({ precio: 500, descMonto: 100, pagos: [], pago: 'deuda', estado: 'atendida' });
  assert.equal(r.total, 400);
  assert.equal(r.cobrado, 0);
  assert.equal(r.saldo, 400);
  assert.equal(r.estado, 'pendiente');
});

test('pagos parciales con descuento', () => {
  const r = resumenPago({ precio: 500, descMonto: 100, pagos: [{ monto: 150 }, { monto: 50 }], estado: 'atendida' });
  assert.deepEqual([r.total, r.cobrado, r.saldo, r.estado], [400, 200, 200, 'parcial']);
});

test('pagado completo', () => {
  const r = resumenPago({ precio: 430, pagos: [{ monto: 430 }], estado: 'atendida' });
  assert.equal(r.estado, 'pagado');
  assert.equal(r.saldo, 0);
});

test('sobrepago se reporta como extra, no como saldo negativo', () => {
  const r = resumenPago({ precio: 500, pagos: [{ monto: 600 }], estado: 'atendida' });
  assert.equal(r.saldo, 0);
  assert.equal(r.extra, 100);
  assert.equal(r.estado, 'pagado');
});

test('cita vieja "parcial" con abonado: el saldo usa el total neto', () => {
  const r = resumenPago({ precio: 500, descMonto: 100, pagos: [], pago: 'parcial', abonado: 200, estado: 'atendida' });
  assert.equal(r.saldo, 200);
});

test('cita vieja "pagado" sin monto: cobrado = total neto', () => {
  const r = resumenPago({ precio: 500, descMonto: 50, pagos: [], pago: 'pagado', estado: 'atendida' });
  assert.equal(r.cobrado, 450);
  assert.equal(r.estado, 'pagado');
});

test('cita vieja con cobrado explícito', () => {
  const r = resumenPago({ precio: 500, pagos: [], pago: 'pagado', cobrado: 450, estado: 'atendida' });
  assert.equal(r.cobrado, 450);
});

test('cita agendada sin pagos: nada cobrado, todavía no es adeudo', () => {
  const r = resumenPago({ precio: 650, pagos: [], pago: '', estado: 'agendada' });
  assert.equal(r.cobrado, 0);
  assert.equal(r.estado, 'por_cobrar');
});

test('anticipo en cita agendada cuenta como cobrado', () => {
  const r = resumenPago({ precio: 650, pagos: [{ monto: 200 }], estado: 'agendada' });
  assert.deepEqual([r.cobrado, r.saldo, r.estado], [200, 450, 'parcial']);
});

test('descuento mayor que el precio no deja total negativo', () => {
  const r = resumenPago({ precio: 300, descMonto: 500, pagos: [], pago: 'deuda', estado: 'atendida' });
  assert.equal(r.total, 0);
  assert.equal(r.saldo, 0);
});

test('fila del portal (pagos_total / pagos_n / descuento_monto)', () => {
  const r = resumenPago({ precio: 1330, descuento_monto: 100, pagos_total: 500, pagos_n: 1, estado: 'atendida' });
  assert.deepEqual([r.total, r.cobrado, r.saldo], [1230, 500, 730]);
});

test('montos como texto o vacíos no rompen el cálculo', () => {
  const r = resumenPago({ precio: '450', descMonto: '', pagos: [{ monto: '200' }, { monto: null }], estado: 'atendida' });
  assert.deepEqual([r.total, r.cobrado, r.saldo], [450, 200, 250]);
});
