import { safeFetchText } from './ssrf';

const SITEMAP_PATHS = ['/sitemap_index.xml', '/wp-sitemap.xml', '/sitemap.xml'];
const MAX_SITEMAP_FILES = 20;
const MAX_URLS = 2000;
const NON_PAGE = /\.(pdf|jpe?g|png|webp|gif|svg|zip|docx?|xlsx?)$/i;

const bareHost = (h: string) => h.replace(/^www\./, '');

/** Página encontrada y el archivo de sitemap que la lista (ej. "product-sitemap.xml"). */
interface Found { url: string; from: string }

const fileName = (u: string) => {
  try { return new URL(u).pathname.split('/').pop() || u; } catch { return u; }
};

async function readSitemap(url: string, seen: Set<string>): Promise<Found[]> {
  if (seen.has(url) || seen.size >= MAX_SITEMAP_FILES) return [];
  seen.add(url);
  const xml = await safeFetchText(url);
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*(.*?)\s*(?:\]\]>)?\s*<\/loc>/g)]
    .map((m) => m[1].replace(/&amp;/g, '&'));
  const pages: Found[] = [];
  for (const loc of locs) {
    if (/\.xml(\?|$)/i.test(loc)) pages.push(...(await readSitemap(loc, seen).catch(() => [])));
    else pages.push({ url: loc, from: fileName(url) });
    if (pages.length >= MAX_URLS) break;
  }
  return pages;
}

export interface SitemapResult {
  site: string;
  source: string | null;
  urls: string[];
  /** URL → archivo de sitemap del que salió (sirve para agrupar páginas repetitivas). */
  groups?: Record<string, string>;
  note?: string;
}

/** Busca el sitemap del sitio y devuelve las páginas del mismo host (sin imágenes/pdf/etc). */
export async function findSitemapUrls(siteInput: string): Promise<SitemapResult> {
  const site = new URL(siteInput).origin;
  const host = bareHost(new URL(site).host);
  let otherHost: string | null = null;

  // Además de las rutas habituales, usa los "Sitemap:" declarados en robots.txt.
  const candidates = [...SITEMAP_PATHS.map((p) => site + p)];
  try {
    const robots = await safeFetchText(`${site}/robots.txt`, { maxBytes: 200_000 });
    for (const m of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) {
      if (!candidates.includes(m[1])) candidates.unshift(m[1]);
    }
  } catch { /* sin robots.txt */ }

  for (const candidate of candidates) {
    const path = candidate.startsWith(site) ? candidate.slice(site.length) : candidate;
    try {
      const from = new Map<string, string>();
      for (const p of await readSitemap(candidate, new Set())) if (!from.has(p.url)) from.set(p.url, p.from);
      const all = [...from.keys()];
      const urls = all.filter((u) => {
        try { return bareHost(new URL(u).host) === host && !NON_PAGE.test(new URL(u).pathname); } catch { return false; }
      }).slice(0, MAX_URLS);
      if (all.length && !urls.length) {
        try { otherHost = new URL(all[0]).host; } catch { /* ignorar */ }
      }
      if (urls.length) return { site, source: path, urls, groups: Object.fromEntries(urls.map((u) => [u, from.get(u)!])) };
    } catch { /* probar el siguiente */ }
  }
  return {
    site, source: null, urls: [],
    note: otherHost
      ? `El sitemap existe pero sus URLs apuntan a otro dominio (${otherHost}). Sube un .txt o pega las URLs.`
      : 'No se encontró un sitemap. Sube un .txt o pega las URLs.',
  };
}
