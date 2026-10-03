'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PageResult } from '@/hooks/use-analysis';
import { buildGlobal, devicesOf, type Agg, type DeviceMode, type GlobalRow } from '@/lib/aggregate';
import { CATEGORY_LABEL, ORIGIN_LABEL, fmtSaving, resourceOrigin } from '@/lib/format';
import { CATEGORIES, type CategoryId, type Strategy } from '@/lib/types';
import { cn } from '@/lib/utils';

const DEVICE_LABEL: Record<Strategy, string> = { mobile: 'Mobile', desktop: 'Desktop' };

/** Color por % de páginas afectadas (igual que el Excel): ≥80% rojo, ≥40% naranja, resto verde. */
const shareColor = (p: number) => (p >= 0.8 ? 'var(--st-crit)' : p >= 0.4 ? 'var(--st-warn)' : 'var(--st-good)');
const shareText = (p: number) => (p >= 0.8 ? 'text-red-700 dark:text-red-400' : p >= 0.4 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400');

/** Etiqueta de origen (tercero, plugin/caché…) si el archivo no es código del proyecto. */
function OriginBadge({ file }: { file: string | undefined }) {
  const o = file ? resourceOrigin(file) : null;
  if (!o || o === 'project') return null;
  return <Badge variant="outline" className="ml-2 font-sans" title="No es código del proyecto">{ORIGIN_LABEL[o]}</Badge>;
}

function DeviceCell({ agg }: { agg: Agg | undefined }) {
  if (!agg) return <span className="text-xs text-muted-foreground">—</span>;
  const p = agg.pages / agg.total;
  const saving = fmtSaving(agg.avgMs, agg.avgBytes);
  return (
    <div className="min-w-28">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn('text-sm font-semibold tabular-nums', shareText(p))}>{agg.pages}/{agg.total}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{Math.round(p * 100)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${Math.max(p * 100, 3)}%`, background: shareColor(p) }} />
      </div>
      {saving && <div className="mt-1 text-xs text-muted-foreground">ahorro prom. {saving}</div>}
    </div>
  );
}

function RowsTable({ rows, devices, kind, limit }: { rows: GlobalRow[]; devices: Strategy[]; kind: 'problem' | 'file'; limit: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, limit);
  if (!rows.length) return <p className="py-4 text-sm text-muted-foreground">Nada que mostrar con estos filtros.</p>;
  return (
    <>
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{kind === 'problem' ? 'Problema' : 'Archivo'}</th>
              {devices.map((s) => <th key={s} className="px-3 py-2 font-medium">{DEVICE_LABEL[s]}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="border-t align-top">
                <td className="max-w-md px-3 py-2">
                  {kind === 'problem' ? (
                    <>
                      <span className="font-medium">{r.name}</span>{' '}
                      <Badge variant="outline" className="ml-1">{CATEGORY_LABEL[r.category]}</Badge>
                    </>
                  ) : (
                    <>
                      <code className="font-mono text-xs break-all">{r.file}</code>
                      <OriginBadge file={r.file} />
                      <div className="text-xs text-muted-foreground">{r.name}</div>
                    </>
                  )}
                </td>
                {devices.map((s) => <td key={s} className="px-3 py-2"><DeviceCell agg={r.per[s]} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-sm underline underline-offset-2">
          {all ? 'Ver menos' : `Ver los ${rows.length}`}
        </button>
      )}
    </>
  );
}

interface Props {
  urls: string[];
  results: Record<string, PageResult>;
  mode: DeviceMode;
}

export function GlobalProblems({ urls, results, mode }: Props) {
  const devices = devicesOf(mode);
  const [cat, setCat] = useState<CategoryId | 'all'>('all');
  const [minShare, setMinShare] = useState(0);

  const report = useMemo(() => buildGlobal(urls, results, devices), [urls, results, devices]);

  const keep = (r: GlobalRow) =>
    (cat === 'all' || r.category === cat) &&
    devices.some((s) => r.per[s] && r.per[s]!.pages / (report.totals[s] || 1) >= minShare);
  const problems = report.problems.filter(keep);
  const files = report.files.filter(keep);

  // ¿Recursos globales retrasan el FCP? Mira los archivos que bloquean el render en más páginas.
  const blocking = report.files.filter((f) => f.key.startsWith('render-blocking'));
  const hasData = devices.some((s) => (report.totals[s] ?? 0) > 0);
  if (!hasData) return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Esperando los primeros resultados…</p>;

  return (
    <div className="space-y-6">
      {/* FCP */}
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold">¿Hay recursos globales que retrasan el primer contenido visible (FCP)?</h3>
        <p className="mb-3 text-xs text-muted-foreground">Meta de Google: FCP ≤ 1.8 s. Se mira qué CSS/JS/fuentes bloquean el renderizado y en cuántas páginas se repiten.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {devices.map((s) => {
            const f = report.fcp[s];
            const total = report.totals[s] ?? 0;
            const top = blocking.filter((b) => b.per[s]).sort((a, b) => b.per[s]!.pages - a.per[s]!.pages).slice(0, 3);
            const widespread = top.length > 0 && top[0].per[s]!.pages / total >= 0.8;
            const slowShare = f && f.n ? f.slow / f.n : 0;
            const confirmed = widespread && slowShare >= 0.5;
            return (
              <div key={s} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">{DEVICE_LABEL[s]}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    FCP prom. {f?.avg == null ? '—' : `${(f.avg / 1000).toFixed(1)} s`} · {f?.slow ?? 0}/{f?.n ?? 0} páginas &gt; 1.8 s
                  </span>
                </div>
                <p className={cn('mb-2 flex items-start gap-1.5 text-sm', confirmed ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground')}>
                  {confirmed ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
                  {confirmed
                    ? 'Sí: hay archivos globales que bloquean el renderizado en casi todas las páginas.'
                    : top.length ? 'No es concluyente: los archivos bloqueantes no se repiten en casi todas las páginas, o el FCP ya es bueno.' : 'No se detectaron recursos que bloqueen el renderizado.'}
                </p>
                {top.length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {top.map((b) => (
                      <li key={b.key} className="flex items-baseline justify-between gap-3 rounded bg-muted/50 px-2 py-1">
                        <span><code className="font-mono break-all">{b.file}</code><OriginBadge file={b.file} /></span>
                        <span className="shrink-0 tabular-nums">{b.per[s]!.pages}/{total} · {fmtSaving(b.per[s]!.avgMs, b.per[s]!.avgBytes)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <div role="group" aria-label="Categoría" className="flex flex-wrap gap-1">
          {(['all', ...CATEGORIES] as const).map((c) => (
            <button
              key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}
              className={cn('rounded-md border px-2 py-1 text-muted-foreground hover:text-foreground', cat === c && 'bg-muted font-medium text-foreground')}
            >
              {c === 'all' ? 'Todas' : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Mínimo de páginas afectadas" className="flex items-center gap-1">
          <span className="text-muted-foreground">Afecta a</span>
          {[[0, 'cualquiera'], [0.5, '≥ 50%'], [0.8, '≥ 80%']].map(([v, l]) => (
            <button
              key={String(v)} type="button" aria-pressed={minShare === v} onClick={() => setMinShare(v as number)}
              className={cn('rounded-md border px-2 py-1 text-muted-foreground hover:text-foreground', minShare === v && 'bg-muted font-medium text-foreground')}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold">A) Problemas que se repiten <span className="font-normal text-muted-foreground">· por páginas afectadas</span></h3>
        <RowsTable rows={problems} devices={devices} kind="problem" limit={12} />
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">B) Archivos que aparecen en más páginas <span className="font-normal text-muted-foreground">· corregirlos una vez mejora varias páginas</span></h3>
        <RowsTable rows={files} devices={devices} kind="file" limit={12} />
      </section>
    </div>
  );
}
