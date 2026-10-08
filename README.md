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

## 🚀 Tecnología

- **Frontend:** HTML, CSS y JavaScript en un solo archivo (`index.html`), sin dependencias de build.
- **Almacenamiento actual:** `localStorage` (los datos viven en cada dispositivo).
- **Almacenamiento en la nube (en progreso):** Supabase para sincronización multiusuario en tiempo real. Ver `supabase_schema.sql`.
- **Hosting:** Netlify (PWA instalable en iOS y Android).

## 📦 Estructura del repositorio

```
.
├── index.html                                   # La aplicación completa
├── portal.html                                  # Portal público de la clienta (código de cita, sellos)
├── supabase/migrations/20260905_multiservicio.sql  # Columnas de rama/duración/recurso, tabla expedientes_piel, índices
├── supabase/migrations/20260905_fotos_piel.sql     # Tabla fotos_piel + bucket privado "expedientes" con políticas por negocio
└── README.md                                    # Este archivo
```

### Migraciones multiservicio (v6.1 y v6.2)

Antes de desplegar la v6.1 ejecuta `supabase/migrations/20260905_multiservicio.sql` en el SQL Editor del proyecto. Es aditiva: agrega columnas con valores por defecto a `servicios` (categoría `nails`, 60 min, recurso `mesa`), crea `expedientes_piel` con RLS por negocio (sin política de lectura para el portal) y dos índices en `citas`. Las citas anteriores siguen funcionando: sin `d`/`r` en sus `items`, la app las trata como un solo bloque en la mesa.

La v6.2 añade `20260905_fotos_piel.sql`: tabla `fotos_piel` y el bucket privado `expedientes` (5 MB por foto, solo JPEG/PNG/WebP) con políticas de lectura/subida/borrado limitadas a la carpeta del negocio. Ambas migraciones ya están aplicadas en el proyecto de producción.

## 🛠️ Uso local

No requiere instalación ni servidor. Basta abrir `index.html` en un navegador moderno.

```bash
# Opción 1: abrir directamente el archivo
open index.html

# Opción 2: servirlo localmente
python3 -m http.server 8000
# luego visita http://localhost:8000
```

## 🌐 Despliegue

1. Crear una cuenta en [Netlify](https://app.netlify.com).
2. Arrastrar `index.html` a la sección de despliegue (drag & drop).
3. Asignar un nombre al sitio (ej. `rheud-beauty.netlify.app`).
4. (Opcional) Conectar un dominio propio.

Al actualizar la app, subir el nuevo `index.html` al mismo sitio **no borra** los datos guardados en cada dispositivo.

## ☁️ Nube en tiempo real (Supabase)

Para que varias personas vean las mismas citas en tiempo real:

1. Crear un proyecto en [Supabase](https://supabase.com).
2. Ejecutar `supabase_schema.sql` en el SQL Editor.
3. Activar Realtime para las tablas `citas`, `clientas` y `servicios`.
4. Conectar la app con el *Project URL* y la *anon key*.

## 📄 Licencia

Proyecto privado. Todos los derechos reservados.

---

*Hecho con cariño para Rhēud Beauty 💅*
