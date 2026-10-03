import { NextResponse } from 'next/server';

// Límite simple por IP en memoria. En Vercel cada instancia serverless tiene su propio contador,
// así que es una protección "best effort" contra abuso de la cuota de la API (no un límite estricto).
// Se configura con RATE_LIMIT_PSI, RATE_LIMIT_SITEMAP y RATE_LIMIT_WINDOW_MIN.

function envLimit(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const LIMITS = {
  psi: envLimit('RATE_LIMIT_PSI', 600),
  sitemap: envLimit('RATE_LIMIT_SITEMAP', 30),
};
export const WINDOW_MS = envLimit('RATE_LIMIT_WINDOW_MIN', 10) * 60_000;

export type Bucket = keyof typeof LIMITS;

// Clave "bucket:ip": cada endpoint lleva su propio contador.
const hits = new Map<string, number[]>();

/** Registra una petición. Si se pasó del límite devuelve los segundos que faltan para que se libere un cupo. */
export function rateLimit(bucket: Bucket, ip: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const key = `${bucket}:${ip}`;
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMITS[bucket]) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return { ok: true, retryAfterSec: 0 };
}

/** Respuesta 429 con Retry-After y el tiempo de espera en el mensaje. */
export function tooMany(retryAfterSec: number, extra?: Record<string, unknown>) {
  const wait = retryAfterSec < 60 ? `${retryAfterSec} s` : `~${Math.ceil(retryAfterSec / 60)} min`;
  return NextResponse.json(
    { error: `Demasiadas peticiones, espera ${wait} y vuelve a intentar.`, ...extra },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}
