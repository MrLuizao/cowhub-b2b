import nodemailer, { type Transporter } from 'nodemailer';

/// SMTP genérico por env - en dev funciona con Gmail (app password) o
/// Brevo; en prod se apunta al proveedor real sin tocar código.
/// Sin SMTP_* configurado el envío se omite y el PIN se loguea en
/// consola del server (fallback dev - el B2B lo muestra igual).
let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: { user, pass },
  });
  return transporter;
}

/// Remitente: MAIL_FROM admite formato "Nombre <correo>" (el nombre es
/// lo que ve el destinatario); sin ella se usa la cuenta autenticada.
function getFrom(): string {
  return (
    process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@cowhub.mx'
  );
}

/// Envío genérico - los correos del flujo self-serve de anuncios lo
/// usan. Regresa false si SMTP no está configurado (se loguea el
/// asunto para rastreo en dev).
export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const from = getFrom();
  const t = getTransporter();
  if (!t) {
    console.warn(`[mail] SMTP no configurado - '${opts.subject}' para ${opts.to}`);
    return false;
  }
  await t.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html });
  return true;
}

/// Carcasa visual común de los correos del flujo de anuncios.
function mailShell(inner: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;background:#0d0f14;color:#e8eaf0;padding:32px;border-radius:16px">
      ${inner}
    </div>`;
}

/// Al staff (admins + correos configurados): llegó una solicitud de
/// anuncio ya pagada. `branchLabel` = la sede comprada (o "todas").
export async function sendAdOrderStaffNotice(opts: {
  to: string;
  businessName: string;
  placementLabel: string;
  branchLabel?: string;
  weeks: number;
  amount: number;
  reviewUrl: string;
}): Promise<boolean> {
  const html = mailShell(`
    <h2 style="margin:0 0 8px">Nueva solicitud de anuncio</h2>
    <p style="color:#9aa0ae;font-size:14px;line-height:1.5">
      <strong style="color:#e8eaf0">${opts.businessName}</strong> pagó
      <strong style="color:#e8eaf0">$${opts.amount.toLocaleString('es-MX')} MXN</strong>
      por ${opts.placementLabel} durante ${opts.weeks} semana(s)${opts.branchLabel ? ` - sede: <strong style="color:#e8eaf0">${opts.branchLabel}</strong>` : ''}.
      Revisa el creativo y apruébalo o recházalo - el rechazo reembolsa
      automáticamente.
    </p>
    <div style="text-align:center;margin:24px 0">
      <a href="${opts.reviewUrl}" style="display:inline-block;background:#c8f04a;color:#0d0f14;font-weight:800;font-size:13px;text-decoration:none;padding:12px 20px;border-radius:10px">Revisar solicitud</a>
    </div>`);
  return sendMail({
    to: opts.to,
    subject: `Nueva solicitud de anuncio - ${opts.businessName}`,
    html,
  });
}

/// Al anunciante: pago recibido, anuncio en revisión.
export async function sendAdOrderPaidEmail(opts: {
  to: string;
  businessName: string;
  brandName: string;
  amount: number;
  weeks: number;
}): Promise<boolean> {
  const html = mailShell(`
    <h2 style="margin:0 0 8px">¡Recibimos tu anuncio, ${opts.businessName}!</h2>
    <p style="color:#9aa0ae;font-size:14px;line-height:1.5">
      Tu pago de <strong style="color:#e8eaf0">$${opts.amount.toLocaleString('es-MX')} MXN</strong>
      quedó registrado. El equipo de ${opts.brandName} revisará tu anuncio
      antes de publicarlo - te avisamos por correo cuando quede en vivo.
    </p>
    <p style="color:#9aa0ae;font-size:14px;line-height:1.5">
      Si el anuncio no fuera aprobado, tu pago se reembolsa
      automáticamente a la misma tarjeta.
    </p>
    <p style="color:#5a6070;font-size:11px;line-height:1.5">
      Vigencia contratada: ${opts.weeks} semana(s) desde la aprobación.
    </p>`);
  return sendMail({
    to: opts.to,
    subject: `Tu anuncio está en revisión - ${opts.brandName}`,
    html,
  });
}

/// Al anunciante: anuncio aprobado y en vivo hasta `endsAt`.
export async function sendAdOrderApprovedEmail(opts: {
  to: string;
  businessName: string;
  brandName: string;
  endsAt: number;
}): Promise<boolean> {
  const endLabel = new Date(opts.endsAt).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Mexico_City',
  });
  const html = mailShell(`
    <h2 style="margin:0 0 8px">Tu anuncio está en vivo</h2>
    <p style="color:#9aa0ae;font-size:14px;line-height:1.5">
      El equipo de ${opts.brandName} aprobó el anuncio de
      <strong style="color:#e8eaf0">${opts.businessName}</strong> - ya lo
      ven los miembros en la app. Estará publicado hasta el
      <strong style="color:#e8eaf0">${endLabel}</strong>.
    </p>`);
  return sendMail({
    to: opts.to,
    subject: `Tu anuncio está en vivo - ${opts.brandName}`,
    html,
  });
}

/// Al anunciante: rechazado, reembolso automático en camino.
export async function sendAdOrderRejectedEmail(opts: {
  to: string;
  businessName: string;
  brandName: string;
  amount: number;
  reason: string;
}): Promise<boolean> {
  const html = mailShell(`
    <h2 style="margin:0 0 8px">Sobre tu anuncio</h2>
    <p style="color:#9aa0ae;font-size:14px;line-height:1.5">
      El equipo de ${opts.brandName} no pudo aprobar el anuncio de
      <strong style="color:#e8eaf0">${opts.businessName}</strong>.
      ${opts.reason ? `Motivo: ${opts.reason}.` : ''}
    </p>
    <p style="color:#9aa0ae;font-size:14px;line-height:1.5">
      Tu pago de <strong style="color:#e8eaf0">$${opts.amount.toLocaleString('es-MX')} MXN</strong>
      se reembolsó automáticamente - Stripe lo refleja en tu estado de
      cuenta en 5-10 días hábiles. Si ajustas tu creativo puedes volver a
      publicarlo cuando quieras.
    </p>`);
  return sendMail({
    to: opts.to,
    subject: `Reembolso de tu anuncio - ${opts.brandName}`,
    html,
  });
}

/// Al anunciante: cierre de campaña - métricas de su pauta (impresiones,
/// toques, CTR, pushes) + CTA de renovación. Lo dispara el cron
/// ads-report cuando el anuncio vence.
export async function sendAdReportEmail(opts: {
  to: string;
  businessName: string;
  brandName: string;
  placementLabel: string;
  weeks: number;
  amount: number;
  endsAt: number;
  impressions: number;
  taps: number;
  pushesSent: number;
  renewUrl: string;
}): Promise<boolean> {
  const endLabel = new Date(opts.endsAt).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Mexico_City',
  });
  const ctr =
    opts.impressions > 0
      ? `${((opts.taps / opts.impressions) * 100).toFixed(1)}%`
      : '0%';
  const cell = (label: string, value: string) => `
    <td style="padding:10px 14px;background:#161a24;border-radius:10px;text-align:center">
      <div style="font-size:18px;font-weight:800;color:#e8eaf0">${value}</div>
      <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5a6070;margin-top:2px">${label}</div>
    </td>`;
  const html = mailShell(`
    <h2 style="margin:0 0 8px">Así le fue a tu campaña</h2>
    <p style="color:#9aa0ae;font-size:14px;line-height:1.5">
      La pauta de <strong style="color:#e8eaf0">${opts.businessName}</strong>
      en ${opts.brandName} terminó el
      <strong style="color:#e8eaf0">${endLabel}</strong>
      (${opts.placementLabel} · ${opts.weeks} semana(s) ·
      $${opts.amount.toLocaleString('es-MX')} MXN).
    </p>
    <table style="width:100%;border-spacing:6px;margin:16px 0">
      <tr>
        ${cell('Impresiones', opts.impressions.toLocaleString('es-MX'))}
        ${cell('Toques', opts.taps.toLocaleString('es-MX'))}
        ${cell('CTR', ctr)}
      </tr>
      ${opts.pushesSent > 0 ? `<tr>${cell('Notificaciones enviadas', String(opts.pushesSent))}<td></td><td></td></tr>` : ''}
    </table>
    <p style="color:#9aa0ae;font-size:14px;line-height:1.5">
      ¿Quieres seguir viéndote en la app? Renueva tu espacio en un minuto
      - el creativo nuevo entra a revisión igual que este.
    </p>
    <div style="text-align:center;margin:24px 0">
      <a href="${opts.renewUrl}" style="display:inline-block;background:#f4e701;color:#0d0f14;font-weight:800;font-size:13px;text-decoration:none;padding:12px 20px;border-radius:10px">Renovar campaña</a>
    </div>`);
  return sendMail({
    to: opts.to,
    subject: `Reporte de tu campaña - ${opts.brandName}`,
    html,
  });
}

export function generateClaimPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/// Correo de activación: código de 6 dígitos + links de descarga.
/// Regresa true si el proveedor aceptó el envío.
export async function sendClaimPinEmail(opts: {
  to: string;
  name: string;
  memberNumber: string;
  pin: string;
}): Promise<boolean> {
  const iosUrl = process.env.APP_IOS_URL || 'https://apps.apple.com';
  const androidUrl =
    process.env.APP_ANDROID_URL || 'https://play.google.com/store';
  const from = getFrom();
  const firstName = opts.name.split(' ')[0] ?? opts.name;

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;background:#0d0f14;color:#e8eaf0;padding:32px;border-radius:16px">
      <h2 style="margin:0 0 8px">¡Bienvenido, ${firstName}!</h2>
      <p style="color:#9aa0ae;font-size:14px;line-height:1.5">
        Tu inscripción quedó lista. Este es tu número de miembro y tu
        código de activación - los necesitas la primera vez que entres
        a la app.
      </p>
      <div style="background:#161a22;border:1px solid #262b36;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
        <p style="margin:0;color:#9aa0ae;font-size:11px;letter-spacing:2px">NÚMERO DE MIEMBRO</p>
        <p style="margin:4px 0 16px;font-size:22px;font-weight:800;letter-spacing:3px">${opts.memberNumber}</p>
        <p style="margin:0;color:#9aa0ae;font-size:11px;letter-spacing:2px">CÓDIGO DE ACTIVACIÓN</p>
        <p style="margin:4px 0 0;font-size:32px;font-weight:900;letter-spacing:8px;color:#c8f04a">${opts.pin}</p>
      </div>
      <p style="color:#9aa0ae;font-size:14px;line-height:1.5">
        Descarga la app e ingresa con Google o Apple - después escribe
        tu número y código para vincular tu cuenta.
      </p>
      <div style="text-align:center;margin:24px 0">
        <a href="${iosUrl}" style="display:inline-block;background:#c8f04a;color:#0d0f14;font-weight:800;font-size:13px;text-decoration:none;padding:12px 20px;border-radius:10px;margin:4px">Descargar para iOS</a>
        <a href="${androidUrl}" style="display:inline-block;background:#c8f04a;color:#0d0f14;font-weight:800;font-size:13px;text-decoration:none;padding:12px 20px;border-radius:10px;margin:4px">Descargar para Android</a>
      </div>
      <p style="color:#5a6070;font-size:11px;line-height:1.5">
        El código es de un solo uso. Si no solicitaste este registro,
        ignora este correo.
      </p>
    </div>`;

  const t = getTransporter();
  if (!t) {
    console.warn(
      `[mail] SMTP no configurado - PIN de ${opts.memberNumber}: ${opts.pin} (para ${opts.to})`,
    );
    return false;
  }
  await t.sendMail({
    from,
    to: opts.to,
    subject: `${opts.memberNumber} - tu código de activación`,
    html,
  });
  return true;
}

// ─── Agenda Web Pública (Reservas y Tours desde cowhub-book) ───

function cowhubShell(inner: string): string {
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;background:#120c08;color:#f9f5f1;padding:32px;border-radius:16px;border:1px solid #382b20">
      <p style="margin:0 0 20px;font-size:12px;letter-spacing:4px;color:#d4a17c;font-weight:700">COWHUB · METEPEC</p>
      ${inner}
      <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #2e231a;color:#8a6f58;font-size:11px;line-height:1.5">
        Paseo San Isidro 111, Metepec · info@cowhub.mx
      </p>
    </div>`;
}

export async function sendPublicBookingReceivedEmail(opts: {
  to: string;
  name: string;
  folio: string;
  spaceName: string;
  date: string;
  timeLabel: string;
  people: number;
  totalMxn: number;
}): Promise<boolean> {
  const html = cowhubShell(`
    <h2 style="margin:0 0 8px;color:#f9f5f1">Recibimos tu solicitud de reserva</h2>
    <p style="color:#e3d5c5;font-size:14px;line-height:1.6">
      Hola <strong style="color:#f9f5f1">${opts.name}</strong>, tu solicitud quedó registrada con el folio
      <strong style="color:#d4a17c">${opts.folio}</strong>. Un miembro de nuestro equipo la confirmará a la brevedad.
    </p>
    <div style="background:#1d1610;border:1px solid #382b20;border-radius:12px;padding:16px;margin:20px 0;font-size:13px;line-height:1.8;color:#e3d5c5">
      <div><strong style="color:#d4a17c">Espacio:</strong> ${opts.spaceName}</div>
      <div><strong style="color:#d4a17c">Fecha:</strong> ${opts.date}</div>
      <div><strong style="color:#d4a17c">Horario:</strong> ${opts.timeLabel}</div>
      <div><strong style="color:#d4a17c">Personas:</strong> ${opts.people}</div>
      <div><strong style="color:#d4a17c">Total estimado:</strong> $${opts.totalMxn.toLocaleString('es-MX')} MXN</div>
    </div>
    <p style="color:#b5a392;font-size:12px;line-height:1.5">
      Te enviaremos un correo en cuanto el equipo confirme tu acceso.
    </p>`);
  return sendMail({
    to: opts.to,
    subject: `Solicitud recibida ${opts.folio} - ${opts.spaceName} · COWHUB`,
    html,
  });
}

export async function sendPublicBookingConfirmedEmail(opts: {
  to: string;
  name: string;
  folio: string;
  spaceName: string;
  date: string;
  timeLabel: string;
  status: 'confirmed' | 'cancelled';
  reason?: string;
}): Promise<boolean> {
  const isConfirmed = opts.status === 'confirmed';
  const html = cowhubShell(`
    <h2 style="margin:0 0 8px;color:#f9f5f1">${isConfirmed ? '¡Tu reserva fue confirmada!' : 'Actualización de tu reserva'}</h2>
    <p style="color:#e3d5c5;font-size:14px;line-height:1.6">
      Hola <strong style="color:#f9f5f1">${opts.name}</strong>, tu reserva
      <strong style="color:#d4a17c">${opts.folio}</strong> para
      <strong style="color:#f9f5f1">${opts.spaceName}</strong> (${opts.date} · ${opts.timeLabel})
      ${isConfirmed ? 'ha sido <strong style="color:#d4a17c">confirmada</strong> por nuestro equipo. Presenta este folio en recepción al llegar.' : 'fue cancelada. Si necesitas reagendar, contáctanos en info@cowhub.mx.'}
    </p>
    ${opts.reason ? `<p style="margin-top:12px;padding:12px;background:#1d1610;border:1px solid #382b20;border-radius:10px;color:#e3d5c5;font-size:13px"><strong style="color:#d4a17c">Nota del equipo:</strong> ${opts.reason}</p>` : ''}`);
  return sendMail({
    to: opts.to,
    subject: `${isConfirmed ? 'Reserva confirmada' : 'Reserva cancelada'} ${opts.folio} - ${opts.spaceName} · COWHUB`,
    html,
  });
}

export async function sendPublicBookingStaffNotice(opts: {
  to: string;
  folio: string;
  spaceName: string;
  date: string;
  timeLabel: string;
  people: number;
  totalMxn: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  agendaUrl: string;
}): Promise<boolean> {
  const html = cowhubShell(`
    <h2 style="margin:0 0 8px;color:#f9f5f1">Nueva reserva web por confirmar</h2>
    <p style="color:#e3d5c5;font-size:14px;line-height:1.6">
      Llegó una nueva reserva desde el sitio público con folio <strong style="color:#d4a17c">${opts.folio}</strong>.
    </p>
    <div style="background:#1d1610;border:1px solid #382b20;border-radius:12px;padding:16px;margin:20px 0;font-size:13px;line-height:1.8;color:#e3d5c5">
      <div><strong style="color:#d4a17c">Espacio:</strong> ${opts.spaceName}</div>
      <div><strong style="color:#d4a17c">Fecha y horario:</strong> ${opts.date} · ${opts.timeLabel} (${opts.people} pers.)</div>
      <div><strong style="color:#d4a17c">Total:</strong> $${opts.totalMxn.toLocaleString('es-MX')} MXN</div>
      <div><strong style="color:#d4a17c">Cliente:</strong> ${opts.guestName} · ${opts.guestEmail}${opts.guestPhone ? ` · ${opts.guestPhone}` : ''}</div>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="${opts.agendaUrl}" style="display:inline-block;background:#d4a17c;color:#120c08;font-weight:700;font-size:13px;text-decoration:none;padding:12px 24px;border-radius:999px">Confirmar en Agenda web</a>
    </div>`);
  return sendMail({
    to: opts.to,
    subject: `[Por confirmar] Reserva ${opts.folio} - ${opts.spaceName}`,
    html,
  });
}

export async function sendPublicTourReceivedEmail(opts: {
  to: string;
  name: string;
  folio: string;
  preferredDate: string | null;
  people: number;
}): Promise<boolean> {
  const html = cowhubShell(`
    <h2 style="margin:0 0 8px;color:#f9f5f1">Recibimos tu solicitud de tour</h2>
    <p style="color:#e3d5c5;font-size:14px;line-height:1.6">
      Hola <strong style="color:#f9f5f1">${opts.name}</strong>, registramos tu solicitud con el folio
      <strong style="color:#d4a17c">${opts.folio}</strong>.
      ${opts.preferredDate ? `Fecha sugerida: <strong style="color:#f9f5f1">${opts.preferredDate}</strong> (${opts.people} pers.).` : `Para ${opts.people} persona(s).`}
    </p>
    <p style="color:#b5a392;font-size:13px;line-height:1.5">
      Un anfitrión de nuestro equipo se pondrá en contacto contigo para confirmar tu visita en COWHUB Metepec.
    </p>`);
  return sendMail({
    to: opts.to,
    subject: `Solicitud de tour ${opts.folio} · COWHUB`,
    html,
  });
}

export async function sendPublicTourStatusEmail(opts: {
  to: string;
  name: string;
  folio: string;
  preferredDate: string | null;
  status: 'contacted' | 'done' | 'cancelled';
  reason?: string;
}): Promise<boolean> {
  const title =
    opts.status === 'done'
      ? '¡Tu tour está agendado!'
      : opts.status === 'contacted'
        ? 'Seguimiento de tu tour'
        : 'Actualización de tu solicitud de tour';
  const body =
    opts.status === 'done'
      ? `confirmamos tu visita con el folio <strong style="color:#d4a17c">${opts.folio}</strong>${opts.preferredDate ? ` para el <strong style="color:#f9f5f1">${opts.preferredDate}</strong>` : ''}. Te esperamos en Paseo San Isidro 111, Metepec.`
      : opts.status === 'contacted'
        ? `nuestro equipo ya tomó tu solicitud <strong style="color:#d4a17c">${opts.folio}</strong> y está coordinando tu recorrido.`
        : `tu solicitud de tour <strong style="color:#d4a17c">${opts.folio}</strong> fue cancelada.`;
  const html = cowhubShell(`
    <h2 style="margin:0 0 8px;color:#f9f5f1">${title}</h2>
    <p style="color:#e3d5c5;font-size:14px;line-height:1.6">
      Hola <strong style="color:#f9f5f1">${opts.name}</strong>, ${body}
    </p>
    ${opts.reason ? `<p style="margin-top:12px;padding:12px;background:#1d1610;border:1px solid #382b20;border-radius:10px;color:#e3d5c5;font-size:13px"><strong style="color:#d4a17c">Nota del equipo:</strong> ${opts.reason}</p>` : ''}`);
  return sendMail({
    to: opts.to,
    subject: `${title} ${opts.folio} · COWHUB`,
    html,
  });
}

export async function sendPublicTourStaffNotice(opts: {
  to: string;
  folio: string;
  name: string;
  company: string | null;
  email: string;
  phone: string;
  preferredDate: string | null;
  people: number;
  message: string | null;
  agendaUrl: string;
}): Promise<boolean> {
  const html = cowhubShell(`
    <h2 style="margin:0 0 8px;color:#f9f5f1">Nueva solicitud de tour por confirmar</h2>
    <p style="color:#e3d5c5;font-size:14px;line-height:1.6">
      Llegó un lead de tour desde el sitio público con folio <strong style="color:#d4a17c">${opts.folio}</strong>.
    </p>
    <div style="background:#1d1610;border:1px solid #382b20;border-radius:12px;padding:16px;margin:20px 0;font-size:13px;line-height:1.8;color:#e3d5c5">
      <div><strong style="color:#d4a17c">Solicitante:</strong> ${opts.name}${opts.company ? ` · ${opts.company}` : ''}</div>
      <div><strong style="color:#d4a17c">Contacto:</strong> ${opts.email} · ${opts.phone}</div>
      <div><strong style="color:#d4a17c">Preferencia:</strong> ${opts.preferredDate ?? 'Por definir'} (${opts.people} pers.)</div>
      ${opts.message ? `<div><strong style="color:#d4a17c">Mensaje:</strong> "${opts.message}"</div>` : ''}
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="${opts.agendaUrl}" style="display:inline-block;background:#d4a17c;color:#120c08;font-weight:700;font-size:13px;text-decoration:none;padding:12px 24px;border-radius:999px">Gestionar en Agenda web</a>
    </div>`);
  return sendMail({
    to: opts.to,
    subject: `[Nuevo tour] ${opts.folio} - ${opts.name}`,
    html,
  });
}
