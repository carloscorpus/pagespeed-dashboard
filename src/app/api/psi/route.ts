import { NextResponse, type NextRequest } from 'next/server';
import { summarize } from '@/lib/psi-extract';
import { clientIp, rateLimit, tooMany } from '@/lib/rate-limit';
import { assertPublicUrl } from '@/lib/ssrf';
import { CATEGORIES, type Strategy } from '@/lib/types';

// Una sola prueba por llamada (15–60 s). El navegador orquesta el lote.
// Verifica el límite de tu plan de Vercel; ajusta este valor si hace falta.
export const maxDuration = 60;

const API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export async function GET(req: NextRequest) {
  const limit = rateLimit('psi', clientIp(req));
  if (!limit.ok) return tooMany(limit.retryAfterSec, { fatal: true });
  const key = process.env.PSI_API_KEY;
  if (!key) return NextResponse.json({ error: 'Falta la variable de entorno PSI_API_KEY.', fatal: true }, { status: 500 });

  const sp = req.nextUrl.searchParams;
  const url = (sp.get('url') || '').trim();
  const strategy = sp.get('strategy') as Strategy;
  const raw = sp.get('raw') === '1';
  if (strategy !== 'mobile' && strategy !== 'desktop') {
    return NextResponse.json({ error: 'strategy debe ser "mobile" o "desktop".' }, { status: 400 });
  }
  try { await assertPublicUrl(url); } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const api = new URL(API);
  api.searchParams.set('url', url);
  api.searchParams.set('strategy', strategy);
  api.searchParams.set('key', key);
  api.searchParams.set('locale', 'es');
  CATEGORIES.forEach((c) => api.searchParams.append('category', c));

  try {
    const res = await fetch(api, { signal: AbortSignal.timeout((maxDuration - 3) * 1000) });
    const json = await res.json();
    if (json.error) {
      const msg: string = json.error.message || 'Error de la API de PageSpeed';
      // 400/403 por key inválida o API deshabilitada: no sirve reintentar.
      return NextResponse.json({ error: msg, fatal: /key|api.*(not|disabled)/i.test(msg) }, { status: [400, 403, 429].includes(res.status) ? res.status : 502 });
    }
    const lh = json.lighthouseResult;
    if (lh?.runtimeError && lh.runtimeError.code !== 'NO_ERROR') {
      return NextResponse.json({ error: lh.runtimeError.message }, { status: 502 });
    }
    // Una URL que responde 404/500 igual se "analiza" (se mide la página de error) y sus puntajes
    // contaminarían los promedios: se reporta como error. `permanent`: reintentar no cambia nada.
    const http = lh?.audits?.['http-status-code'];
    if (http?.score === 0) {
      const code = http.displayValue || 'de error';
      return NextResponse.json({
        error: `La página responde con código HTTP ${code}: no existe o da error, así que no se incluye en los resultados. Revisa la URL o quítala de la lista.`,
        permanent: true,
      }, { status: 422 });
    }
    const summary = summarize(lh, url, strategy);
    return NextResponse.json(raw ? { summary, raw: json } : { summary });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
