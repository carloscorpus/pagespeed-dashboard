import type { Workbook, Worksheet, Cell, Fill } from 'exceljs';
import type { PageResult } from '@/hooks/use-analysis';
import { avgScore, buildGlobal, distribution, type Agg, type GlobalRow } from './aggregate';
import {
    CATEGORY_LABEL,
    METRIC_DEFS,
    ORIGIN_LABEL,
    fmtKB,
    metricRating,
    pagePath,
    psiLink,
    resourceOrigin,
    scoreRating,
    type Rating,
} from './format';
import { fixText, isServerIssue } from './issues-dict';
import type { SampleInfo } from './sampling';
import { CATEGORIES, type PsiSummary, type Strategy } from './types';

type Results = Record<string, PageResult>;

const DEVICES: Strategy[] = ['mobile', 'desktop'];
const DEVICE_LABEL: Record<Strategy, string> = { mobile: 'Mobile', desktop: 'Desktop' };

// Mismo estilo que el script: encabezado oscuro y verde / naranja / rojo.
const COLORS: Record<Rating, { fill: string; font: string }> = {
    good: { fill: 'FFD9F2E3', font: 'FF0C7A3E' },
    avg: { fill: 'FFFFF1D6', font: 'FFB25E00' },
    poor: { fill: 'FFFDE2E1', font: 'FFC0262D' },
};
const HEADER_FILL: Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
const HEADER_FONT = { color: { argb: 'FFFFFFFF' }, bold: true };
const LINK_FONT = { color: { argb: 'FF2563EB' }, underline: true } as const;
const GREY = { color: { argb: 'FF9CA3AF' } };

const solid = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const paint = (cell: Cell, r: Rating, bold = false) => {
    cell.fill = solid(COLORS[r].fill);
    cell.font = { color: { argb: COLORS[r].font }, bold };
};
const head = (ws: Worksheet, rowNumber: number) =>
    ws.getRow(rowNumber).eachCell({ includeEmpty: true }, (c) => {
        c.fill = HEADER_FILL;
        c.font = HEADER_FONT;
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
const wrapTop = (cell: Cell, center = false) => {
    cell.alignment = { wrapText: true, vertical: 'top', horizontal: center ? 'center' : 'left' };
};

/** "276 KB · 850 ms" según lo que exista. */
function saving(ms: number, bytes: number): string {
    return (
        [bytes >= 1024 && fmtKB(bytes), ms > 0 && `${Math.round(ms)} ms`]
            .filter(Boolean)
            .join(' · ') || '—'
    );
}
/** Versión corta para "Top 3 mejoras": KB si hay bytes, si no ms. */
function savingShort(ms: number, bytes: number): string {
    return bytes >= 1024 ? `ahorrar ${fmtKB(bytes)}` : ms > 0 ? `${Math.round(ms)} ms` : '';
}

// ── Hoja Resultados ──
interface Col {
    label: string;
    fmt: string;
    get: (s: PsiSummary) => number | null;
    rate: (v: number) => Rating;
}
// Mismo orden de métricas que el script: LCP, TBT, CLS, FCP, Speed Index.
const METRIC_COLS = ['lcp', 'tbt', 'cls', 'fcp', 'si'].map(
    (k) => METRIC_DEFS.find((m) => m.key === k)!,
);
const RESULT_COLS: Col[] = [
    ...CATEGORIES.map<Col>((c) => ({
        label: CATEGORY_LABEL[c],
        fmt: '0',
        get: (s) => s.scores[c],
        rate: scoreRating,
    })),
    ...METRIC_COLS.map<Col>((m) => {
        const seconds = m.key === 'lcp' || m.key === 'fcp' || m.key === 'si';
        return {
            label: {
                lcp: 'LCP (s)',
                tbt: 'TBT (ms)',
                cls: 'CLS',
                fcp: 'FCP (s)',
                si: 'Speed Index (s)',
            }[m.key],
            fmt: m.key === 'cls' ? '0.000' : seconds ? '0.0' : '0',
            get: (s: PsiSummary) => {
                const v = s.metrics[m.key];
                return v == null ? null : seconds ? v / 1000 : v;
            },
            rate: (v: number) => metricRating(m, seconds ? v * 1000 : v),
        };
    }),
];

function sheetResultados(wb: Workbook, urls: string[], results: Results) {
    const n = RESULT_COLS.length;
    const ws = wb.addWorksheet('Resultados', {
        views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }],
    });
    ws.getRow(1).values = [
        '',
        'MOBILE',
        ...Array(n - 1).fill(''),
        'DESKTOP',
        ...Array(n - 1).fill(''),
        '',
        '',
        '',
        '',
    ];
    ws.mergeCells(1, 2, 1, 1 + n);
    ws.mergeCells(1, 2 + n, 1, 1 + 2 * n);
    ws.getRow(2).values = [
        'Página',
        ...RESULT_COLS.map((c) => c.label),
        ...RESULT_COLS.map((c) => c.label),
        'Abrir en PageSpeed',
        'Elemento LCP (mobile)',
        'TTFB mobile (ms)',
        'Top 3 mejoras (mobile)',
    ];
    head(ws, 1);
    head(ws, 2);
    ws.getRow(2).height = 32;

    // De peor a mejor rendimiento mobile
    const sorted = [...urls].sort(
        (a, b) =>
            (results[a]?.mobile?.scores.performance ?? 999) -
            (results[b]?.mobile?.scores.performance ?? 999),
    );

    for (const url of sorted) {
        const r = results[url];
        const row = ws.addRow([]);
        row.getCell(1).value = { text: pagePath(url), hyperlink: url };
        row.getCell(1).font = LINK_FONT;

        DEVICES.forEach((s, si) => {
            RESULT_COLS.forEach((col, ci) => {
                const cell = row.getCell(2 + si * n + ci);
                const sum = r?.[s];
                const v = sum ? col.get(sum) : null;
                if (v == null) {
                    cell.value = sum ? '—' : 'Error';
                    cell.font = GREY;
                } else {
                    cell.value = v;
                    cell.numFmt = col.fmt;
                    paint(cell, col.rate(v), ci === 0);
                }
                cell.alignment = { horizontal: 'center' };
            });
        });

        const link = row.getCell(2 + 2 * n);
        link.value = { text: 'Ver reporte', hyperlink: psiLink(url) };
        link.font = LINK_FONT;

        const mob = r?.mobile;
        const lcp = row.getCell(3 + 2 * n);
        lcp.value = mob?.lcpEl
            ? `${mob.lcpEl.text}${mob.lcpEl.flags.length ? ` ⚠ ${mob.lcpEl.flags.join(', ')}` : ''}`
            : '—';
        if (mob?.lcpEl?.flags.length) lcp.font = { color: { argb: COLORS.poor.font } };
        wrapTop(lcp);

        const tt = row.getCell(4 + 2 * n);
        tt.value = mob?.ttfb == null ? '—' : mob.ttfb;
        tt.numFmt = '0';
        tt.alignment = { horizontal: 'center', vertical: 'top' };
        if (mob?.ttfb != null)
            paint(tt, mob.ttfb <= 800 ? 'good' : mob.ttfb <= 1800 ? 'avg' : 'poor');

        // "Top 3 mejoras": solo rendimiento (es lo que se acciona primero)
        const top = (mob?.issues ?? [])
            .filter((i) => i.category === 'performance')
            .slice(0, 3)
            .map((i) => `${i.name}: ${savingShort(i.ms, i.bytes) || 'revisar'}`)
            .join(' · ');
        const t3 = row.getCell(5 + 2 * n);
        t3.value = top || '—';
        wrapTop(t3);
    }

    ws.getColumn(1).width = 44;
    for (let c = 2; c <= 1 + 2 * n; c++) ws.getColumn(c).width = 12;
    ws.getColumn(2 + 2 * n).width = 18;
    ws.getColumn(3 + 2 * n).width = 50;
    ws.getColumn(4 + 2 * n).width = 14;
    ws.getColumn(5 + 2 * n).width = 70;
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 5 + 2 * n } };
}

// ── Hoja Resumen ──
function sheetResumen(
    wb: Workbook,
    urls: string[],
    results: Results,
    host: string,
    date: string,
    samples: SampleInfo[],
) {
    const ws = wb.addWorksheet('Resumen');
    ws.getColumn(1).width = 40;
    ws.getColumn(2).width = 14;
    ws.getColumn(3).width = 14;
    ws.addRow([`Reporte PageSpeed — ${host}`]).font = { bold: true, size: 14 };
    ws.addRow([`Fecha: ${date}`]);
    ws.addRow([]);
    const h = ws.addRow(['', 'Mobile', 'Desktop']);
    h.eachCell((c) => {
        c.fill = HEADER_FILL;
        c.font = HEADER_FONT;
        c.alignment = { horizontal: 'center' };
    });

    const center = (row: ReturnType<Worksheet['addRow']>) => {
        row.getCell(2).alignment = row.getCell(3).alignment = { horizontal: 'center' };
    };
    center(
        ws.addRow([
            'Páginas analizadas',
            ...DEVICES.map((s) => urls.filter((u) => results[u]?.[s]).length),
        ]),
    );
    if (samples.length) {
        ws.addRow([]);
        ws.addRow(['Páginas repetitivas analizadas por muestra (misma plantilla)']).font = {
            bold: true,
        };
        for (const g of samples) ws.addRow([`${g.label}: ${g.urls.length} de ${g.total} páginas`]);
    }
    ws.addRow([]);
    ws.addRow(['Puntaje promedio']).font = { bold: true };
    for (const c of CATEGORIES) {
        const row = ws.addRow([
            CATEGORY_LABEL[c],
            ...DEVICES.map((s) => avgScore(urls, results, s, c).avg ?? '—'),
        ]);
        center(row);
        DEVICES.forEach((s, i) => {
            const v = avgScore(urls, results, s, c).avg;
            if (v != null) paint(row.getCell(2 + i), scoreRating(v), true);
        });
    }
    ws.addRow([]);
    ws.addRow(['Distribución de páginas (Rendimiento)']).font = { bold: true };
    const dist = DEVICES.map((s) => distribution(urls, results, [s], 'performance'));
    center(ws.addRow(['🟢 Verde (90–100)', ...dist.map((d) => d.good)]));
    center(ws.addRow(['🟠 Naranja (50–89)', ...dist.map((d) => d.avg)]));
    center(ws.addRow(['🔴 Rojo (0–49)', ...dist.map((d) => d.poor)]));

    ws.addRow([]);
    ws.addRow(['Umbrales recomendados por Google']).font = { bold: true };
    [
        ['LCP (carga del contenido principal)', '≤ 2.5 s'],
        ['TBT (tiempo de bloqueo)', '≤ 200 ms'],
        ['CLS (estabilidad visual)', '≤ 0.1'],
        ['FCP (primer contenido visible)', '≤ 1.8 s'],
        ['Speed Index', '≤ 3.4 s'],
    ].forEach((v) => ws.addRow(v));
    ws.addRow([]);
    ws.addRow([
        'Datos de laboratorio de Google PageSpeed Insights. Los puntajes pueden variar unos puntos entre mediciones.',
    ]).font = { italic: true, color: { argb: 'FF6B7280' } };
}

// ── Hoja Problemas globales ──
function sheetGlobales(wb: Workbook, urls: string[], results: Results) {
    const g = buildGlobal(urls, results, DEVICES);
    const ws = wb.addWorksheet('Problemas globales', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
        { header: 'Dispositivo', width: 12 },
        { header: 'Categoría', width: 22 },
        { header: 'Problema', width: 40 },
        { header: 'Archivo concreto', width: 70 },
        { header: 'Páginas afectadas', width: 14 },
        { header: '% de páginas', width: 12 },
        { header: 'Ahorro promedio', width: 18 },
    ];
    head(ws, 1);

    const addRow = (s: Strategy, r: GlobalRow, a: Agg) => {
        const pct = a.pages / a.total;
        const row = ws.addRow([
            DEVICE_LABEL[s],
            CATEGORY_LABEL[r.category],
            r.name,
            r.file ?? '',
            `${a.pages}/${a.total}`,
            pct,
            saving(a.avgMs, a.avgBytes),
        ]);
        row.getCell(6).numFmt = '0%';
        const rate: Rating = pct >= 0.8 ? 'poor' : pct >= 0.4 ? 'avg' : 'good';
        paint(row.getCell(5), rate, true);
        paint(row.getCell(6), rate, true);
        row.eachCell((cell, k) => wrapTop(cell, k >= 5));
    };
    const section = (title: string) => {
        const row = ws.addRow([title]);
        ws.mergeCells(row.number, 1, row.number, 7);
        row.font = { bold: true, size: 12 };
        row.eachCell((c) => {
            c.fill = solid('FFE5E7EB');
        });
    };
    const byDevice = (rows: GlobalRow[], s: Strategy) =>
        rows
            .filter((r) => r.per[s])
            .sort(
                (a, b) =>
                    b.per[s]!.pages - a.per[s]!.pages ||
                    b.per[s]!.avgMs +
                        (b.per[s]!.avgBytes / 1024) * 3 -
                        (a.per[s]!.avgMs + (a.per[s]!.avgBytes / 1024) * 3),
            );

    section('A) Problemas que se repiten (por número de páginas afectadas)');
    for (const s of DEVICES) byDevice(g.problems, s).forEach((r) => addRow(s, r, r.per[s]!));
    ws.addRow([]);
    section('B) Archivos concretos que aparecen en más páginas');
    for (const s of DEVICES) byDevice(g.files, s).forEach((r) => addRow(s, r, r.per[s]!));
    ws.addRow([]);
    section('C) FCP (primer contenido visible): promedio y páginas con FCP > 1.8 s');
    for (const s of DEVICES) {
        const f = g.fcp[s];
        const row = ws.addRow([
            DEVICE_LABEL[s],
            '',
            'FCP promedio / páginas con FCP > 1.8 s',
            '',
            `${f?.slow ?? 0}/${f?.n ?? 0}`,
            '',
            f?.avg == null ? '—' : `${(f.avg / 1000).toFixed(1)} s`,
        ]);
        row.eachCell((cell, k) => wrapTop(cell, k >= 5));
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };
}

// ── Hoja Recomendaciones ──
function sheetRecomendaciones(wb: Workbook, urls: string[], results: Results) {
    const ws = wb.addWorksheet('Recomendaciones', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
        { header: 'Página', width: 36 },
        { header: 'Dispositivo', width: 12 },
        { header: 'Categoría', width: 22 },
        { header: 'Problema', width: 36 },
        { header: 'Ahorro estimado', width: 16 },
        { header: 'Recursos afectados (top 3)', width: 70 },
        { header: 'Cómo corregirlo', width: 80 },
    ];
    head(ws, 1);
    // Por página, luego dispositivo; dentro: categorías en orden y por ahorro (ya vienen ordenadas así).
    for (const url of [...urls].sort((a, b) => pagePath(a).localeCompare(pagePath(b)))) {
        for (const s of DEVICES) {
            for (const is of results[url]?.[s]?.issues ?? []) {
                const res = is.resources
                    .slice(0, 3)
                    .map((r) => {
                        // Lo que no es código del proyecto se marca: [plugin/caché], [tercero]…
                        const o = resourceOrigin(r.name);
                        const tag = o && o !== 'project' ? ` [${ORIGIN_LABEL[o]}]` : '';
                        return `${r.name}${tag}${r.bytes || r.ms ? ` (${saving(r.ms, r.bytes)})` : ''}`;
                    })
                    .join('\n');
                const row = ws.addRow([
                    { text: pagePath(url), hyperlink: url },
                    DEVICE_LABEL[s],
                    CATEGORY_LABEL[is.category],
                    is.name,
                    saving(is.ms, is.bytes),
                    res || '—',
                    fixText(is),
                ]);
                const key = is.category === 'performance' ? is.sortKey : 0;
                if (is.category === 'performance')
                    paint(row.getCell(5), key >= 500 ? 'poor' : key >= 150 ? 'avg' : 'good', true);
                row.eachCell((cell, k) => {
                    wrapTop(cell, k === 2 || k === 5);
                });
                row.getCell(1).font = LINK_FONT;
                if (isServerIssue(is.id)) row.getCell(7).font = { italic: true }; // servidor/hosting, no código
            }
        }
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };
}

// ── Hoja Errores ──
function sheetErrores(wb: Workbook, urls: string[], results: Results) {
    const rows = urls.flatMap((url) =>
        DEVICES.flatMap((s) =>
            results[url]?.errors[s] ? [[url, DEVICE_LABEL[s], results[url].errors[s]!]] : [],
        ),
    );
    if (!rows.length) return;
    const ws = wb.addWorksheet('Errores');
    ws.columns = [
        { header: 'URL', width: 60 },
        { header: 'Dispositivo', width: 12 },
        { header: 'Error', width: 80 },
    ];
    head(ws, 1);
    rows.forEach((r) => ws.addRow(r));
}

export interface ExcelMeta {
    host: string;
    date: string;
    samples?: SampleInfo[];
}

/** Genera el libro completo (corre en el navegador; exceljs se carga bajo demanda). */
export async function buildExcel(urls: string[], results: Results, meta: ExcelMeta): Promise<Blob> {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = `PageSpeed NERD`;
    wb.title = `Reporte PageSpeed — ${meta.host}`;
    sheetResultados(wb, urls, results);
    sheetResumen(wb, urls, results, meta.host, meta.date, meta.samples ?? []);
    sheetGlobales(wb, urls, results);
    sheetRecomendaciones(wb, urls, results);
    sheetErrores(wb, urls, results);
    wb.views = [
        {
            activeTab: 0,
            x: 0,
            y: 0,
            width: 10000,
            height: 20000,
            firstSheet: 0,
            visibility: 'visible',
        },
    ];
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

export function excelFileName(urls: string[], date: string): string {
    let label = 'sitio';
    try {
        label = new URL(urls[0]).host.replace(/^www\./, '').split('.')[0];
    } catch {
        /* usa el valor por defecto */
    }
    return `pagespeed-${label}-${date}.xlsx`;
}
