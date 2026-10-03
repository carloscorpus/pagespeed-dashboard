// Agrupa las páginas repetitivas (misma plantilla: productos, posts, categorías…) para analizar
// solo una muestra de cada grupo. Las páginas únicas (home, contacto, nosotros…) se analizan todas.

/** Máximo de páginas que se analizan por grupo; los grupos de este tamaño o menos van completos. */
export const SAMPLE_SIZE = 3;

export interface TemplateGroup {
  key: string;
  /** Texto para mostrar: "/productos/" o "product-sitemap.xml". */
  label: string;
  urls: string[];
  /** Las páginas que se analizan (repartidas: primera, del medio, última). */
  sample: string[];
}

/** Lo que representa cada muestra analizada; se guarda con el análisis. */
export interface SampleInfo { key: string; label: string; total: number; urls: string[] }

const segments = (url: string): string[] => {
  try { return decodeURI(new URL(url).pathname).split('/').filter(Boolean); } catch { return []; }
};

/**
 * Sub-sitemaps de contenido repetitivo (Yoast, Rank Math, núcleo de WordPress…). Los de páginas
 * ("page-sitemap.xml", "wp-sitemap-posts-page-1.xml") y los sitemaps únicos ("sitemap.xml") no cuentan.
 */
function repetitiveSitemap(file: string | undefined): string | null {
  if (!file) return null;
  const f = file.toLowerCase();
  if (/(^|[-_])pages?([-_]|\d|\.xml)/.test(f) || /wp-sitemap-posts-page-/.test(f)) return null;
  if (/^wp-sitemap-(posts|taxonomies|users)-/.test(f)) return f.replace(/-\d+\.xml$/, '');
  if (/(post|product|producto|portfolio|categor|cat|tag|taxonom|author|blog|news|noticia|articulo|article)/.test(f)) {
    return f.replace(/\d*\.xml$/, '').replace(/[-_]$/, '');
  }
  return null;
}

/** Reparte k elementos a lo largo de la lista (incluye el primero y el último). */
function spread<T>(list: T[], k: number): T[] {
  if (list.length <= k) return list;
  const idx = new Set(Array.from({ length: k }, (_, i) => Math.round((i * (list.length - 1)) / (k - 1))));
  return [...idx].map((i) => list[i]);
}

/**
 * Agrupa por plantilla:
 * - URLs con 2+ niveles (/productos/x/, /blog/y/) por su primera carpeta (años como /2024/… juntos).
 * - URLs de un nivel que vienen de un sub-sitemap de contenido (posts o productos sin carpeta) por ese sitemap.
 * Solo se muestrean los grupos con más de SAMPLE_SIZE páginas; el resto queda como páginas únicas.
 */
export function groupTemplates(urls: string[], sitemapOf?: Record<string, string>): { singles: string[]; groups: TemplateGroup[] } {
  const byKey = new Map<string, { label: string; urls: string[] }>();
  for (const u of urls) {
    const seg = segments(u);
    let key: string | null = null;
    let label = '';
    if (seg.length >= 2) {
      const first = /^\d{4}$/.test(seg[0]) ? 'AAAA' : seg[0];
      key = `path:${first}`;
      label = first === 'AAAA' ? '/AAAA/… (posts por fecha)' : `/${first}/`;
    } else if (seg.length === 1) {
      const sm = repetitiveSitemap(sitemapOf?.[u]);
      if (sm) { key = `sitemap:${sm}`; label = sitemapOf![u]; }
    }
    if (!key) continue;
    const g = byKey.get(key) ?? { label, urls: [] };
    g.urls.push(u);
    byKey.set(key, g);
  }

  const groups: TemplateGroup[] = [];
  const grouped = new Set<string>();
  for (const [key, g] of byKey) {
    if (g.urls.length <= SAMPLE_SIZE) continue;
    groups.push({ key, label: g.label, urls: g.urls, sample: spread(g.urls, SAMPLE_SIZE) });
    g.urls.forEach((u) => grouped.add(u));
  }
  groups.sort((a, b) => b.urls.length - a.urls.length);
  return { singles: urls.filter((u) => !grouped.has(u)), groups };
}
