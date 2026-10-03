import dns from 'node:dns/promises';
import net from 'node:net';

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateV6(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === '::' || x === '::1') return true;
  const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  return /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff');
}

export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  return v === 4 ? isPrivateV4(ip) : v === 6 ? isPrivateV6(ip) : true;
}

/** Valida que la URL sea http(s) y que su host resuelva solo a IPs públicas. Lanza Error si no. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error('URL inválida'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Solo se permiten URLs http(s)');
  if (u.username || u.password) throw new Error('La URL no puede incluir credenciales');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Host no permitido');
    return u;
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Host no permitido');
  const addrs = await dns.lookup(host, { all: true }).catch(() => { throw new Error('No se pudo resolver el dominio'); });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('Host no permitido');
  return u;
}

export interface FetchedPage { text: string; headers: Headers; finalUrl: string }

/**
 * fetch de texto con validación SSRF en cada salto (redirecciones manuales), timeout y límite de tamaño.
 * Limitación conocida: la resolución DNS se valida antes del fetch (no hay pinning de IP).
 */
export async function safeFetchPage(
  raw: string,
  { timeoutMs = 15000, maxBytes = 5_000_000, maxRedirects = 3, truncate = false } = {},
): Promise<FetchedPage> {
  let url = raw;
  for (let i = 0; i <= maxRedirects; i++) {
    const u = await assertPublicUrl(url);
    const res = await fetch(u, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (PageSpeed dashboard)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location')!, u).toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > maxBytes && !truncate) throw new Error('Respuesta demasiado grande');
    const reader = res.body?.getReader();
    if (!reader) return { text: '', headers: res.headers, finalUrl: u.toString() };
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      chunks.push(value);
      if (total > maxBytes) {
        await reader.cancel();
        if (!truncate) throw new Error('Respuesta demasiado grande');
        break; // para detectar basta con el inicio del HTML
      }
    }
    return { text: Buffer.concat(chunks).toString('utf8'), headers: res.headers, finalUrl: u.toString() };
  }
  throw new Error('Demasiadas redirecciones');
}

export async function safeFetchText(raw: string, opts?: Parameters<typeof safeFetchPage>[1]): Promise<string> {
  return (await safeFetchPage(raw, opts)).text;
}
