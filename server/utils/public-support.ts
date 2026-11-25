import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { H3Event } from 'h3';

import { db } from './db';

/// Genera un token aleatorio opaco para identificar la sesión de chat
/// de un visitante web sin requerir cuenta.
export function generateVisitorToken(): string {
  return randomBytes(24).toString('base64url');
}

/// Hash SHA-256 hex del token de visitante (en Firestore nunca se guarda el token plano).
export function hashVisitorToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/// Comparación en tiempo constante entre el token recibido y el hash guardado.
export function verifyVisitorToken(token: string, expectedHash: string): boolean {
  if (!token || !expectedHash) return false;
  const actual = Buffer.from(hashVisitorToken(token), 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/// Extrae el token del visitante desde el header `X-Visitor-Token`.
export function readVisitorToken(event: H3Event): string {
  return String(getRequestHeader(event, 'x-visitor-token') ?? '').trim();
}

/// Extrae la IP aproximada del cliente para aplicar rate limiting en endpoints públicos.
export function getClientIp(event: H3Event): string {
  const forwarded = getRequestHeader(event, 'x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return event.node.req.socket?.remoteAddress || 'unknown';
}

/// Resuelve la sede principal (Metepec) para asignar conversaciones web
/// de modo que Recepción, Gerente y Admin la vean de inmediato en /soporte.
export async function resolveDefaultBranchId(): Promise<string> {
  try {
    const snap = await db().collection('branches').get();
    if (!snap.empty) {
      const metepec = snap.docs.find((d) => {
        const name = String(d.data().name ?? '').toLowerCase();
        return d.id.toLowerCase().includes('metepec') || name.includes('metepec');
      });
      if (metepec) return metepec.id;

      const openBranch = snap.docs.find((d) => d.data().status === 'OPEN');
      if (openBranch) return openBranch.id;

      return snap.docs[0]!.id;
    }
  } catch (err) {
    console.warn('[public-support] No se pudo consultar branches, usando fallback:', err);
  }
  return 'metepec';
}
