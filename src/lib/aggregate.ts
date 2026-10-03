import type { PageResult } from '@/hooks/use-analysis';
import { pagePath, scoreRating } from './format';
import { CATEGORIES, type CategoryId, type Strategy } from './types';

export type DeviceMode = Strategy | 'both';
export const devicesOf = (m: DeviceMode): Strategy[] => (m === 'both' ? ['mobile', 'desktop'] : [m]);

type Results = Record<string, PageResult>;

export interface Dist { good: number; avg: number; poor: number; n: number }

/** Promedio de score por categoría en un dispositivo (solo páginas con dato). */
export function avgScore(urls: string[], results: Results, s: Strategy, cat: CategoryId): { avg: number | null; n: number } {
  const v = urls.map((u) => results[u]?.[s]?.scores[cat]).filter((x): x is number => x != null);
  return { avg: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null, n: v.length };
}

/** Puntaje general = promedio de los promedios de las 4 categorías. */
export function overallScore(urls: string[], results: Results, s: Strategy): number | null {
  const a = CATEGORIES.map((c) => avgScore(urls, results, s, c).avg).filter((x): x is number => x != null);
  return a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
}

/** Cuántas páginas caen en verde / naranja / rojo (suma los dispositivos pedidos). */
export function distribution(urls: string[], results: Results, devices: Strategy[], cat: CategoryId): Dist {
  const d: Dist = { good: 0, avg: 0, poor: 0, n: 0 };
  for (const u of urls) for (const s of devices) {
    const sc = results[u]?.[s]?.scores[cat];
    if (sc == null) continue;
    d[scoreRating(sc)]++;
    d.n++;
  }
  return d;
}

export interface PageScoreRow { url: string; page: string; mobile: number | null; desktop: number | null }

/** Rendimiento por página, de peor a mejor (por mobile; si no hay, por desktop). */
export function pageScores(urls: string[], results: Results, cat: CategoryId): PageScoreRow[] {
  return urls
    .map((url) => ({
      url, page: pagePath(url),
      mobile: results[url]?.mobile?.scores[cat] ?? null,
      desktop: results[url]?.desktop?.scores[cat] ?? null,
    }))
    .filter((r) => r.mobile != null || r.desktop != null)
    .sort((a, b) => (a.mobile ?? a.desktop ?? 999) - (b.mobile ?? b.desktop ?? 999));
}

// ── Problemas globales ──────────────────────────────────────────────
export interface Agg { pages: number; total: number; avgMs: number; avgBytes: number }

export interface GlobalRow {
  key: string;
  category: CategoryId;
  /** Nombre del problema (en español). */
  name: string;
  /** Archivo concreto (solo en la lista B). */
  file?: string;
  per: Partial<Record<Strategy, Agg>>;
}

export interface FcpStat { avg: number | null; slow: number; n: number }

export interface GlobalReport {
  /** A) problemas que se repiten, por número de páginas afectadas */
  problems: GlobalRow[];
  /** B) archivos concretos que aparecen en más páginas */
  files: GlobalRow[];
  fcp: Partial<Record<Strategy, FcpStat>>;
  totals: Partial<Record<Strategy, number>>;
}

export function buildGlobal(urls: string[], results: Results, devices: Strategy[]): GlobalReport {
  const problems = new Map<string, GlobalRow>();
  const files = new Map<string, GlobalRow>();
  const sums = new Map<string, { ms: number; bytes: number }>(); // `${s}|${key}`
  const fcp: GlobalReport['fcp'] = {};
  const totals: GlobalReport['totals'] = {};

  const bump = (map: Map<string, GlobalRow>, key: string, base: Omit<GlobalRow, 'per' | 'key'>, s: Strategy, total: number, ms: number, bytes: number) => {
    const row = map.get(key) ?? { key, ...base, per: {} };
    const agg = row.per[s] ?? { pages: 0, total, avgMs: 0, avgBytes: 0 };
    agg.pages++;
    const acc = sums.get(`${s}|${key}`) ?? { ms: 0, bytes: 0 };
    acc.ms += ms; acc.bytes += bytes;
    sums.set(`${s}|${key}`, acc);
    agg.avgMs = acc.ms / agg.pages; agg.avgBytes = acc.bytes / agg.pages;
    row.per[s] = agg;
    map.set(key, row);
  };

  for (const s of devices) {
    const pages = urls.filter((u) => results[u]?.[s]);
    totals[s] = pages.length;
    for (const u of pages) {
      for (const is of results[u][s]!.issues) {
        bump(problems, is.id, { category: is.category, name: is.name }, s, pages.length, is.ms, is.bytes);
        for (const r of is.resources) {
          // En a11y/SEO los "recursos" son selectores de elementos; solo se agrupan archivos de rendimiento.
          if (is.category !== 'performance') continue;
          bump(files, `${is.id}|${r.name}`, { category: is.category, name: is.name, file: r.name }, s, pages.length, r.ms, r.bytes);
        }
      }
    }
    const f = pages.map((u) => results[u][s]!.metrics.fcp).filter((v): v is number => v != null);
    fcp[s] = { avg: f.length ? f.reduce((a, b) => a + b, 0) / f.length : null, slow: f.filter((v) => v > 1800).length, n: f.length };
  }

  // Los totales por fila deben reflejar el total del dispositivo aunque la fila no aparezca en todos.
  const finish = (map: Map<string, GlobalRow>) => {
    const rows = [...map.values()];
    const share = (r: GlobalRow) => Math.max(...devices.map((s) => (r.per[s] ? r.per[s]!.pages / (totals[s] || 1) : 0)));
    const save = (r: GlobalRow) => Math.max(...devices.map((s) => (r.per[s] ? r.per[s]!.avgMs + (r.per[s]!.avgBytes / 1024) * 3 : 0)));
    return rows.sort((a, b) => share(b) - share(a) || save(b) - save(a));
  };
  return { problems: finish(problems), files: finish(files), fcp, totals };
}
