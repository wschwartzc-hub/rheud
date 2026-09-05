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
- **Menú de servicios** — precio, costo real, margen, descripción y qué incluye.

## 🎨 Diseño (v6)

Estética editorial premium, pensada mobile-first:

- **Color:** porcelana (`#F9F4EE`) de fondo, borgoña profundo (`#4A1224`) como color de marca, champán (`#C5A880`) para el botón flotante y acentos, malva (`#A07484`) secundario. Lavanda (`#6E5B9C`) reservada para la futura rama Skin Care.
- **Tipografía:** Bodoni Moda (títulos, montos y horas) + Figtree (texto, listas y controles). Bodoni no baja de 17 px; por debajo manda Figtree.
- **Estructura:** cabecera compacta (logo + estado), pantalla de inicio **Hoy** (siguiente cita, acciones rápidas y agenda del día en lista), 5 tabs — *Hoy · Citas · Clientas · Finanzas · Menú* — donde Finanzas reúne Ingresos, Egresos e Insights. Botón flotante con etiqueta que dice qué crea en cada pantalla.
- **Componentes:** tarjetas blancas con borde fino y sombra suave (radio 20), segmentos con pastilla blanca, filtros como fila de chips, etiquetas de estado cortas con un color por significado.

Los tokens viven en `:root` dentro de `index.html`; cambiar la paleta es editar esas variables.

## 🚀 Tecnología

- **Frontend:** HTML, CSS y JavaScript en un solo archivo (`index.html`), sin dependencias de build.
- **Almacenamiento actual:** `localStorage` (los datos viven en cada dispositivo).
- **Almacenamiento en la nube (en progreso):** Supabase para sincronización multiusuario en tiempo real. Ver `supabase_schema.sql`.
- **Hosting:** Netlify (PWA instalable en iOS y Android).

## 📦 Estructura del repositorio

```
.
├── index.html              # La aplicación completa
├── supabase_schema.sql     # Esquema de base de datos para la nube
└── README.md               # Este archivo
```

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
