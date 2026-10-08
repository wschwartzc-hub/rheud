/* Rhēud · cálculo de pagos de una cita.
   Una sola fórmula para la app y el portal. Funciona como script clásico
   (expone window.RheudPagos) y como módulo de Node para los tests. */
(function (root) {
  'use strict';

  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

  /* Acepta la cita de la app ({precio, descMonto, pagos, pago, abonado,
     cobrado, estado}) o la fila del portal ({precio, descuento_monto,
     pagos_total, pagos_n, …}).
     total  = precio − descuento (nunca negativo)
     cobrado = suma de pagos; si no hay pagos, se usan los campos anteriores
     saldo  = lo que falta por cobrar; extra = lo cobrado de más (propina) */
  function resumenPago(c) {
    c = c || {};
    const base = Math.max(0, num(c.precio));
    const desc = Math.min(base, Math.max(0, num(c.descMonto != null ? c.descMonto : c.descuento_monto)));
    const total = base - desc;
    const lista = Array.isArray(c.pagos) ? c.pagos : null;
    const nPagos = lista ? lista.length : num(c.pagos_n);
    const sumaPagos = lista ? lista.reduce((s, p) => s + num(p && p.monto), 0) : num(c.pagos_total);
    const atendida = c.estado === 'atendida';

    let cobrado;
    if (nPagos > 0) cobrado = sumaPagos;
    else if (c.pago === 'parcial') cobrado = num(c.abonado);
    else if (c.pago === 'deuda') cobrado = 0;
    else if (atendida && (c.pago === 'pagado' || !c.pago)) {
      // Citas anteriores a la lista de pagos: "pagado" sin monto = total neto.
      cobrado = (c.cobrado != null && c.cobrado !== '' && isFinite(Number(c.cobrado))) ? num(c.cobrado) : total;
    } else cobrado = 0;

    cobrado = Math.max(0, cobrado);
    const saldo = Math.max(0, total - cobrado);
    const extra = Math.max(0, cobrado - total);
    let estado;
    if (total <= 0 && cobrado <= 0) estado = atendida ? 'pagado' : 'sin_cobro';
    else if (saldo <= 0) estado = 'pagado';
    else if (cobrado > 0) estado = 'parcial';
    else estado = atendida ? 'pendiente' : 'por_cobrar';

    return { base, descuento: desc, total, cobrado, saldo, extra, estado };
  }

  /* Valor de la columna "pago" de una cita atendida: pagado / parcial / deuda. */
  function campoPago(c) {
    const e = resumenPago(c).estado;
    return e === 'pagado' ? 'pagado' : (e === 'parcial' ? 'parcial' : 'deuda');
  }

  /* Pagos para liquidar el saldo: conserva los que ya hay y agrega uno por lo
     que falta. En citas viejas sin lista, lo ya cobrado pasa primero a la lista
     para no perder el abono. */
  function pagosConSaldo(c, metodo, fecha) {
    const r = resumenPago(c);
    const lista = Array.isArray(c.pagos) ? c.pagos.slice() : [];
    if (!lista.length && r.cobrado > 0) lista.push({ monto: r.cobrado, metodo: c.metodo || 'efectivo', fecha: c.pagadoFecha || c.fecha || fecha });
    if (r.saldo > 0) lista.push({ monto: r.saldo, metodo: metodo || 'efectivo', fecha });
    return lista;
  }

  const api = { resumenPago, campoPago, pagosConSaldo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RheudPagos = api;
})(typeof window !== 'undefined' ? window : globalThis);
