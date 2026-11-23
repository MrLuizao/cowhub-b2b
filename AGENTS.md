# COW-HUB B2B — Consola de administración

Nuxt 3 + Vue 3 (`<script setup lang="ts">`) + Nuxt UI + Tailwind + Lucide.
**Firebase activo** — Auth + Firestore + FCM son reales (ya no hay mock);
los endpoints en `server/api/**` escriben con firebase-admin y validan
rol/sede server-side (`server/utils/staff-auth.ts`).

Repo hermano — app del miembro (Flutter):
`/Users/luis/Develop/Personal/cowhub-app` (tiene su propio `AGENTS.md` con las reglas de arquitectura y el estándar obligatorio de **Estética Luxury tipo Spotify + Micro-interacciones hápticas**: `PressableScale`, `AppHaptics`, halos de luz ambiental, barra `BackdropFilter` y casillas táctiles de PIN).

Repo hermano — web de reservas y toma de órdenes (Nuxt 4 + Tailwind v4):
`/Users/venta/Develop/PERSONAL/cowhub-book` (sitio público customer-facing en puerto :3100; toma órdenes de reservas y tours; consume `/api/public/*` del B2B).
**Regla de Oro de Datos (Book ➔ B2B)**: Los datos curados en `cowhub-book` (salas, fotos, capacidades, precios de membresías y contacto) son la fuente de verdad inicial y se transfieren hacia Firestore en el B2B mediante `scripts/sync-from-book.mjs`, NUNCA al revés. Prohibido sobreescribir con datos vacíos o default obsoletos.

**Modelo de negocio**: un proyecto Firebase = un negocio con varias sedes.
No existe `brand_id` operativo; el branding vive en `/config/brand`.
Timezone del negocio: `America/Mexico_City` — todas las fechas de
ocurrencia (`activity_date`, dailyStats) se calculan en esa TZ.

## ⚡ Regla de Oro de Agilidad y Pruebas

- **NO ejecutar pruebas unitarias (`npm test`, `vitest`, etc.) de forma automática**: Las pruebas solo se realizan **cuando el usuario lo indique expresamente**. No correr suites de prueba ni análisis pesados por iniciativa propia.
- **Flujo de trabajo ágil y directo**: Resolver solicitudes con modificaciones concisas, precisas y directas al código. Evitar diagnósticos redundantes, pasos intermedios innecesarios o procesos largos.
- **Validación ligera de sintaxis**: En cambios complejos, la única verificación es sintaxis rápida, sin bloquear al usuario con compilaciones pesadas innecesarias.
- **PROHIBIDO poner sombras (`shadow-*`, `box-shadow`, `drop-shadow`) en botones (`<button>`, `<UButton>`, o `<a>` con aspecto de botón)** en todos los repositorios (`cowhub-b2b`, `cowhub-landing`, `cowhub-app`). Los botones deben ser completamente limpios y planos en su contorno, sin resplandores ni sombreados exteriores.
- **PROHIBIDO el guion largo `—` (em-dash) en cualquier texto visible de la UI** (templates, labels, mensajes, toasts, placeholders). Usar `·` como separador de metadatos, `:` para introduce, o `-` simple. Ya se hizo barrido global; no reintroducirlo.
- **TODA acción que modifique estado o datos destructivos pasa por modal de confirmación** (`UModal`): selects de estado, botones de confirmar acceso, desactivar/eliminar, cambiar sedes, etc. El patrón es `pendingAction` + `confirmOpen`: el control NUNCA escribe directo en Firestore; al confirmar se ejecuta el `updateDoc`/`deleteDoc`, y al cancelar los selects se remontan (`selectReset`) para volver a mostrar el valor real. Referencia: `app/pages/index.vue` y `app/pages/agenda-web.vue`.
- **TODO elemento clickeable muestra `cursor: pointer`**: cubierto globalmente en `app/assets/css/main.css` para `button`, `a[href]`, roles ARIA interactivos, `select`, `summary`, `label[for]` y controles de formulario; los deshabilitados muestran `not-allowed`. NO quitar ni sobreescribir ese cursor en elementos clickeables, y si se crea un elemento clickeable no semántico (div/span con `@click`) agregarle `cursor-pointer` manualmente.

## 🎨 Estándar Obligatorio de UI / Sistema de Diseño (Luxury Dark UI)

Toda nueva vista o ajuste en `cowhub-b2b` debe respetar estrictamente los siguientes 4 patrones de interfaz:

### 1. Patrón de Cards para Sucursales / Entidades Físicas (`/sedes`)
- **Filtros KPI superiores**: `grid grid-cols-2 gap-4 lg:grid-cols-4` con tarjetas interactivas de filtro rápido.
- **Encabezado descriptivo + Filtro por sede + Barra de herramientas**:
  - El título `<h2 class="mb-3 text-sm font-black uppercase tracking-widest text-text-muted">` lleva directamente la descripción de la vista (ej. *"Red de sucursales y vista de aforo en tiempo real"*), seguido inmediatamente por los botones pill de sedes (`Todas` + cada sede), **sin párrafo descriptivo adicional debajo**.
  - Barra de herramientas con buscador `<UInput>`, badge contador `N sedes` inmediatamente después del input, y botón `+ Nueva sede` con `ml-auto`.
- **Contenedor de Card**: `group flex flex-col overflow-hidden rounded-2xl border border-stroke bg-surface transition hover:border-accent/40` dentro de `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5`.
- **Cabecera Multimedia (`relative h-48 w-full overflow-hidden bg-base`)**:
  - Imagen con zoom suave (`group-hover:scale-105`) y degradado (`bg-gradient-to-t from-base via-transparent to-black/40`).
  - Solo badges flotantes en la parte superior (`top-3`): izquierda para estado (`Abierta`/`Cerrada` con dot pulsante) y derecha para `% ocupación`. **No poner pills de aforo ni horario sobre la foto**.
- **Cuerpo de la Card (`flex flex-1 flex-col p-5`)**:
  - **Badges de atributos inmediatamente debajo de la foto y arriba del nombre**: pills `rounded-md border border-stroke bg-surface-elevated px-2.5 py-1 text-xs text-text-secondary` (ej. `N eventos programados`, horario con icono `Clock` y alerta `Ocupación alta` si `>80%`).
  - **Nombre y ubicación**: Nombre clickeable hacia `/<seccion>/${id}` (`text-base font-bold text-white group-hover:text-accent hover:underline`) y dirección debajo con icono `MapPin`.
  - **Barra de progreso**: Ocupación en vivo con semáforo (`<50%` esmeralda, `50-80%` ámbar, `>80%` rojo).
- **Footer de la Card (`mt-auto pt-5 flex items-center justify-end border-t border-stroke/50`)**:
  - **Limpio, únicamente con el botón `"Ver detalle"` (`Eye`)** alineado a la derecha. No colocar botones de *"Cerrar sede"* ni switches destructivos en la tarjeta (eso vive en la vista de detalle `/<seccion>/[id]`).

### 2. Patrón de Listado Tabular de Catálogo (`/salas`, `/miembros`)
- **4 Tarjetas KPI superiores**: Filtros rápidos por estado/categoría (`grid grid-cols-2 gap-4 lg:grid-cols-4`).
- **Encabezado descriptivo + Filtro por sede**:
  - El `<h2 class="mb-3 text-sm font-black uppercase tracking-widest text-text-muted">` contiene directamente la descripción de la sección como título (ej. *"Catálogo de espacios de trabajo por sede"*), seguido únicamente por los botones pill (`rounded-full border px-4 py-1.5 text-xs font-bold`) para `Todas` y cada sede (**sin párrafo extra debajo de los pills**).
- **Barra de herramientas (`flex items-center gap-4`) en este orden exacto**:
  1. Buscador `<UInput>` (`w-full max-w-sm size="lg"`).
  2. **Badge contador inmediatamente después del input de búsqueda**: `rounded-full border border-stroke bg-surface px-3 py-1 text-[11px] font-bold text-text-muted` (ej. `6 salas`, `24 miembros`).
  3. Botón primario de creación alineado al extremo derecho (`ml-auto flex cursor-pointer items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[11px] font-black text-base`, ej. `+ Nueva sala`).
- **Tabla paginada (`overflow-hidden rounded-2xl border border-stroke bg-surface`)**:
  - Primera columna con miniatura (`h-10 w-14 rounded-lg border border-stroke object-cover`) o `MemberAvatar`, nombre clickeable hacia `/<seccion>/${id}` y subtítulo truncado.
  - **Badges de destacado (`featured`) sin texto**: usar únicamente el contenedor circular con el icono (`inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-400` con `<Sparkles class="h-2.5 w-2.5" />` y `title` descriptivo).
  - Columna de Sede con pills navegables hacia `/sedes/${branchId}`.
  - Columna derecha de Estado con pill semántico (`ACTIVA` en esmeralda, `INACTIVA`/`VENCIDA` en rojo).
  - Footer de paginación (`pageSize = 8`) con resumen `N registros · página X de Y` y botones `ChevronLeft`/`ChevronRight`.

### 3. Patrón de Vistas de Alta / Creación (`/<seccion>/nuevo`)
- **PROHIBIDO usar modales para formularios de alta de entidades** (`/sedes/nuevo`, `/salas/nuevo`, `/miembros/nuevo`, `/anfitriones/nuevo`, `/membresias/nuevo`).
- Estructura obligatoria:
  - Botón superior `Volver` (`router.back()`) con icono `ArrowLeft`.
  - Encabezado `h1` (`text-xl font-black text-text-primary`) y descripción (`text-[11px] text-text-dim`).
  - Secciones agrupadas en `<section class="rounded-2xl border border-stroke bg-surface p-5">` con título precedido por barra vertical de acento (`<span class="h-4 w-1 rounded-full bg-accent" />`).
  - Botón de envío de ancho completo (`flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-accent text-xs font-black text-base`).
  - `UModal` exclusivo para la confirmación final antes de ejecutar el `POST` y redirigir a `/<seccion>/${id}`.

### 4. Patrón de Vistas de Detalle y Edición (`/<seccion>/[id]`)
- Botón superior `Volver` (`ArrowLeft`).
- Cabecera con miniatura (`h-20 w-28 rounded-2xl border border-stroke object-cover`), título `h1`, metadatos separados por `·`, indicador de estado con dot, y a la derecha el botón de acción de estado (`Power`: *Cerrar/Abrir sede*, *Desactivar/Activar sala*) con confirmación en `UModal`.
- Tarjeta de información en modo lectura por defecto con botón `Editar` (`Pencil`) en la esquina superior derecha; al editar muestra formulario inline con botones `Cancelar` y `Guardar` (con confirmación en `UModal`).
- Las secciones de actividades de una sede se denominan **"Próximos eventos"** (y en las cards **"eventos programados"**), asociados a una Sala y a una Sede.
- **Tarjeta de Eliminación / Zona de Peligro al final de la vista (`Eliminar <entidad>`)**:
  - Nunca usar un botón suelto de ancho completo; siempre usar una tarjeta contenedora:
    `<section v-if="isAdmin" class="flex items-center justify-between rounded-2xl border border-red-400/30 bg-red-400/5 p-5">`
  - A la izquierda: título `<h3 class="text-xs font-black uppercase tracking-widest text-red-400">Eliminar <entidad></h3>` y descripción `<p class="mt-0.5 text-[11px] text-text-dim">...</p>`.
  - A la derecha: botón pill `<button type="button" class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-red-400/40 bg-red-400/10 px-4 py-1.5 text-[11px] font-black text-red-400 transition hover:bg-red-400/20">` con icono `<Trash2 class="h-3.5 w-3.5" />` que abre el `UModal` de confirmación.

### 5. Reglas Estrictas de Interacción
- **PROHIBIDO sombras (`shadow-*`, `box-shadow`, `drop-shadow`) en botones**.
- **PROHIBIDO el guion largo `—` (em-dash)**. Usar `·`, `:`, o `-`.
- **TODO elemento clickeable debe mostrar `cursor: pointer`**.
- **TODA mutación de estado o acción destructiva pasa por modal de confirmación (`UModal`)**.

## Comandos

```bash
npm run dev        # dev server (http://localhost:3000)
npm run typecheck  # vue-tsc — solo si el usuario pide chequeo de tipos
```

Si `npm` no está en PATH: `export PATH="/Users/luis/.nvm/versions/node/v24.13.0/bin:$PATH"`

Nota: `npm run typecheck` a veces crashea con `ERR_PACKAGE_PATH_NOT_EXPORTED`
(bug conocido de Volar/vue-tsc) — revisar que no haya errores TS reales en
la salida; el crash de la herramienta no es un error del código.

## Flujos operativos clave

Detalle de colecciones y campos en `FIRESTORE.md`; reglas en
`firestore.rules`.

### Alta de miembros (claim)

Recepción crea al miembro (`/miembros` → `members.post`) con `member_number`
+ `contact_email` obligatorio; el backend genera un `claim_pin` de 6 díg
y lo envía por correo (`server/utils/mail.ts`, SMTP por env — sin SMTP
se loguea en consola y se muestra en el detalle del miembro). La app
**nunca crea** el registro: el usuario entra con Google/Apple y reclama
su ficha vía `POST /api/members/claim` (número + PIN, single-use — se
borra al reclamar). `POST /api/members/{id}/claim-pin` regenera/reenvía
(staff, scope de sede). `contact_email` ≠ `email` (login Google/Apple).
Sin vínculo no ve datos del centro.
- **Desactivación y eliminación de miembros (`/miembros/[id]`)**:
  - **Desactivar / Reactivar (`PUT /api/members/{id}` con `membershipStatus: 'EXPIRED' | 'ACTIVE'`)**: Admin (todas las sedes) y Gerente (su sede) pueden desactivar temporalmente a un miembro sin borrar su historial (le impide hacer check-in y reservar espacios).
  - **Eliminar (`DELETE /api/members/{id}`)**: Exclusivo para `ADMIN` (elimina el documento `users/{id}` previa confirmación modal).

### Check-ins y ocupación en tiempo real

- **Dashboard realtime**: `useDashboardRealtime` usa listeners de
  Firestore (`onSnapshot`) en vez de polling — `branches` y
  `recentCheckIns` se actualizan instantáneamente cuando hay cambios.
  Los KPIs históricos y la curva de tráfico se cargan una vez al montar
  (`/api/dashboard/static`). El composable viejo `useDashboard` con
  polling cada 5s queda deprecado.
- `branches.current_capacity`: check-in `+1` (`checkin.post` rechaza si
  `>= max_capacity`), checkout `-1`, cierre `= 0`. Ajuste manual por
  `POST /api/branches/{id}/adjust` (`delta` o `value`, transacción con
  clamp + sello `capacity_adjusted_at/by`) — admin todas, gerente su sede,
  recepcionista **no puede**.
- **Auto-checkout**: cron externo (cron-job.org) cada 15 min →
  `POST /api/cron/auto-checkout` libera check-ins >90 min sin salida
  (`release_reason: 'auto_checkout_cron'`). El doc queda en `checkins`
  hasta el cierre de día. El decremento de `current_capacity` va en
  transacción con clamp a 0 (el cierre de día pudo haber reseteado
  antes de que el cron aplicara su decremento).
- **Cierre de día** (`sweepCheckins` + `sweepActivityBookings` en
  `server/utils/close-day.ts`): agrega check-ins a `dailyStats` por
  (sede, fecha del check-in), actualiza `forecasts` (EMA por weekday),
  borra los docs, limpia `active_checkin_*` de miembros, resetea ocupación y
  cupo de espacios. Dos entradas: botón "Cerrar sede" del header
  (`POST /api/branches/{id}/close-day`, cualquier rol pero solo su sede
  salvo admin) y cron global `/api/cron/close-day` (vercel.json
  23:55 CDMX — handler sin sufijo: acepta el GET de Vercel cron y el
  POST con `Bearer CRON_SECRET` de cron-job.org/manual).
- **Validación de alcance de sede**: `checkin.post` y
  `activities/{id}/book` rechazan si el plan del miembro no tiene
  `all_branches` y la sede no es su `branch_id`
  (`PLAN_BRANCH_RESTRICTED` — registrado como denegado).
- **Agregadores externos (Wellhub/TotalPass)** — esqueleto con mock, **sin uso en COW-HUB** (heredado del gym; la UI de recepción ya no los expone):
  `ScannerPanel` tiene modo por proveedor →
  `POST /api/partners/checkin` (`{provider, token}`) →
  `validatePartnerToken` en `server/utils/partners.ts` (**mock hoy** —
  token ≥6 chars pasa como "Visitante demo"; las credenciales reales
  del convenio se enchufan ahí por env, sin tocar UI). El check-in se
  escribe en `checkins` con `provider` + `external_id`,
  `user_id: null`, `method: 'partner'` — mismo ocupación/TTL/cierre de día
  que miembros. Dedupe: un `external_id` solo rinde una entrada por día.
  CheckInsList/ScanResultPanel muestran el visitante sin link a miembro
  y sin botón de pago. Índice compuesto
  `provider+external_id+check_in_at` ya deployado.

### Reservas de espacio — por ocurrencia

- `bookings/{id}`: `activity_id` + `activity_date` (YYYY-MM-DD CDMX) +
  `auth_uid` + `branch_id` (sede donde se toma) + `status`
  (`confirmed`/`cancelled`). El miembro lee solo las suyas; escribe solo el
  backend.
- `POST /api/activities/{id}/book` `{date?, branchId?}`: valida membresía
  `ACTIVE`, fecha en `[hoy, hoy+8]`, vigencia (si hoy, no haber pasado
  `end_minutes` — respeta `branch_times` de la sede), cupo **en
  transacción** sobre `activities.booked_by_date[date]`; idempotente por
  (espacio+miembro+fecha). `DELETE .../book?date=` cancela esa ocurrencia.
- `activities.booked` = espejo de "inscritos hoy" total (compat);
  `booked_by_date` = `{fecha: {branchId: n}}` es la fuente real — cupo
  **por sede**. Valores planos legacy se migran a la sede de la reserva
  (o a `'_'` al leer). Reservas viejas sin `activity_date` cuentan por su
  `created_at`. El close-day resetea `booked` y poda llaves `<= hoy`;
  las fechas futuras se conservan.
- `GET /api/activities/{id}/roster` — reservas confirmadas de hoy; staff con
  sede ve solo las de su sede.

### Agenda web pública (reservas de espacios + tours)

- **Coexistencia con cowhub-book**: el frontend de toma de órdenes corre en :3100 (`PORT=3100 npm run dev`) y consume `/api/public/spaces`, `/api/public/spaces/:id?date=`, `POST /api/public/bookings` y `POST /api/public/tours`. Si Firestore está vacío, el backend del B2B recurre a `DEFAULT_BOOKABLE_SPACES` (`shared/data/default-spaces.ts`) para no vaciar la UI de la web.
- `space_bookings/{id}` y `tour_requests/{id}` los escribe solo el backend
  público (`/api/public/*`, consumido por cowhub-book); staff solo hace
  `update` de status desde el B2B (`firestore.rules`: `isStaff`).
- **Dashboard (`/`) = vista de gestión del día**: 3 KPIs (reservas hoy,
  reservas próximas, tours nuevos), lista "hoy y próximas" con cambio de
  estado, tours por contactar y **"Salas en vivo"** (ocupación de las
  salas de la sede en tiempo real). La analítica histórica + diagnóstico
  IA viven en `/reportes`. `/agenda-web` queda como vista completa con
  historial (admin/gerente - recepción no la tiene en `ROLE_ROUTES`).
- **Panel "Confirmar acceso" vive en `/recepcion`** (no en el dashboard):
  el folio `CH-XXXXXX` es el único camino a `completed` - ver abajo.
- **Salas por sede**: `spaces.branch_ids` asigna cada sala a una o más
  sedes. El staff ve las salas de SU sede; admin ve todas con etiqueta.
  Ocupación = reservas web de HOY que cubren la hora actual (CDMX) o son
  de día completo; estados: Ocupada / Próxima / Libre.
- **Etiquetas visibles de estado**: `confirmed` se muestra como
  **"Vigente"** (badge azul), `completed` como "Completada" (verde);
  los valores internos en Firestore no cambian.
- **Confirmar acceso = único camino a `completed`**: recepción captura el
  folio `CH-XXXXXX` en el panel de `/recepcion` → `status:'completed'` +
  `checked_in_at` (serverTimestamp) + `checked_in_by` (staff). Solo si la
  reserva es de HOY y está `confirmed`; el resto de estados
  (no_show/cancelled/confirmed) se mueven con el select de la fila -
  `completed` nunca es opción de select (aparece solo si ya lo es, para
  mostrarlo). Revertir una completada limpia el sello.
- **Todo cambio de estado pide confirmación en modal** (`UModal`,
  patrón `pendingAction`): aplica a selects de reserva/tour y al botón
  "Confirmar acceso" en `/` y `/agenda-web`.
- **Reserva `completed` = bloqueada para recepción**: solo admin/gerente
  puede cambiarle el estado (UI muestra "Requiere gerente" con candado;
  `firestore.rules` lo niega server-side). Recepción sí puede confirmar
  acceso (confirmed → completed) y editar otros campos.
- **QR / wallet passes (roadmap)**: el input de folio es el punto único de
  validación de acceso — cuando lleguen los pases, ese mismo control se
  convierte en escáner (la reserva lleva el código en el pase). No crear
  una segunda vía de confirmación.
- Roles: `ROLE_HOME.RECEPTIONIST = '/'` — recepción opera agenda + tours
  desde el dashboard; el scanner de miembros sigue en `/recepcion`.

### Avatares (sin fotos subidos) (sin fotos subidas)

- **Integrante**: `hosts.avatar` = id de `HOST_AVATAR_IDS`
  (`shared/host-avatars.ts`) — se elige con picker al crear en
  `/anfitriones/nuevo` y lo edita solo ADMIN en `[id]` (campo global,
  fuera de MANAGER_KEYS). Los SVG viven en `public/avatars/hosts/` —
  regenerar arte con `node scripts/generate-host-avatars.mjs` (emite a
  public/ y al bundle de la app). `photo_url` quedó legacy.
- **Miembro**: `users.avatar` = id de `memberAvatarCatalog` (app) — el
  miembro lo elige en su perfil; self-write permitido vía whitelist en
  firestore.rules. En el B2B se renderiza con `MemberAvatar.vue`
  (espejo del catálogo en `shared/member-avatars.ts` — icono lucide +
  gradiente) en `/miembros`, detalle y ScanResultPanel; mantener ids
  alineados con la app.

### Soporte / chat miembro-staff

- `conversations/{id}` + subcolección `messages` — solo conversaciones
  **activas**: al resolver (`POST /api/support/{id}/resolve`) se borra el
  doc y sus mensajes, no hay historial. Las abandonadas también se borran:
  cada doc lleva `expires_at` (última actividad +24h, renovable por
  mensaje) y el cron `auto-checkout` las barre (`last_message_at` >24h).
  La TTL policy nativa de Firestore no se pudo activar vía API (requiere
  billing en el proyecto); si se activa a mano en la consola (Firestore →
  TTL → collection groups `conversations` y `messages`, campo
  `expires_at`), hace la misma limpieza — ambos mecanismos coexisten sin
  problema.
- El miembro escribe desde la app ("Ayuda y soporte"); la conversación se
  crea perezosa en el **primer mensaje** (`POST /api/support/conversations`),
  no al abrir la pantalla.
- `unread_member`/`unread_staff` se incrementan en el POST de mensajes y
  se resetean en `GET .../messages` según quién lee.
- Respuesta de staff → push FCM al topic `member_{memberDocId}` con
  `data.type='support'` (la app abre el chat al tocarla).
- B2B `/soporte`: lista + chat con listeners realtime (filtro `branch_id`
  simple — `status`/orden en memoria, sin índice compuesto). Cualquier
  staff responde; gerente/recepcionista solo su sede. Badge rojo en el
  menú + toast: `useSupportUnread` (singleton, escucha `unread_staff`,
  beep via Web Audio — el browser lo permite tras el primer click).

### Lealtad (objetivos + recompensas)

- `checkin.post` concedido → `recordVisitAndReward`
  (`server/utils/loyalty.ts`, transacción): escribe
  `users/{id}/visits/{yyyy-mm-dd}` (doc id = fecha CDMX → dedupe) y, si
  el miembro llegó a su `weekly_goal` esta semana (lunes-domingo CDMX),
  suma `GOAL_BONUS_POINTS` (50) a `users.points` marcando
  `goal_awarded_week` — una vez por semana. Fallo de lealtad NO tumba
  el check-in (try/catch). También mantiene `points_earned`
  (acumulado histórico — `points` solo es saldo) y al premiar manda
  push FCM a `member_{userId}` con `data.type='loyalty'` (la app abre
  Recompensas al tocarla).
- **Racha extendida**: si el miembro cumple la meta semanas consecutivas,
  gana puntos extra (`STREAK_BONUSES` en `loyalty.ts`): 2 semanas +25,
  4 semanas +50, 8 semanas +100, 12 semanas +150. Se trackea con
  `goal_streak` y `goal_streak_week` en el doc del usuario.
- **Historial de puntos**: cada movimiento (+meta, +racha, -canje) se
  registra en `users/{id}/pointsHistory` vía `recordPointsHistory` —
  transparencia para el miembro. `GET /api/rewards/history` lo expone.
- `users.weekly_goal` (default 4) lo edita el miembro desde la app —
  whitelisted en rules. `points` y `goal_awarded_*` solo functions.
- `GET /api/rewards/stats` — KPIs vía agregaciones: `points_earned`
  emitidos, saldo vivo `points`, miembros con meta cumplida esta semana
  (scope por sede para no-admin). La página los muestra junto al
  desglose de canjes por sede.
- `POST /api/rewards/redeem` `{rewardId}` (miembro): transacción —
  valida `rewards.active` + saldo + **stock** → descuenta `points`,
  incrementa `redeemed_count` y crea `users/{id}/redemptions`
  (`code` `RWR-XXXXXX`, `active`, expira 30d). Envía push de
  confirmación al miembro con el código.
- **Stock limitado**: `rewards.stock` (null = ilimitado) y
  `redeemed_count` — el canje falla si `redeemed_count >= stock`.
- **Recordatorio de expiración**: cron `redemption-reminder` (diario,
  09:00 CDMX) envía push a miembros con códigos que expiran en 3 días.
- Panel B2B `/recompensas`: catálogo CRUD (solo admin;
  `GET/POST /api/rewards` + `PUT /api/rewards/:id`), KPIs de canje,
  listado de canjes (`GET /api/rewards/redemptions`, scope por sede vía
  `branch_id` embebido en el doc — collectionGroup query) y validación
  del código en recepción (`POST /api/rewards/redemptions {code}` →
  marca `used`, verifica vigencia + sede).

### Retención y Churn Prediction con IA (Scikit-Learn + Vertex AI)

- **Arquitectura Bi-Nivel**:
  1. **Tier Estándar / MVP Viable (`sklearn_local`)**: Modelo de Regresión
     Logística entrenado con scikit-learn con pesos y StandardScaler exportados
     a `server/models/churn-weights.json`. La inferencia corre en TypeScript
     puro en Vercel Serverless (`server/utils/churn-model.ts`) en <0.1ms sin
     dependencias pesadas ni cold-start.
  2. **Tier Premium / Enterprise (`vertex_ai`)**: Integración con Google Cloud
     Vertex AI AutoML Tabular (`server/utils/vertex-ai.ts`). Inferencia contra
     endpoint dedicado vía OAuth2 (GoogleAuth). Incluye fallback automático a
     `sklearn_local` si la nube es inalcanzable.
- **Aprovisionamiento bajo demanda (Control del Desarrollador)**:
  El cliente final (coworking) **no configura la IA**; tú como programador la
  activas o desactivas por despliegue mediante variables de entorno (Vercel / `.env`):
  `AI_CHURN_ENABLED=1` la activa; si está en `0` o ausente, el módulo permanece
  oculto en el menú y los crons se saltan inmediatamente.
  Variables de control: `AI_CHURN_ENABLED`, `AI_CHURN_PROVIDER` (`sklearn_local` o
  `vertex_ai`), `AI_CHURN_PLAN`, `AI_CHURN_ALERT_THRESHOLD` y credenciales de Vertex AI.
- **Features de miembro** (`server/api/cron/churn-features.post.ts`, 03:00 CDMX):
  Calcula visitas de los últimos 30 días (`users/{id}/visits`), varianza semanal,
  días sin asistencia, cancelaciones de espacios, tickets de soporte y rachas.
  Guarda en `users/{id}/churn_features/{fecha}` y denormaliza en
  `users/{id}.latest_churn_features` para evitar consultas $N+1$.
- **Inferencia en lote** (`server/api/cron/churn-predict.post.ts`, 03:30 CDMX):
  Evalúa a los miembros activos, actualiza `churn_risk_ml`, `churn_risk_level` y
  extrae las causas principales en `churn_top_factors` ("Ausente hace 18 días", etc.).
  Registra telemetría de uso en `usage_analytics` para facturación mensual.
- **Push automático** (`server/utils/auto-retention.ts`, al final de
  `churn-predict`): solo con `AI_CHURN_AUTO_PUSH=1`. Envía el push Gemini
  del playbook a miembros de riesgo **alto** (combinado) sin intervención en
  los últimos 14 días (manual o automática), máx. 60 por corrida. Sella
  `last_retention_intervention` con `auto: true` solo si el push salió
  (si FCM falla se reintenta al día siguiente) → cuenta en "ingresos
  salvados". El resultado va en `auto_push` de la respuesta del cron.
- **Reentrenamiento con datos reales** (`scripts/train-churn-model.py`, con
  `FIREBASE_SERVICE_ACCOUNT`): cada foto diaria `users/{id}/churn_features/{fecha}`
  es una observación; etiqueta 1 si la membresía venció (`membership_until`)
  dentro de 30 días tras la foto, 0 si siguió activa; fotos recientes de
  activos se descartan (censura). Split por miembro. **Aborta sin tocar el
  modelo** si hay <30 abandonos reales (`--min-positives`) o AUC <0.65
  (`--min-auc`, `--force` lo ignora); ya no mezcla sintéticos en silencio.
  El JSON lleva `data_source` (`synthetic`/`firestore`). Requiere meses de
  historial acumulado — mientras tanto el modelo es sintético.
- **Quejas del chat → riesgo combinado** (`server/utils/complaint-risk.ts` +
  `sentiment-analysis.ts`): cada mensaje del miembro en `messages.post` se
  clasifica en segundo plano (`event.waitUntil`, solo si el módulo está
  activo) con Gemini JSON mode → respaldo por frases clave. Si es queja
  acumula `users.complaint_risk` (+severidad·0.5, tope 1, **vida media 14d**
  calculada al leer desde `last_complaint_at`) y sella
  `last_complaint_type/at/severity`; mensajes sin queja no tocan nada.
  `churn_risk_ml` = probabilidad pura del modelo; `combined_risk` =
  0.7·ML + 0.3·queja decaída, y de ahí sale `churn_risk_level` (umbrales
  del modelo). `/retencion` recalcula el combinado al vuelo, ordena por él,
  filtra "Solo con quejas" (≥0.3) y muestra ambos porcentajes.
- **Consola B2B `/retencion`**: Dashboard para Admin y Gerente (filtrado a su sede).
  Muestra KPIs de riesgo (Alto, Medio, Bajo), causas explicativas por miembro,
  recalculación individual (`POST /api/analytics/churn-score`) y acciones
  inmediatas: Push FCM de reactivación y apertura de ticket proactivo de soporte
  (`POST /api/analytics/reengage-member`).
- **Scripts de entrenamiento y exportación**:
  - `scripts/train-churn-model.py`: Genera dataset sintético calibrado o lee Firestore,
    entrena LogisticRegression balanceada y exporta a `churn-weights.json`.
  - `scripts/export-vertex-dataset.py`: Exporta CSV para entrenar AutoML Tabular en GCP.

### Push / CMS

- `pushLogs`: `status` draft/sent/failed + `target` (`auto|home|explore|
  allies|promos|profile`) que la app mapea a tab; `auto` cae al mapping
  por `kind` (SPONSOR→Aliados, BRAND→Descuentos).
- Flujo manual: crear borrador → "Enviar ahora". El scheduler
  (`cms/push/dispatch` + `scheduledAt`) está **apagado por flag**
  `PUSH_SCHEDULER !== '1'` — código intacto, se reactiva con env.
- Audiencias por topic FCM: `all_members`, `branch_{id}`,
  `expired_members`. `log.sent` = 1 por envío exitoso al topic (FCM no
  expone suscriptores); el KPI "Tasa de entrega" es SENT/(SENT+FAILED).

### Publicidad self-serve (/anuncia)

- Página pública `/anuncia` (sin login — middleware la exime como
  `/legal`): el negocio sube su creativo, elige espacio y semanas, y
  paga por **Stripe Checkout** (hosted). **Los anuncios ya no se
  segmentan por sede** — todo anuncio lo ven todos los miembros;
  `branch_id` queda siempre null. Precio server-side:
  `price_per_week × semanas` desde `/config/ads` (lo edita el admin en
  `/publicidad/venta-directa`).
- **`placement`** (sponsorAds): solo dos valores nuevos — `carousel`
  (premium: carrusel del Home + Promociones + tope del directorio
  Aliados) y `list` (solo directorio, orden aleatorio). Docs viejos con
  `both` o sin el campo se normalizan a `carousel` al leerse. Ranking
  `PLACEMENT_RANK` (list<carousel) en shared/types.
- **Carrusel = 5 espacios** (`CAROUSEL_SLOTS`). Ocupan los ads
  `carousel` más antiguos por `created_at`; si hay más de 5 activos el
  excedente espera en la lista y sube cuando venza alguno. En `/anuncia`
  el comprador ve "X de 5 espacios libres" o, si está lleno, el aviso
  de que aparecerá solo en Aliados hasta liberarse el próximo lugar
  (fecha aprox. que calcula `self-serve.get` con ACTIVE + órdenes
  PENDING_APPROVAL).
- **Directorio Aliados** (app): primero los 5 del carrusel fijados,
  después TODOS los demás en orden aleatorio — sin favoritismo
  (`alliesAdsProvider` en la app; `carouselAdsProvider` alimenta Home
  y Promociones).
- **Pushes — gancho + paquete** (`config/ads.push {enabled, count,
  price}`): TODA compra incluye **1 push gratis** que sale al APROBAR
  la orden (nunca al pagar — pasa por el filtro humano). El paquete
  (`wants_push`) agrega `push_pack` pushes extra que quedan como
  `pushLogs` DRAFT con `scheduled_at` semanal (+7d, +14d…) — los
  despacha **`GET/POST /api/cron/push-dispatch`** (Vercel cron diario
  ~10:00 CDMX en vercel.json, o cron externo con Bearer CRON_SECRET;
  mismo motor `dispatchDuePushLogs` que también reactiva los pushes
  programados manuales del CMS). Todos los logs llevan kind SPONSOR,
  audience ALL → topic `all_members`, target `allies`. La orden guarda
  `push_log_ids[]`/`push_sent_at`/`push_error` para trazabilidad y
  reintento desde /cms. En Stripe el paquete viaja como segundo
  line_item.
- **Anuncios comprados** (`order_id != null`) — integridad del
  inventario pagado: upgrade de placement libre, pero **downgrade /
  pausa / borrado vigente requieren `overrideReason`** y dejan
  evidencia en `/auditLogs` (server-only; `server/utils/audit.ts`).
  **Excepciones**: el anuncio EXPIRADO se borra libre (ya cumplió su
  pauta) y el PENDING no se borra por DELETE — se rechaza desde la
  orden (reembolso). Activar un PENDING por edición manual también
  está bloqueado — solo vía approve (define `ends_at` y cierra el
  ciclo de pago).
- **Reactivación / Renovación de anuncios vencidos**: Reactivar un anuncio
  vencido (`ends_at <= now` o status `EXPIRED`) no puede hacerse con solo
  cambiar el status a ACTIVE con fecha vieja: requiere **definir obligatoriamente
  una nueva fecha de vigencia futura** Y registrar un **cobro en mostrador / recepción**
  (monto + método + folio, creando una orden aprobada en `/adOrders` para
  trazabilidad contable) O bien una **justificación obligatoria de cortesía /
  extensión** que queda grabada en `/auditLogs` con el sello del usuario de
  staff autorizador. El backend (`server/api/cms/ads/[id].put.ts`) rechaza con 400
  cualquier intento de activación sin vigencia futura o sin cobro/justificación.
- El webhook (`checkout.session.completed`, respaldo en
  `payment_intent.succeeded` por `ad_order_id` en metadata) crea el
  `sponsorAds` con **status PENDING** — la app solo consulta ACTIVE, no
  se cuela — y la orden `/adOrders` pasa a `PENDING_APPROVAL`. Correos
  SMTP: admins de staff + `config/ads.notify` (global siempre; como
  toda orden es de "todas las sedes", todos los `by_branch` reciben
  aviso — dedupe) + confirmación al anunciante.
- **Ubicación**: `/anuncia` muestra un mapa OSM (`LocationPicker.vue` —
  Leaflet, tiles Carto dark). Al salir del campo dirección se
  geocodifica (Nominatim client-side, `countrycodes=mx`) y se propone
  el pin; el anunciante lo confirma o lo arrastra (`manual` marca que
  ya no se re-geocodifica). El pin viaja en la orden y gana sobre el
  geocoding server-side del webhook (`server/utils/geo.ts` — respaldo
  cuando no hubo pin). Si nada resuelve quedan null y el admin los
  fija a mano en el detalle (lat/lng editables).
- El admin revisa en `/publicidad` (cola de solicitudes) o en el
  detalle: **aprobar** pone ACTIVE + `ends_at = hoy + weeks` (la vigencia
  arranca en la aprobación); **rechazar** reembolsa automático por
  Stripe y borra el creativo. Si el reembolso falla no se toca nada.
- `checkout.session.expired` marca la orden EXPIRED. Requiere suscribir
  los eventos `checkout.session.*` en el webhook de Stripe (ver
  .env.example).
- **Fin de campaña**: el cron diario `GET /api/cron/ads-report`
  (`vercel.json` 16:30 UTC ≈ 10:30 CDMX, `CRON_SECRET` o admin) barre
  los `sponsorAds` ACTIVE con `ends_at` vencida → los marca `EXPIRED` y
  envía al anunciante el **reporte de campaña** (impresiones/taps/CTR de
  `adStats` + pushes SENT + CTA "Renovar" a `/anuncia`). Sella
  `adOrders.report_sent_at`; reenvío manual `POST /api/ads/orders/{id}/report`
  (admin — el detalle del anuncio muestra el estado + botón).

### Seguridad anti-abuso

- **`server/utils/rate-limit.ts`** — async; doble nivel: memoria por
  instancia (siempre) + Upstash Redis si `UPSTASH_REDIS_REST_URL`/`TOKEN`
  están (ventana fija `SET NX PX`+`INCR` — conteo real entre lambdas;
  fail-open al límite local si Redis cae). Ventana deslizante local por
  uid/endpoint. Aplicado a `members/claim`
  (10/10min), `ads/track` (30/min), `support` conv+msg (5 y 20/min),
  `rewards/redeem` (10/min), `activities/*/book` (20/min),
  `payments/intent` (10/min).
- **Lockout del claim PIN** — `users.claim_attempts`/`claim_locked_until`:
  **3 fallos → 15 min bloqueado**; se resetean al reclamar bien.
- **Dedupe de ads** — `/adEvents/{adId}_{uid}_{fecha}_{evento}` con
  `create()`: 1 impresión/tap por miembro por anuncio por día. Además
  `/adStats/{adId}_{fecha}` acumula la serie diaria (solo eventos que
  pasaron el dedupe) — la lee `GET /api/ads/{id}/stats` (admin/gerente)
  para la gráfica de 30d en `/publicidad/[id]`.
- **App Check** — preparado en ambos clientes: app móvil con Play
  Integrity / App Attest (iOS ya registrada), B2B web con reCAPTCHA
  Enterprise ("Fraud Defense") en `useFirebase` — **requiere plan
  Blaze**; en Spark el registro en consola falla y Google ya no acepta
  reCAPTCHA Classic. Mientras `NUXT_PUBLIC_RECAPTCHA_SITE_KEY` esté
  vacía App Check web no se inicializa (seguro: tokens inválidos darían
  401). Tras migrar a Blaze: registrar la web app con Fraud Defense →
  site key a la env → verificar que `X-Firebase-AppCheck` viaja en los
  requests → `APP_CHECK_ENFORCE=1` + enforcement en Firestore/Auth. El `$api` web y el `ApiClient` de
  Flutter mandan `X-Firebase-AppCheck`; `verifyAppCheck` corre en los
  tres gates (`requireStaff`/`requireMember`/`requireUser`) +
  `ads/track`: token inválido → 401 siempre; token ausente → tolerado
  hasta que `APP_CHECK_ENFORCE=1` (env) lo haga obligatorio. Falta en
  Console: registrar la app web con reCAPTCHA Enterprise (genera el
  site key), los providers móviles, y prender enforcement por producto
  (Firestore/Auth) + la env cuando todos los clientes manden token.

## Matriz de permisos por perfil

Roles: `ADMIN` (admin global), `MANAGER` (gerente de sede), `RECEPTIONIST` (recepcionista).
Definidos en `app/composables/useAuth.ts` (`StaffRole`, `ROLE_ROUTES`, `ROLE_HOME`).

**Regla central**: gerente y admin tienen **los mismos permisos de vista**; la
diferencia es solo el **alcance de edición** — el gerente edita únicamente lo de
su propia sede (`session.branchId`), el admin cualquier sede.

| Sección | Recepcionista | Gerente | Admin global |
|---|---|---|---|
| Dashboard (`/`) — agenda del día + confirmar acceso por folio | **home**; agenda/tours/ocupación (sin editar ocupación) | **home**; ajustar ocupación solo su sede | **home**; ajustar todas |
| Recepción (`/recepcion`) | su sede (selector bloqueado) | su sede (selector bloqueado) | cualquier sede |
| Miembros (`/miembros`) | ver + crear (sin editar existentes) | ver todo; editar/crear solo su sede | editar/crear cualquier sede |
| Espacios (`/espacios`) | ver | ver todo; editar solo horario/sala **de su sede** | editar todo (campos globales) |
| Equipo (`/anfitriones`) | ver | ver todo; crear auto-asignado a su sede; gestionar turno de integrantes asignados | editar todo + asignar sedes |
| Sedes (`/sedes`) | sin acceso | ver todas; editar solo la suya | editar todas + crear |
| Membresías (`/membresias`) | sin acceso | ver catálogo — **NO puede editar ni crear** | editar + crear |
| Recompensas (`/recompensas`) | ver + validar códigos de su sede | ver + validar códigos de su sede | editar catálogo + validar |
| Publicidad (`/publicidad`) | sin acceso | ver (anuncios en solo lectura; las órdenes son globales → aprobar/rechazar es admin-only) | editar + crear + pausar + eliminar + aprobar órdenes |
| CMS (`/cms`) | sin acceso | ver (detalle solo lectura) | editar + crear + enviar + eliminar |
| Reportes (`/reportes`) | sin acceso | todos los tipos, siempre filtrado a su sede | todos, cualquier sede |

La matriz se enforcea **server-side**, no solo en la UI: `RECEPTIONIST`
recibe 403 en cualquier mutación de hosts (`hosts.post`,
`hosts/{id}/update|duty`), `activities/{id}.put`, en las lecturas de
publicidad/CMS (`ads/orders.get`, `ads/config.get`, `ads/{id}/stats.get`,
`cms/**`) y solo cobra a miembros de su sede (`payments.post` valida
`requireBranchScope` contra `member.branch_id`).

### Reglas de negocio clave

- **Entidad compartida** (espacio o integrante asignado a varias sedes): el gerente solo
  edita sus campos locales (horario, sala, turno); los globales (nombre, encargado,
  capacidad) son admin-only.
- **Entidad propia** (miembro de su sede, su sede): edición completa para el gerente.
- **Entidad global** (membresías/precios, cupones, notificaciones push, anuncios):
  solo admin edita; el gerente ve en solo lectura.
- **Membresías**: el gerente **no puede editar ni crear planes bajo ningún caso** —
  es exclusivo del admin global. La creación vive en `/membresias/nuevo`
  (`POST /api/plans`), página admin-only que redirige a cualquier otro rol.
- **La membresía ES el plan** — no existe un "nivel" separado. Los beneficios y
  el alcance del miembro los define su `MembershipPlan` (precio, features,
  `allBranches`, `highlight`). La segmentación de cupones es por plan:
  `Coupon.planIds` contiene `'ALL'` o ids de planes específicos.
- **Referencias por ID, nombres solo para display.** Las relaciones guardan el
  `MembershipPlan.id` canónico — nunca el nombre (un rename no debe romper
  referencias):
  - `Member.membershipPlanId` → `MemberAdmin.membershipType` es el nombre
    resuelto (solo lectura/display).
  - `PaymentRecord.planId` (canónico) + `plan` (etiqueta histórica al cobrar).
  - `Coupon.planIds` — `'ALL'` o ids de planes.
  - `CheckInRecord.membershipType` es snapshot del nombre al momento del scan.
  - `Activity.hostId` (canónico, `Host.id`) + `host` (etiqueta
    denormalizada para display; ''/`'Sin asignar'` si no hay encargado).
  - Reportes: `byPlan` agrega por `planId` y expone `plan` (nombre) para display.
  - En Firestore: `users/{id}.membership_plan_id`, `payments.plan_id`,
    `promotions.plan_ids`, `activities.host_id`; resolver nombres desde las
    colecciones `plans` y `hosts`.
- Creación de integrante por gerente → queda auto-asignado a su sede; el admin elige sede.
- Notificaciones: el admin edita/elimina cualquier estado; "Enviar/Reenviar" solo
  desde la tabla `/cms`.

### Helpers de permisos (`useAuth`)

- `canEditBranch(branchId)` — admin siempre; gerente solo su sede.
- `canEditInBranches(branchIds)` — edición completa: gerente solo si la entidad
  pertenece **exclusivamente** a su sede.
- `isAtMyBranch(branchIds)` — acciones locales: la entidad incluye su sede aunque
  sea compartida.
- `canAccess(role, path)` / `ROLE_ROUTES` — gating de navegación
  (middleware `auth.global.ts` + nav en `layouts/default.vue`).

### Pagos con Stripe

- `POST /api/payments/intent` `{planId}`: crea/reusa `stripe_customer_id`
  del miembro y devuelve `clientSecret` para el Payment Sheet de la app.
- `POST /api/webhooks/stripe` (firma `STRIPE_WEBHOOK_SECRET`,
  idempotente vía `/webhookEvents/{eventId}`): `payment_intent.succeeded`
  escribe `/payments` (APPROVED) y activa la membresía
  (`membership_status=ACTIVE`, `membership_until` +30d desde
  max(hoy, vencimiento)); `payment_failed` → DECLINED;
  `charge.refunded` → REFUNDED.
- Montos: `plans.price` en pesos MXN → Stripe en centavos (×100).
- Env requeridas en `.env`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `CRON_SECRET`. Dev: `stripe listen --forward-to
  localhost:3000/api/webhooks/stripe` (requiere Stripe CLI).

## Deuda conocida / pendientes

- **Stripe keys**: el flujo está programado de punta a punta; falta
  poblar `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (.env B2B) y
  `stripePublishableKey` (app_config.dart) con llaves reales.
- **Cron `close-day` en Vercel**: `server/api/cron/close-day.ts` acepta
  GET (Vercel Cron, 23:55 CDMX en `vercel.json`) y POST (manual con
  Bearer). Requiere `CRON_SECRET` en Vercel. `auto-checkout` corre en
  cron-job.org cada 15 min.
- **`bookings` archivadas**: el close-day mueve las de `activity_date <
  hoy` a `/bookings_archive` (lectura solo staff — índice
  `branch_id + activity_date` deployado). La colección viva queda acotada.
- `html5-qrcode` está en `package.json` sin uso (recepción usa lector USB).
- **Rate limit in-memory en serverless**: `rate-limit.ts` cuenta por
  instancia — en Vercel cada lambda tiene su propia ventana y un bot
  distribuido la diluye. Suficiente contra abuso casual; si hay abuso
  real migrar a Upstash Redis (`@upstash/redis`, free tier 10k
  comandos/día) — INCR+EXPIRE reemplaza el `Map`, la firma de
  `rateLimit()` no cambia. Alternativa: Vercel WAF (Pro) o Cloudflare
  delante del dominio.
- **Wellhub/TotalPass reales**: `validatePartnerToken` es mock — falta
  el convenio (Partner Portal) para obtener API keys, base URL
  y saber qué artefacto valida cada agregador (QR, token, lookup por
  ID). Pendiente también reporte de visitas×tarifa (liquidación
  estimada) una vez conocidas las tarifas negociadas por tier.
- Moneda/locale: México — `es-MX`, `$` (MXN), sedes seed en Toluca/Metepec.
