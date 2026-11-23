---
name: cowhub-web-bookings
description: >-
  Use this skill when working on web reservations, space bookings, tour requests,
  the /api/public/* endpoints, or the integration between cowhub-b2b and cowhub-book.
  Covers the full public order lifecycle: order capture in book → folio generation →
  live dashboard tracking → reception check-in confirmation → close-day sweep.
---

# Web Bookings & cowhub-book Integration

## Architecture & Coexistence

- **`cowhub-book`** (`/Users/venta/Develop/PERSONAL/cowhub-book`): Web pública (Nuxt 4 + Tailwind v4) en puerto `:3100`. Toma órdenes de reservaciones (`/espacios/[id]`) y solicitudes de tours (`/tour`).
- **`cowhub-b2b`** (`/Users/venta/Develop/PERSONAL/cowhub-b2b`): Consola de administración y backend API en puerto `:3000`. Expone `/api/public/*`, gestiona disponibilidad en Firestore (`spaces`), y valida accesos en `/recepcion`.

## Regla de Oro de Datos (Book ➔ B2B)

- **`cowhub-book` es la fuente de verdad del catálogo inicial y precios**: Las 6 salas reales con fotos, tarifas y los planes de coworking de `cowhub-book` se sincronizan hacia Firestore en el B2B mediante `scripts/sync-from-book.mjs`.
- **Prohibido sobreescribir en reversa con datos vacíos**: Los endpoints públicos en `server/api/public/spaces*` cuentan con fallback a `DEFAULT_BOOKABLE_SPACES` si Firestore no tiene registros, asegurando que `cowhub-book` nunca reciba una respuesta vacía que oculte el catálogo.

## Endpoints Públicos (`/api/public/*`)

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/public/spaces` | `GET` | Catálogo público de salas activas. |
| `/api/public/spaces/:id?date=YYYY-MM-DD` | `GET` | Detalle de sala + horarios (07:00 a 20:00) + slots ocupados. |
| `/api/public/bookings` | `POST` | Valida conflicto en transacción y crea reserva en `space_bookings`. |
| `/api/public/tours` | `POST` | Registra solicitud de tour guiado en `tour_requests`. |

CORS configurado en `server/middleware/public-cors.ts` para permitir peticiones desde `http://localhost:3100` y orígenes autorizados.

## Ciclo de Vida de Reservaciones (`space_bookings`)

1. **Captura en `cowhub-book`**: El cliente selecciona horario y duración (1 a 6h) o día completo y envía datos de contacto.
2. **Creación en B2B**:
   - Genera folio único legible `CH-XXXXXX` (alfabeto sin caracteres ambiguos).
   - Estado inicial: `confirmed` (etiqueta visible en B2B: **"Vigente"**).
3. **Monitoreo en Tiempo Real**:
   - Dashboard (`/`): Reservas de hoy y ocupación de "Salas en vivo" (Ocupada / Próxima / Libre).
   - Agenda Web (`/agenda-web`): Gestión completa con filtros y cambios de estado con modal de confirmación.
4. **Confirmación de Acceso en Recepción (`/recepcion`)**:
   - Recepción captura el folio `CH-XXXXXX` en el lector de entrada unificado.
   - Presionar "Confirmar acceso" actualiza a `status: 'completed'`, `checked_in_at: serverTimestamp()` y `checked_in_by: staff_id`.
   - **Una reserva `completed` queda bloqueada para recepción** (solo Admin y Gerente pueden revertirla con modal).
5. **Cierre de Día**: Las reservas de hoy se archivan en estadísticas de utilización.

## Ciclo de Vida de Tours (`tour_requests`)

- Creados desde `/tour` en `cowhub-book`.
- Folio: `TOUR-XXXXXX`.
- Estados: `new` (Nuevo) → `contacted` (Contactado) → `done` (Agendado) → `cancelled` (Cancelado).
- Visible en la tarjeta "Tours por contactar" del Dashboard (`/`).
