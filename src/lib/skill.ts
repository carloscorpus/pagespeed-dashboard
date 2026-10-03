import type { PageResult } from '@/hooks/use-analysis';
import {
  CATEGORY_LABEL, METRIC_DEFS, ORIGIN_LABEL, fmtKB, isHashedBundle, pagePath, resourceOrigin, themePath,
} from './format';
import { fixText, isServerIssue } from './issues-dict';
import type { SampleInfo } from './sampling';
import { CATEGORIES, type CategoryId, type Issue, type PsiSummary, type Strategy } from './types';

/** Un problema o archivo es "global" si aparece en ≥ 80% de las páginas (y hay al menos 3 páginas). */
export const GLOBAL_SHARE = 0.8;
export const GLOBAL_MIN_PAGES = 3;

const DEVICES: Strategy[] = ['mobile', 'desktop'];
const DEVICE_LABEL: Record<Strategy, string> = { mobile: 'Mobile', desktop: 'Desktop' };
const SKILL_DIR = '.claude/skills/pagespeed-fixes';

export interface SkillFile { path: string; content: string }
export interface SkillMeta { host: string; date: string; samples?: SampleInfo[] }

type Results = Record<string, PageResult>;
type DeviceData = { url: string; s: PsiSummary };

// ── utilidades ──
const saving = (ms: number, bytes: number) =>
  [bytes >= 1024 && fmtKB(bytes), ms > 0 && `${Math.round(ms)} ms`].filter(Boolean).join(' · ');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const code = (s: string) => `\`${s.replace(/`/g, "'")}\``;
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'grupo';

// ── agrupación por ruta ──
export interface Groups { home: string[]; groups: Map<string, string[]>; general: string[]; sampled: Map<string, SampleInfo> }

const RESERVED_SLUGS = ['home', 'global', 'paginas-generales', 'skill'];

/**
 * Home sola; los grupos analizados por muestra (páginas repetitivas), cada uno en su archivo; rutas con el
 * mismo primer segmento (padre + hijas, o solo hijas) en un archivo; el resto, juntas.
 */
export function groupPages(urls: string[], samples: SampleInfo[] = []): Groups {
  const home: string[] = [];
  const bySeg = new Map<string, string[]>();
  const groups = new Map<string, string[]>();
  const sampled = new Map<string, SampleInfo>();
  const inSample = new Map(samples.flatMap((g) => g.urls.map((u) => [u, g] as const)));
  for (const g of samples) {
    const pages = g.urls.filter((u) => urls.includes(u));
    if (!pages.length) continue;
    let slug = slugify(g.label.replace(/\.xml$/, ''));
    if (RESERVED_SLUGS.includes(slug) || groups.has(slug)) slug += '-grupo';
    groups.set(slug, pages);
    sampled.set(slug, g);
  }
  for (const u of urls) {
    if (inSample.has(u)) continue;
    const path = pagePath(u);
    if (path === '/') { home.push(u); continue; }
    const seg = path.split('/').filter(Boolean)[0];
    bySeg.set(seg, [...(bySeg.get(seg) ?? []), u]);
  }
  const general: string[] = [];
  for (const [seg, pages] of bySeg) {
    if (pages.length >= 2) {
      let slug = slugify(seg);
      if (RESERVED_SLUGS.includes(slug)) slug += '-grupo';
      if (groups.has(slug)) slug += '-paginas'; // ya existe un grupo muestreado con ese nombre
      groups.set(slug, pages);
    } else general.push(...pages);
  }
  return { home, groups, general, sampled };
}

// ── lo global ──
interface GlobalSet {
  total: number;
  active: boolean;
  issueIds: Map<string, { pages: number; issue: Issue; ms: number; bytes: number }>;
  files: Map<string, { id: string; problem: string; file: string; pages: number; ms: number; bytes: number }>;
}

function computeGlobal(data: DeviceData[]): GlobalSet {
  const total = data.length;
  const g: GlobalSet = { total, active: total >= GLOBAL_MIN_PAGES, issueIds: new Map(), files: new Map() };
  if (!g.active) return g;
  const ids = new Map<string, { pages: number; issue: Issue; ms: number; bytes: number }>();
  const files = new Map<string, { id: string; problem: string; file: string; pages: number; ms: number; bytes: number }>();
  for (const { s } of data) {
    for (const is of s.issues) {
      const e = ids.get(is.id) ?? { pages: 0, issue: is, ms: 0, bytes: 0 };
      e.pages++; e.ms += is.ms; e.bytes += is.bytes;
      ids.set(is.id, e);
      for (const r of is.resources) {
        const k = `${is.id}|${r.name}`;
        const f = files.get(k) ?? { id: is.id, problem: is.name, file: r.name, pages: 0, ms: 0, bytes: 0 };
        f.pages++; f.ms += r.ms; f.bytes += r.bytes;
        files.set(k, f);
      }
    }
  }
  for (const [k, v] of ids) if (v.pages / total >= GLOBAL_SHARE) g.issueIds.set(k, v);
  for (const [k, v] of files) if (v.pages / total >= GLOBAL_SHARE) g.files.set(k, v);
  return g;
}

// ── agregación de un grupo ──
interface AggIssue {
  issue: Issue;
  pages: Set<string>;
  ms: number;
  bytes: number;
  resources: Map<string, { pages: number; ms: number; bytes: number }>;
}

/** Problemas propios del grupo: se quita lo que ya cubre _global.md. */
function aggregateGroup(data: DeviceData[], g: GlobalSet): Map<string, AggIssue> {
  const out = new Map<string, AggIssue>();
  for (const { url, s } of data) {
    for (const is of s.issues) {
      if (g.issueIds.has(is.id) && is.resources.length === 0) continue; // transversal sin archivos: va en _global
      const remaining = is.resources.filter((r) => !g.files.has(`${is.id}|${r.name}`));
      if (is.resources.length > 0 && remaining.length === 0) continue; // todos sus archivos son globales
      const a = out.get(is.id) ?? { issue: is, pages: new Set<string>(), ms: 0, bytes: 0, resources: new Map() };
      a.pages.add(url); a.ms += is.ms; a.bytes += is.bytes;
      for (const r of remaining) {
        const e = a.resources.get(r.name) ?? { pages: 0, ms: 0, bytes: 0 };
        e.pages++; e.ms += r.ms; e.bytes += r.bytes;
        a.resources.set(r.name, e);
      }
      out.set(is.id, a);
    }
  }
  return out;
}

const orderIssues = (m: Map<string, AggIssue>) =>
  [...m.values()].sort((x, y) =>
    CATEGORIES.indexOf(x.issue.category) - CATEGORIES.indexOf(y.issue.category) ||
    (y.ms / y.pages.size + (y.bytes / y.pages.size / 1024) * 3) - (x.ms / x.pages.size + (x.bytes / x.pages.size / 1024) * 3));

// ── textos ──
const VERIFY_CAT: Record<CategoryId, string> = {
  performance: 'Volver a medir: el audit ya no aparece (o su ahorro estimado baja a ~0) y no empeora ninguna métrica.',
  accessibility: 'Volver a medir: el audit deja de fallar en Accesibilidad y el puntaje sube.',
  'best-practices': 'Volver a medir: el audit deja de fallar en Prácticas recomendadas.',
  seo: 'Volver a medir: el audit deja de fallar en SEO.',
};

/** Nota por origen: qué hacer (o no hacer) con un recurso que no es código del proyecto. */
const ORIGIN_NOTE = {
  plugin: '_plugin/caché: no es código del proyecto, no lo edites (ver "Fuera del código del proyecto")_',
  core: '_núcleo de WordPress: no lo edites; si no se usa, desencólalo o difiérelo desde el tema_',
  third: '_tercero: no se edita el archivo; cambia cómo lo carga el proyecto (local, diferido o eliminado)_',
} as const;

/** Sufijo de un recurso en el skill: origen si no es del proyecto; aviso si es un bundle con hash. */
function resourceNote(name: string): string {
  const o = resourceOrigin(name);
  if (o && o !== 'project') return ` — ${ORIGIN_NOTE[o]}`;
  return isHashedBundle(name) ? ' — _bundle con hash: edita la fuente y reconstruye_' : '';
}

const scoreLine = (s: PsiSummary | undefined) =>
  s ? CATEGORIES.map((c) => s.scores[c] ?? '–').join('·') : 'sin datos';

function metricTable(sums: PsiSummary[]): string {
  const rows = METRIC_DEFS.map((m) => {
    const v = avg(sums.map((s) => s.metrics[m.key]).filter((x): x is number => x != null));
    const meta = m.key === 'cls' ? `≤ ${m.good}` : m.key === 'tbt' ? `≤ ${m.good} ms` : `≤ ${m.good / 1000} s`;
    return `| ${m.label} | ${v == null ? '—' : m.fmt(v)} | ${meta} |`;
  });
  const ttfb = avg(sums.map((s) => s.ttfb).filter((x): x is number => x != null));
  return ['| Métrica (promedio) | Actual | Meta |', '|---|---|---|', ...rows,
    `| TTFB | ${ttfb == null ? '—' : `${Math.round(ttfb)} ms`} | ≤ 800 ms |`].join('\n');
}

function issueBlock(a: AggIssue, groupPages: number, opts: { resourceLimit: number }): string {
  const { issue } = a;
  const n = a.pages.size;
  const sv = saving(a.ms / n, a.bytes / n);
  const lines = [
    `#### ${issue.name} — ${CATEGORY_LABEL[issue.category]}`,
    `- **Alcance:** ${n}/${groupPages} páginas del grupo${sv ? ` · ahorro promedio ${sv}` : ''}`,
    `- **Cómo corregirlo:** ${fixText(issue)}`,
  ];
  if (a.resources.size) {
    const list = [...a.resources.entries()]
      .sort((x, y) => (y[1].bytes / 1024 * 3 + y[1].ms) - (x[1].bytes / 1024 * 3 + x[1].ms) || y[1].pages - x[1].pages)
      .slice(0, opts.resourceLimit);
    lines.push(`- **${issue.category === 'performance' ? 'Recursos' : 'Elementos'} afectados** (${a.resources.size}${a.resources.size > list.length ? `, se muestran ${list.length}` : ''}):`);
    for (const [name, r] of list) {
      const sv2 = saving(r.ms / r.pages, r.bytes / r.pages);
      lines.push(`  - ${code(name)}${r.pages > 1 ? ` — en ${r.pages} páginas` : ''}${sv2 ? ` — ${sv2}` : ''}${resourceNote(name)}`);
    }
  }
  lines.push(`- **Verificar:** ${VERIFY_CAT[issue.category]}`);
  return lines.join('\n');
}

// ── "Fuera del código del proyecto": servidor/hosting y archivos de plugins o caché ──
interface OutsideServer { issue: Issue; pages: number; total: number; ms: number; bytes: number }
interface OutsideFile { file: string; problem: string; pages: number; total: number }

function outsideSection(server: OutsideServer[], files: OutsideFile[]): string[] {
  if (!server.length && !files.length) return [];
  const out = [
    '### Fuera del código del proyecto',
    '',
    '_No se corrige en el repo: no edites estos archivos ni intentes resolverlo con código. Añádelo a la lista **"Acciones manuales"** para el servidor, el hosting o el panel._',
    '',
  ];
  for (const e of server) {
    const sv = saving(e.ms / e.pages, e.bytes / e.pages);
    out.push(`- **${e.issue.name}** (${e.pages}/${e.total} páginas${sv ? ` · ahorro promedio ${sv}` : ''}): ${fixText(e.issue)}`);
  }
  for (const f of files) {
    out.push(`- ${code(f.file)} — ${f.problem} (${f.pages}/${f.total} páginas) — _${ORIGIN_LABEL.plugin}_`);
  }
  out.push('');
  return out;
}

// ── archivos ──
function globalFile(gs: Record<Strategy, GlobalSet>, dataBy: Record<Strategy, DeviceData[]>, meta: SkillMeta): string {
  const out: string[] = [
    `# Problemas globales — ${meta.host}`,
    '',
    `Medición del ${meta.date}. Aquí está lo que aparece en **≥ ${GLOBAL_SHARE * 100}% de las páginas** (con un mínimo de ${GLOBAL_MIN_PAGES} páginas analizadas).`,
    'Se corrige **una sola vez** (normalmente en el código base: layout, header/footer, build o funciones del tema) y mejora muchas páginas a la vez. **Empieza por aquí.**',
    '',
  ];
  let any = false;
  for (const s of DEVICES) {
    const g = gs[s];
    out.push(`## ${DEVICE_LABEL[s]}`, '');
    if (!g.active) { out.push(`_Hay solo ${g.total} página(s) con datos en ${DEVICE_LABEL[s]}; no se calculan problemas globales._`, ''); continue; }
    const issues = [...g.issueIds.values()].sort((x, y) =>
      CATEGORIES.indexOf(x.issue.category) - CATEGORIES.indexOf(y.issue.category) ||
      (y.ms / y.pages + (y.bytes / y.pages / 1024) * 3) - (x.ms / x.pages + (x.bytes / x.pages / 1024) * 3));
    const files = [...g.files.values()].sort((x, y) => y.pages - x.pages || (y.ms / y.pages + y.bytes / y.pages / 1024 * 3) - (x.ms / x.pages + x.bytes / x.pages / 1024 * 3));
    if (!issues.length) { out.push('_No hay problemas que se repitan en casi todas las páginas._', ''); continue; }
    any = true;
    const fcp = avg(dataBy[s].map((d) => d.s.metrics.fcp).filter((x): x is number => x != null));
    out.push(`FCP promedio: **${fcp == null ? '—' : `${(fcp / 1000).toFixed(1)} s`}** (meta ≤ 1.8 s) · ${g.total} páginas con datos.`, '');
    const codeIssues = issues.filter((x) => !isServerIssue(x.issue.id));
    if (codeIssues.length) out.push('### Problemas que se repiten', '');
    for (const e of codeIssues) {
      const is = e.issue;
      const sv = saving(e.ms / e.pages, e.bytes / e.pages);
      out.push(
        `#### ${is.name} — ${CATEGORY_LABEL[is.category]} (${e.pages}/${g.total} páginas)`,
        `- **Ahorro promedio:** ${sv || '—'}`,
        `- **Cómo corregirlo:** ${fixText(is)}`,
        `- **Verificar:** ${VERIFY_CAT[is.category]}`,
        '',
      );
    }
    const ownFiles = files.filter((f) => resourceOrigin(f.file) !== 'plugin');
    if (ownFiles.length) {
      out.push('### Archivos y elementos que se repiten', '', '| Archivo / elemento | Origen | Problema | Páginas | Ahorro prom. |', '|---|---|---|---|---|');
      for (const f of ownFiles.slice(0, 25)) {
        const o = resourceOrigin(f.file);
        const origin = o == null ? '—' : o === 'project' ? (isHashedBundle(f.file) ? 'proyecto (bundle con hash)' : 'proyecto') : ORIGIN_LABEL[o];
        out.push(`| ${code(f.file)} | ${origin} | ${f.problem} | ${f.pages}/${g.total} | ${saving(f.ms / f.pages, f.bytes / f.pages) || '—'} |`);
      }
      out.push('');
    }
    out.push(...outsideSection(
      issues.filter((x) => isServerIssue(x.issue.id)).map((x) => ({ ...x, total: g.total })),
      files.filter((f) => resourceOrigin(f.file) === 'plugin').map((f) => ({ ...f, total: g.total })),
    ));
  }
  if (!any) out.push('> Ningún problema supera el umbral global en esta medición. Pasa directamente a los archivos de cada grupo.', '');
  return out.join('\n');
}

function groupFile(
  title: string, intro: string, pages: string[], results: Results,
  gs: Record<Strategy, GlobalSet>, meta: SkillMeta,
): { content: string; ownIssues: number } {
  const out: string[] = [`# ${title}`, '', intro, '', `Medición del ${meta.date}.`, ''];
  out.push(`## Páginas (${pages.length})`, '', '| Página | Mobile (R·A·P·S) | Desktop (R·A·P·S) |', '|---|---|---|');
  for (const u of pages) out.push(`| [${pagePath(u)}](${u}) | ${scoreLine(results[u]?.mobile)} | ${scoreLine(results[u]?.desktop)} |`);
  out.push('', '_R = Rendimiento, A = Accesibilidad, P = Prácticas recomendadas, S = SEO._', '');
  out.push('> Lo que se repite en casi todo el sitio está en [_global.md](_global.md): corrígelo antes. Aquí solo aparece lo propio de este grupo.', '');

  let own = 0;
  for (const s of DEVICES) {
    const data = pages.filter((u) => results[u]?.[s]).map((u) => ({ url: u, s: results[u][s]! }));
    out.push(`## ${DEVICE_LABEL[s]}`, '');
    if (!data.length) { out.push('_Sin datos para este dispositivo._', ''); continue; }
    out.push(metricTable(data.map((d) => d.s)), '');
    const all = orderIssues(aggregateGroup(data, gs[s]));
    own += all.length;
    if (!all.length) { out.push('_Sin problemas propios: todo lo pendiente es global._', ''); continue; }
    const issues = all.filter((a) => !isServerIssue(a.issue.id));
    for (const cat of CATEGORIES) {
      const list = issues.filter((a) => a.issue.category === cat);
      if (!list.length) continue;
      out.push(`### ${CATEGORY_LABEL[cat]}`, '');
      for (const a of list) out.push(issueBlock(a, data.length, { resourceLimit: 8 }), '');
    }
    const pluginFiles = new Map<string, OutsideFile>();
    for (const a of issues) {
      for (const [file, r] of a.resources) {
        if (resourceOrigin(file) === 'plugin' && !pluginFiles.has(file)) {
          pluginFiles.set(file, { file, problem: a.issue.name, pages: r.pages, total: data.length });
        }
      }
    }
    out.push(...outsideSection(
      all.filter((a) => isServerIssue(a.issue.id))
        .map((a) => ({ issue: a.issue, pages: a.pages.size, total: data.length, ms: a.ms, bytes: a.bytes })),
      [...pluginFiles.values()],
    ));
  }
  return { content: out.join('\n'), ownIssues: own };
}

function dataFile(urls: string[], results: Results, meta: SkillMeta): string {
  const pages = urls.map((url) => {
    const r = results[url];
    const per = (s?: PsiSummary) => s && {
      scores: s.scores, metrics: s.metrics, ttfb: s.ttfb, lcpElement: s.lcpEl,
      issues: s.issues.map((i) => ({
        id: i.id, category: i.category, name: i.name, savingsMs: Math.round(i.ms), savingsBytes: Math.round(i.bytes),
        resources: i.resources.slice(0, 10).map((x) => ({ name: x.name, origin: resourceOrigin(x.name), ms: Math.round(x.ms), bytes: Math.round(x.bytes) })),
      })),
    };
    return { url, mobile: per(r?.mobile), desktop: per(r?.desktop), errors: r?.errors };
  });
  return JSON.stringify({ site: meta.host, date: meta.date, source: 'Google PageSpeed Insights API v5 (datos de laboratorio)', pages }, null, 2);
}

/** Genera el skill completo (SKILL.md + _global.md + un .md por grupo + datos). */
export function generateSkill(allUrls: string[], results: Results, meta: SkillMeta): SkillFile[] {
  const urls = allUrls.filter((u) => results[u]?.mobile || results[u]?.desktop);
  const noData = allUrls.filter((u) => !urls.includes(u));
  const dataBy = Object.fromEntries(DEVICES.map((s) => [s, urls.filter((u) => results[u]?.[s]).map((u) => ({ url: u, s: results[u][s]! }))])) as Record<Strategy, DeviceData[]>;
  const gs = Object.fromEntries(DEVICES.map((s) => [s, computeGlobal(dataBy[s])])) as Record<Strategy, GlobalSet>;
  const { home, groups, general, sampled } = groupPages(urls, meta.samples);

  const files: SkillFile[] = [];
  const index: { file: string; label: string; pages: number; issues: number }[] = [];
  const push = (name: string, label: string, pages: string[], title: string, intro: string) => {
    const { content, ownIssues } = groupFile(title, intro, pages, results, gs, meta);
    files.push({ path: `${SKILL_DIR}/${name}`, content });
    index.push({ file: name, label, pages: pages.length, issues: ownIssues });
  };

  files.push({ path: `${SKILL_DIR}/_global.md`, content: globalFile(gs, dataBy, meta) });
  const globalCount = DEVICES.reduce((n, s) => n + gs[s].issueIds.size, 0);
  index.push({ file: '_global.md', label: 'Todo el sitio', pages: urls.length, issues: globalCount });

  if (home.length) push('home.md', 'Home', home, `Home — ${meta.host}`, 'La home suele tener un hero y una estructura propios: se trata aparte.');
  for (const [slug, pages] of groups) {
    const sample = sampled.get(slug);
    if (sample) {
      push(`${slug}.md`, `${sample.label} (muestra ${pages.length} de ${sample.total})`, pages, `Grupo ${sample.label} — ${meta.host}`,
        `**Muestra de ${pages.length} de ${sample.total} páginas con la misma plantilla** (páginas repetitivas: productos, posts, categorías…). ` +
        'Corrige la **plantilla** o los componentes compartidos, no página por página: el cambio aplicará a todas. ' +
        'Lo que aparezca en una sola de las muestras puede venir del contenido de esa página (imágenes o textos subidos) y no de la plantilla.');
      continue;
    }
    const hasParent = pages.some((u) => pagePath(u).split('/').filter(Boolean).length === 1);
    push(`${slug}.md`, `/${slug}/`, pages, `Grupo /${slug}/ — ${meta.host}`,
      hasParent
        ? `Página padre \`/${slug}/\` y sus páginas hijas. Suelen compartir plantilla: un cambio en la plantilla las corrige a todas.`
        : `Páginas bajo \`/${slug}/\` (sin página padre en la lista). Suelen compartir plantilla.`);
  }
  if (general.length) {
    push('paginas-generales.md', 'Páginas sueltas', general, `Páginas generales — ${meta.host}`,
      'Páginas de primer nivel sin hijas (nosotros, contacto, legales…). Suelen compartir la plantilla de página estándar.');
  }

  // SKILL.md (índice)
  const overall = (s: Strategy, c: CategoryId) => avg(dataBy[s].map((d) => d.s.scores[c]).filter((x): x is number => x != null));
  const avgRow = (s: Strategy) => CATEGORIES.map((c) => { const v = overall(s, c); return v == null ? '—' : Math.round(v); }).join(' | ');
  const hashed = [...gs.mobile.files.values(), ...gs.desktop.files.values()].some((f) => isHashedBundle(f.file));
  const theme = themePath(urls.flatMap((u) => DEVICES.flatMap((s) => results[u]?.[s]?.issues.flatMap((i) => i.resources.map((r) => r.name)) ?? [])));
  const source = theme ? `el tema ${code(theme)}` : 'el tema o la carpeta de assets';
  const skill = [
    '---',
    'name: pagespeed-fixes',
    `description: Corrige en el código del proyecto los problemas de rendimiento, accesibilidad, prácticas recomendadas y SEO detectados por PageSpeed Insights en ${meta.host}. Úsalo cuando se pida aplicar las correcciones de PageSpeed, bajar el FCP/LCP o trabajar un grupo de páginas del sitio.`,
    '---',
    '',
    `# Correcciones de PageSpeed — ${meta.host}`,
    '',
    `Medición del ${meta.date} con la API oficial de Google PageSpeed Insights (datos de laboratorio: pueden variar unos puntos entre mediciones). ${urls.length} páginas analizadas.`,
    ...(meta.samples?.length
      ? ['', `Las páginas repetitivas se analizaron **por muestra** (misma plantilla): ${meta.samples.map((g) => `${g.label} ${g.urls.length} de ${g.total}`).join(' · ')}. En esos grupos, corrige la plantilla.`]
      : []),
    '',
    '| Puntaje promedio | Rendimiento | Accesibilidad | Prácticas | SEO |',
    '|---|---|---|---|---|',
    `| Mobile | ${avgRow('mobile')} |`,
    `| Desktop | ${avgRow('desktop')} |`,
    '',
    '## Cómo trabajar',
    '',
    `0. Antes de corregir, ubica en el repo de dónde sale cada archivo señalado (configuración del build, ${source}, componentes o plantillas). Las rutas de los recursos son las del sitio publicado: localiza su archivo fuente.`,
    '1. Lee [_global.md](_global.md) y corrige **primero** lo global: afecta a casi todas las páginas y es lo que más mueve el puntaje.',
    '2. Luego trabaja **un grupo cada vez**. Lee solo el archivo del grupo en el que estás; no cargues todos.',
    '3. Dentro de cada archivo, sigue el orden en que aparecen los problemas (de mayor a menor ahorro) y empieza por Mobile.',
    '4. Tras cada corrección, cumple el punto **Verificar** del problema. Si no puedes medir, dilo: no afirmes que mejoró.',
    '',
    '## Reglas',
    '',
    '- Es un proyecto de **código propio**: corrige solo en el código del repo (plantillas, estilos, scripts, configuración del build o funciones del tema).',
    ...(theme ? [`- Carpeta del tema (deducida de las rutas de los recursos): ${code(theme)}.`] : []),
    hashed ? '- Los bundles de `dist/assets/` llevan hash en el nombre (Vite): localiza el archivo fuente, edítalo y reconstruye; el nombre con hash cambiará.' : '- Si un archivo tiene hash en el nombre (bundle de Vite/Next), edita la fuente y reconstruye; no toques el archivo compilado.',
    '- No edites plugins (`wp-content/plugins`), cachés (`wp-content/cache`, archivos combinados en `uploads`), el núcleo (`wp-includes`) ni archivos generados.',
    '- En producción o staging puede haber plugins de caché/optimización activos: **no dependas de ellos** ni los configures desde el código. Los recursos marcados _plugin/caché_ y los problemas de servidor (TTFB, caché HTTP) están en la sección **"Fuera del código del proyecto"** de cada archivo.',
    '- Si un recurso es un archivo combinado o minificado por un plugin, puede contener CSS/JS del tema: para saber qué incluye, pide revisarlo en staging con la combinación desactivada. No lo edites.',
    '- Los recursos de _terceros_ (Google Fonts, analítica, chat…) no se editan: se corrige cómo los carga el proyecto (alojarlos en local, diferirlos o quitarlos).',
    '- Lo que no se puede resolver en el código (servidor, hosting, panel) añádelo a una lista **"Acciones manuales"** y entrégala al final.',
    '- Cambios mínimos y reversibles; un commit por problema. No desactives funcionalidades para ganar puntos (animaciones, formularios, analítica) sin preguntar.',
    '- No ejecutes nada contra producción sin confirmación del usuario.',
    '',
    '## Archivos',
    '',
    '| Archivo | Cubre | Páginas | Problemas propios |',
    '|---|---|---|---|',
    ...index.map((i) => `| [${i.file}](${i.file}) | ${i.label} | ${i.pages} | ${i.issues} |`),
    '',
    `Datos de respaldo: [pagespeed-data.json](pagespeed-data.json) (resumen por página, dispositivo y problema).`,
    '',
    '## Metas',
    '',
    '- Puntajes ≥ 90 en las 4 categorías (verde en PageSpeed).',
    '- Mobile: FCP ≤ 1.8 s · LCP ≤ 2.5 s · TBT ≤ 200 ms · CLS ≤ 0.1 · TTFB ≤ 800 ms.',
    ...(noData.length ? ['', `## Páginas sin datos`, '', 'No se pudieron medir (reintentar en el dashboard):', ...noData.map((u) => `- ${u}`)] : []),
    '',
  ].join('\n');
  files.unshift({ path: `${SKILL_DIR}/SKILL.md`, content: skill });
  files.push({ path: `${SKILL_DIR}/pagespeed-data.json`, content: dataFile(urls, results, meta) });
  return files;
}

export async function buildSkillZip(files: SkillFile[]): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.content);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function skillZipName(host: string, date: string): string {
  return `pagespeed-fixes-${host.replace(/^www\./, '').split('.')[0]}-${date}.zip`;
}
