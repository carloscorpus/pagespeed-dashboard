import type { CategoryId } from './types';

export type Rating = 'good' | 'avg' | 'poor';

export const CATEGORY_LABEL: Record<CategoryId, string> = {
  performance: 'Rendimiento',
  accessibility: 'Accesibilidad',
  'best-practices': 'Prácticas recomendadas',
  seo: 'SEO',
};
export const CATEGORY_SHORT: Record<CategoryId, string> = {
  performance: 'Rend.',
  accessibility: 'Accesib.',
  'best-practices': 'Práct.',
  seo: 'SEO',
};

/** Colores de Lighthouse: verde ≥ 90, naranja 50–89, rojo < 50. */
export const scoreRating = (s: number): Rating => (s >= 90 ? 'good' : s >= 50 ? 'avg' : 'poor');

export const RATING_CLASS: Record<Rating, string> = {
  good: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  avg: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  poor: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

// Umbrales de métricas (los mismos que el script): [verde hasta, naranja hasta]
export interface MetricDef {
  key: 'lcp' | 'fcp' | 'tbt' | 'cls' | 'si';
  label: string;
  hint: string;
  good: number;
  avg: number;
  /** valor crudo (ms o adimensional) → texto */
  fmt: (v: number) => string;
}
export const METRIC_DEFS: MetricDef[] = [
  { key: 'fcp', label: 'FCP', hint: 'Primer contenido visible', good: 1800, avg: 3000, fmt: (v) => `${(v / 1000).toFixed(1)} s` },
  { key: 'lcp', label: 'LCP', hint: 'Contenido principal', good: 2500, avg: 4000, fmt: (v) => `${(v / 1000).toFixed(1)} s` },
  { key: 'tbt', label: 'TBT', hint: 'Tiempo de bloqueo', good: 200, avg: 600, fmt: (v) => `${Math.round(v)} ms` },
  { key: 'cls', label: 'CLS', hint: 'Estabilidad visual', good: 0.1, avg: 0.25, fmt: (v) => v.toFixed(3) },
  { key: 'si', label: 'Speed Index', hint: 'Velocidad de carga visual', good: 3400, avg: 5800, fmt: (v) => `${(v / 1000).toFixed(1)} s` },
];
export const metricRating = (m: MetricDef, v: number): Rating => (v <= m.good ? 'good' : v <= m.avg ? 'avg' : 'poor');

export const fmtKB = (b: number) => `${Math.round(b / 1024)} KB`;

/** "276 KB · 850 ms" según lo que exista. */
export function fmtSaving(ms: number, bytes: number): string {
  return [bytes >= 1024 && fmtKB(bytes), ms > 0 && `${Math.round(ms)} ms`].filter(Boolean).join(' · ');
}

export const pagePath = (url: string): string => {
  try { return decodeURI(new URL(url).pathname) || '/'; } catch { return url; }
};

// ── Origen de un recurso ──
// Los nombres de recurso vienen de psi-extract: ruta si es del mismo dominio ("/wp-content/…"),
// "host/ruta" si es externo ("fonts.googleapis.com/css2") o un selector/texto si es un elemento del DOM.
export type Origin = 'project' | 'plugin' | 'core' | 'third';

export const ORIGIN_LABEL: Record<Exclude<Origin, 'project'>, string> = {
  plugin: 'plugin/caché',
  core: 'núcleo de WordPress',
  third: 'tercero',
};

/** De dónde sale un recurso, por su ruta. null si no es un archivo (selector, texto). */
export function resourceOrigin(name: string): Origin | null {
  if (name.startsWith('/')) {
    if (/^\/wp-content\/(plugins|cache|mu-plugins)\//.test(name)) return 'plugin';
    // Archivos que generan los plugins de optimización (combinados/minificados) dentro de uploads.
    if (/^\/wp-content\/uploads\/[^/]*(optimi[sz]er|cache|autoptimize|litespeed|wp-rocket|wphb|w3tc|combined|minify)/i.test(name)) return 'plugin';
    if (/^\/wp-includes\//.test(name)) return 'core';
    return 'project';
  }
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(name)) return 'third';
  return null;
}

/** Carpeta del tema de WordPress deducida de las rutas de los recursos (la más frecuente). */
export function themePath(names: string[]): string | null {
  const count = new Map<string, number>();
  for (const n of names) {
    const m = /^\/wp-content\/themes\/[^/]+\//.exec(n);
    if (m) count.set(m[0], (count.get(m[0]) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Bundles con hash en el nombre (Vite, Next): hay que editar la fuente y reconstruir, no el archivo compilado. */
export const isHashedBundle = (name: string) =>
  /\/(dist|build)\/assets\/.+-[A-Za-z0-9_-]{8}\.(css|js)$/.test(name) || /\/_next\/static\/.+\.(css|js)$/.test(name);

export const psiLink =(url: string) => `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}`;

/** Extrae URLs de texto libre (una por línea, # = comentario). Acepta dominios sin esquema. */
export function parseUrlList(text: string): string[] {
  const out = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    for (const m of t.matchAll(/https?:\/\/[^\s,;"'<>]+/gi)) out.add(m[0]);
    if (!/https?:\/\//i.test(t) && /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) out.add(`https://${t}`);
  }
  return [...out];
}
