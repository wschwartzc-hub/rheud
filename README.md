# Rhēud Beauty · Estudio

App de gestión para nail estudio profesional privado. Agenda de citas, control de ingresos, fichas de clientas y métricas del negocio — todo en una sola aplicación web instalable en el celular.

> **Manicura rusa · Gel · Extensiones · Diseños**

---

## ✨ Características

- **Agenda dinámica** — vistas por Día, Semana y Mes (estilo Teams), con rejilla por horas, citas en cajitas de colores personalizables y asistente de horarios que sugiere espacios libres y detecta encimes.
- **Citas con seguimiento** — múltiples servicios por cita, estados (agendada / atendida / cancelada), control de pago, método (efectivo, transferencia, tarjeta, cupón, otro) y comprobantes en foto.
- **Ingresos y cobranza** — totales por día/semana/mes/rango, alertas de adeudos vencidos, buckets de antigüedad de la deuda y lista de deudoras.
- **Clientas** — número de cliente automático, contacto (teléfono/email), historial completo, notas y clasificación dinámica por valor/frecuencia y comportamiento de pago.
- **Insights** — resumen inteligente, KPIs, gráfica de ingresos y ranking de servicios más vendidos.
- **Menú de servicios multiservicio** — ramas *Nails Studio* / *Skin Care* / otros, subfamilias, precio, costo real y margen, **duración**, **tiempo de limpieza** y **recurso que ocupa** (mesa de uñas o cabina facial), insumos/máquinas y requisitos para la clienta.
- **Agenda por recursos** — al agendar, cada servicio bloquea su recurso durante su duración + limpieza; el asistente detecta traslapes por separado en mesa y cabina, sugiere huecos válidos y arma la secuencia (uñas → facial) con la duración total. Vista **Carriles** (Mesa · Cabina) en el día.
- **Expediente de piel** — por clienta: tipo de piel, fototipo, sensibilidad, alergias, contraindicaciones, objetivo, rutina en casa, notas de evolución fechadas y **fotos antes / después / seguimiento** (bucket privado, URL firmada). Vive en sus propias tablas, sin acceso desde el portal público. Al agendar un facial, la cita muestra el resumen del expediente y los requisitos del servicio.
- **Finanzas e Insights por rama** — cobrado, servicios y ticket promedio de uñas vs. skin care; **retención** (clientas del periodo anterior que volvieron), **recompra** (atendidas que ya habían venido) y sugerencia de venta cruzada (clientas frecuentes de uñas sin ningún facial).

## 🎨 Diseño (v7 · Opción C «Spa multiservicio»)

Mobile-first, pensado para usarse con una mano en el iPhone:

- **Color:** fondo `#FBF9F7`, paneles `#F2EEEA`, tarjetas blancas con borde `#ECE6E1`. Tinta `#231C1F` / `#3E3540` / `#5F565A` (todo texto ≥ 4.5:1). Vino `#4A1224` solo para la acción principal, la selección activa y la marca. Cada rama tiene su color: uñas (rosa `#F9E8EE` / `#C9708E`) y piel (lila `#EEEAF7` / `#8C7BC0`). Estados: ok, aviso y adeudo con fondo suave y texto oscuro. Champán `#C5A880` solo como detalle.
- **Tipografía:** Manrope 400–800 con números tabulares; campos a 16 px.
- **Estructura:** cabecera con logo, «En línea» y campana; barra inferior *Hoy · Citas · [+] · Clientas · Más*, con el «+» central (Nueva cita). **Hoy** muestra la agenda por carriles (Mesa de uñas · Cabina facial) con limpieza rayada, línea de «ahora» y huecos libres para agendar. **Más** reúne Finanzas, Menú y premios, Datos del estudio y la sesión.
- **Iconos:** solo de línea (`js/app/02-iconos.js`); los emojis quedan únicamente en los mensajes de WhatsApp.
- **Accesibilidad:** etiquetas en todos los campos, hojas como diálogos (foco inicial, foco atrapado, Escape y retorno del foco), estados de pestañas y segmentados con ARIA, foco visible y objetivos táctiles de 44 px.

Los tokens viven en `:root` dentro de `css/app.css`; cambiar la paleta es editar esas variables.

## 🔔 Notificaciones (iPhone y Android)

La app avisa en el celular: **recordatorio 30 min antes** de cada cita, **resumen del día** hacia las 8:00, **citas de mañana sin confirmar** hacia las 18:00 y **cambios** (cita nueva, movida, cancelada o reactivada) hechos por otra persona del estudio. Cada tipo se puede apagar por dispositivo.

En iPhone (iOS 16.4 o más reciente) las notificaciones solo funcionan con la app instalada:

1. Abrir la app en **Safari** → botón Compartir → **Agregar a pantalla de inicio**.
2. Abrir Rhēud **desde el ícono** de la pantalla de inicio e iniciar sesión otra vez (la app instalada no comparte la sesión de Safari).
3. Tocar la **campana** de la cabecera → *Activar notificaciones* → Permitir. Llega un aviso de prueba.

Se activa en cada dispositivo por separado. Si se borra la app de la pantalla de inicio hay que volver a activarla.

## 🚀 Tecnología

- **Frontend:** HTML, CSS y JavaScript sin paso de build. `index.html` (app del estudio) y `portal.html` (portal de la clienta) cargan scripts clásicos desde `js/`; las librerías van copiadas en `vendor/` con su versión en la ruta (sin CDN).
- **Datos:** [Supabase](https://supabase.com) (Postgres con RLS por negocio, Storage privado, Realtime, Auth con verificación en dos pasos opcional, pg_cron, Vault y una Edge Function para Web Push).
- **Hosting:** Netlify, desplegado desde la rama `main`. PWA instalable (`manifest.webmanifest` + `sw.js`).
- **Seguridad del navegador:** CSP estricta en `_headers` (sin scripts en línea; los eventos usan `data-on-*`, ver `js/app/00-eventos.js`).

## 📦 Estructura del repositorio

```
.
├── index.html                 # App del estudio (marcado; sin JS en línea)
├── portal.html                # Portal público de la clienta (enlace de su cita o código)
├── manifest.webmanifest, sw.js  # PWA: instalación, caché del cascarón y notificaciones push
├── _headers                   # Cabeceras de Netlify (CSP, caché)
├── css/app.css, css/ajustes.css
├── js/
│   ├── app/00-…15-*.js        # App por módulos, en orden de carga (eventos, datos, agenda, citas…)
│   ├── nucleo.js              # Funciones puras (fechas, huecos de agenda, insights) — con tests
│   ├── pagos.js               # Cálculo de pagos, saldos y descuentos — con tests
│   ├── push.js                # Suscripción Web Push (campana)
│   ├── seguridad.js           # Verificación en dos pasos (TOTP)
│   └── portal.js              # Portal de la clienta (solo RPC portal_cita / portal_cita_codigo)
├── assets/                    # Logo e íconos
├── vendor/                    # supabase-js, html5-qrcode, qrcodejs
├── supabase/
│   ├── migrations/            # Cambios de base de datos, en orden
│   ├── functions/rheud-push/  # Edge Function de notificaciones (Web Push con WebCrypto)
│   └── esquema.sql            # Foto del esquema de producción (referencia)
└── tests/                     # node --test (núcleo, pagos, push, eventos)
```

## 🛠️ Desarrollo

```bash
npm test                       # pruebas (Node 20+, zona America/Monterrey)
python3 -m http.server 8000    # servir en http://localhost:8000
```

La CI de GitHub (`.github/workflows/ci.yml`) revisa la sintaxis de todos los scripts y corre `npm test` en cada PR.

## 🌐 Despliegue

Netlify publica automáticamente cada commit en `main` (sitio `rheud-app`) y crea una vista previa por PR. Se despliega **la carpeta completa** (no solo `index.html`): la app necesita `js/`, `css/`, `vendor/`, `assets/`, `sw.js`, `manifest.webmanifest` y `_headers`.

Si un cambio necesita una migración, se aplica en Supabase **antes** de publicar la app que la usa (todas son aditivas, así que la versión anterior sigue funcionando). Excepción anotada en la propia migración: `20261008_10_sellos.sql` bloquea los cambios directos de sellos, por eso se aplica justo al publicar la v7.

## ☁️ Supabase

Proyecto `wrplznjgravcnxkzfarn`. Las migraciones de `supabase/migrations` se aplican en orden por nombre; todas se pueden volver a correr.

| Migración | Qué hace |
|---|---|
| `20260905_multiservicio` · `20260905_fotos_piel` | Ramas, duración y recurso de servicios; expediente y fotos de piel (bucket privado) |
| `20261008_01_seguridad_portal` · `_02_cerrar_lectura_anonima` | RLS por negocio con `mis_negocios()`; el portal solo lee vía RPC con token o código |
| `20261008_03_indices` | Índices para la carga paginada |
| `20261008_10_sellos` | Sellos solo por RPC (`sumar_sello`, `ajustar_sellos`, `canjear_premio`) con historial `sellos_log` |
| `20261008_11_baja_clienta` | Consentimiento de salud y `baja_clienta()` (anonimiza; derechos ARCO) |
| `20261008_12_bitacora` | Borrado suave en citas y gastos, bitácora de cambios y reglas de precio/descuento/estado |
| `20261008_20_push` | Suscripciones push, trigger de citas y trabajos de pg_cron |
| `20261008_21_mfa` | Expedientes y fotos de piel piden verificación en dos pasos si la usuaria la activó |

**Notificaciones:** la Edge Function `rheud-push` se despliega con `verify_jwt = false` porque se autentica sola (secreto de Vault para pg_cron y el trigger; JWT de la usuaria para el aviso de prueba). Las claves VAPID y el secreto viven en Vault (`rheud_vapid_public`, `rheud_vapid_private`, `rheud_vapid_subject`, `rheud_push_cron_secret`); los pasos para crearlos están al inicio de `20261008_20_push.sql`. Si se cambia la clave pública, actualizar también `VAPID_PUBLICA` en `js/push.js`.

**Ajustes del panel de Supabase** (no se pueden hacer con SQL): en *Authentication* desactivar el registro de usuarias nuevas y activar la protección de contraseñas filtradas.

## 📄 Licencia

Proyecto privado. Todos los derechos reservados.

---

*Hecho con cariño para Rhēud Beauty 💅*
