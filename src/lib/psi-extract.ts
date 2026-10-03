/* eslint-disable @typescript-eslint/no-explicit-any -- el JSON de Lighthouse no tiene tipos estables */
import { ISSUES } from './issues-dict';
import { CATEGORIES, type CategoryId, type Issue, type LcpElement, type PsiSummary, type Resource, type Strategy } from './types';

type Audits = Record<string, any>;

// Agregados que no son accionables por archivo: se omiten del listado.
const SKIP_AUDITS = new Set(['mainthread-work-breakdown', 'network-dependency-tree-insight']);
const NOT_FAILING_MODES = new Set(['notApplicable', 'informative', 'manual', 'error']);

/** Nombre corto: ruta si es del mismo host, host+ruta si es externo. Sin query string. */
function resName(u: string, host: string): string {
  try {
    const x = new URL(u);
    return (x.host === host ? '' : x.host) + decodeURI(x.pathname) || u;
  } catch { return u; }
}

/** Recorre details.items recursivamente y agrega por nombre. No baja a subItems (duplicarían el ahorro). */
function collectResources(node: any, host: string, acc = new Map<string, Resource>()): Map<string, Resource> {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) { node.forEach((n) => collectResources(n, host, acc)); return acc; }
  const url = node.url || node.source?.url;
  const label = url ? resName(url, host) : (node.node?.selector || node.node?.nodeLabel || null);
  if (label && (node.wastedMs != null || node.wastedBytes != null || node.reflowTime != null || node.totalBytes != null || node.node)) {
    const cur = acc.get(label) || { name: label, ms: 0, bytes: 0, size: 0 };
    cur.ms += node.wastedMs ?? node.reflowTime ?? 0;
    cur.bytes += node.wastedBytes ?? 0;
    cur.size += node.totalBytes ?? 0;
    acc.set(label, cur);
    return acc;
  }
  if (node.items) collectResources(node.items, host, acc);
  return acc;
}

/** Elementos afectados en accesibilidad/SEO/prácticas (sin ahorro): selector, url o descripción. */
function collectAffected(items: any, host: string, out: string[] = []): string[] {
  if (!items || out.length >= 40) return out;
  if (Array.isArray(items)) { items.forEach((i) => collectAffected(i, host, out)); return out; }
  if (typeof items !== 'object') return out;
  const name =
    items.node?.selector || items.node?.nodeLabel || items.node?.snippet ||
    (items.url ? resName(items.url, host) : null) ||
    (items.source?.url ? resName(items.source.url, host) : null) ||
    items.sourceLocation?.url || items.source?.snippet ||
    (typeof items.description === 'string' ? items.description : null) ||
    (typeof items.label === 'string' ? items.label : null);
  if (name) out.push(String(name).slice(0, 160));
  else if (items.items) collectAffected(items.items, host, out);
  return out;
}

function perfIssue(id: string, au: any, host: string): Issue | null {
  const d = au.details || {};
  const resources = [...collectResources(d.items, host).values()]
    .filter((r) => r.ms > 0 || r.bytes > 0)
    .sort((x, y) => (y.bytes / 1024 * 3 + y.ms) - (x.bytes / 1024 * 3 + x.ms));
  const ms = Math.max(0, ...['FCP', 'LCP', 'TBT'].map((k) => au.metricSavings?.[k] ?? 0), d.overallSavingsMs ?? 0);
  const bytes: number = d.overallSavingsBytes ?? resources.reduce((s, r) => s + r.bytes, 0);
  // lcp-discovery no trae ahorro ni archivos: se conserva porque el problema es la prioridad del LCP.
  if (ms <= 0 && bytes <= 0 && !resources.length && id !== 'lcp-discovery-insight') return null;
  const meta = ISSUES[id];
  return {
    id, category: 'performance',
    name: meta?.n || au.title,
    fix: meta?.f || 'Revisa el detalle de este problema en PageSpeed Insights.',
    ms, bytes, resources: resources.slice(0, 40),
    // Orden: ahorro en ms; si solo hay bytes, ~3 ms por KB.
    sortKey: ms > 0 ? ms : bytes / 1024 * 3,
  };
}

function otherIssue(id: string, au: any, category: CategoryId, weight: number, host: string): Issue {
  const meta = ISSUES[id];
  const resources = [...new Set(collectAffected(au.details?.items, host))]
    .slice(0, 40).map((name) => ({ name, ms: 0, bytes: 0, size: 0 }));
  return {
    id, category,
    name: meta?.n || au.title,
    fix: meta?.f || au.description?.replace(/\s*\[.*?\]\(.*?\)\.?/g, '').trim() || 'Revisa el detalle de este problema en PageSpeed Insights.',
    ms: 0, bytes: 0, resources, sortKey: weight,
  };
}

function extractLcp(a: Audits): LcpElement | null {
  const disc: any[] = a['lcp-discovery-insight']?.details?.items || [];
  const brk: any[] = a['lcp-breakdown-insight']?.details?.items || [];
  const node = [...disc, ...brk].find((i) => i.type === 'node');
  if (!node) return null;
  const chk = disc.find((i) => i.type === 'checklist')?.items;
  const flags: string[] = [];
  if (chk?.eagerlyLoaded?.value === false) flags.push('tiene lazy load');
  if (chk?.priorityHinted?.value === false) flags.push('falta fetchpriority=high');
  if (chk?.requestDiscoverable?.value === false) flags.push('no se descubre en el HTML');
  return { text: node.selector || node.nodeLabel || node.snippet || '', flags };
}

/** Convierte lighthouseResult en un resumen compacto (los JSON completos pesan cientos de KB). */
export function summarize(lh: any, url: string, strategy: Strategy): PsiSummary {
  const a: Audits = lh.audits;
  const host = new URL(url).host;
  const num = (id: string): number | null => a[id]?.numericValue ?? null;

  const scores = {} as Record<CategoryId, number | null>;
  const issues: Issue[] = [];
  for (const cat of CATEGORIES) {
    const c = lh.categories?.[cat];
    scores[cat] = c?.score == null ? null : Math.round(c.score * 100);
    for (const ref of c?.auditRefs || []) {
      const au = a[ref.id];
      if (!au || SKIP_AUDITS.has(ref.id)) continue;
      if (au.score == null || au.score >= (cat === 'performance' ? 0.9 : 1)) continue;
      if (NOT_FAILING_MODES.has(au.scoreDisplayMode)) continue;
      const issue = cat === 'performance' ? perfIssue(ref.id, au, host) : otherIssue(ref.id, au, cat, ref.weight ?? 0, host);
      if (issue) issues.push(issue);
    }
  }
  issues.sort((x, y) => CATEGORIES.indexOf(x.category) - CATEGORIES.indexOf(y.category) || y.sortKey - x.sortKey);

  const lcpEl = extractLcp(a);
  const lcpIssue = issues.find((i) => i.id === 'lcp-discovery-insight');
  if (lcpIssue && lcpEl) {
    lcpIssue.resources = [{ name: `${lcpEl.text} (${lcpEl.flags.join(', ') || 'revisar prioridad'})`, ms: 0, bytes: 0, size: 0 }];
  }

  return {
    url, strategy,
    fetchedAt: lh.fetchTime || new Date().toISOString(),
    lighthouseVersion: lh.lighthouseVersion ?? null,
    scores,
    metrics: {
      lcp: num('largest-contentful-paint'), tbt: num('total-blocking-time'),
      cls: num('cumulative-layout-shift'), fcp: num('first-contentful-paint'), si: num('speed-index'),
    },
    ttfb: num('server-response-time') ?? a['document-latency-insight']?.details?.debugData?.serverResponseTime ?? null,
    lcpEl,
    issues,
  };
}
