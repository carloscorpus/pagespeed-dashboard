'use client';

import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { PageResult } from '@/hooks/use-analysis';
import {
  avgScore, devicesOf, distribution, overallScore, pageScores, type DeviceMode,
} from '@/lib/aggregate';
import { CATEGORY_LABEL, scoreRating, type Rating } from '@/lib/format';
import { CATEGORIES, type CategoryId, type Strategy } from '@/lib/types';
import { cn } from '@/lib/utils';

const DEVICE_LABEL: Record<Strategy, string> = { mobile: 'Mobile', desktop: 'Desktop' };
const DEVICE_COLOR: Record<Strategy, string> = { mobile: 'var(--series-1)', desktop: 'var(--series-2)' };
const RATING_COLOR: Record<Rating, string> = { good: 'var(--st-good)', avg: 'var(--st-warn)', poor: 'var(--st-crit)' };
const RATING_LABEL: Record<Rating, string> = { good: 'Bueno (90–100)', avg: 'Mejorable (50–89)', poor: 'Deficiente (0–49)' };

const AXIS_TICK = { fill: 'var(--viz-muted)', fontSize: 12 };

// ── piezas ──
function ScoreRing({ score, label }: { score: number | null; label: string }) {
  const r = 24, c = 2 * Math.PI * r;
  const rating = score == null ? null : scoreRating(score);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${label}: ${score ?? 'sin datos'}`}>
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--viz-grid)" strokeWidth="5" />
        {score != null && rating && (
          <circle
            cx="32" cy="32" r={r} fill="none" stroke={RATING_COLOR[rating]} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 32 32)"
          />
        )}
        <text x="32" y="37" textAnchor="middle" className="fill-foreground text-[17px] font-semibold">{score ?? '—'}</text>
      </svg>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function ScoreTile({ title, scores, hero }: { title: string; scores: { label: string; value: number | null }[]; hero?: boolean }) {
  return (
    <div className={cn('rounded-xl border bg-card p-4 shadow-sm', hero && 'bg-muted/40')}>
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      <div className="flex justify-around gap-2">
        {scores.map((s) => <ScoreRing key={s.label} score={s.value} label={s.label} />)}
      </div>
    </div>
  );
}

interface TipPayload { name?: string; value?: number; color?: string; dataKey?: string }
function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: TipPayload[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">{p.value ?? '—'}{unit}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} /> {i.label}
        </li>
      ))}
    </ul>
  );
}

function ChartCard({ title, subtitle, children, table }: {
  title: string; subtitle?: string; children: React.ReactNode; table: { head: string[]; rows: (string | number)[][] };
}) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle && <p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>}
      {children}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver datos en tabla</summary>
        <table className="mt-2 w-full text-left">
          <thead><tr>{table.head.map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="py-1 pr-3 tabular-nums">{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

// ── vista ──
interface Props {
  urls: string[];
  results: Record<string, PageResult>;
  mode: DeviceMode;
  onOpen: (url: string) => void;
}

export function Overview({ urls, results, mode, onOpen }: Props) {
  const devices = devicesOf(mode);
  const [pageCat, setPageCat] = useState<CategoryId>('performance');

  const hasData = urls.some((u) => results[u]?.mobile || results[u]?.desktop);

  const byCategory = useMemo<{ name: string; mobile: number | null; desktop: number | null }[]>(
    () => CATEGORIES.map((c) => ({
      name: CATEGORY_LABEL[c],
      mobile: avgScore(urls, results, 'mobile', c).avg,
      desktop: avgScore(urls, results, 'desktop', c).avg,
    })),
    [urls, results],
  );

  const dist = useMemo(
    () => CATEGORIES.map((c) => ({ name: CATEGORY_LABEL[c], ...distribution(urls, results, devices, c) })),
    [urls, results, devices],
  );

  const perPage = useMemo(() => pageScores(urls, results, pageCat), [urls, results, pageCat]);

  if (!hasData) {
    return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Esperando los primeros resultados…</p>;
  }

  const devLegend = devices.map((s) => ({ label: DEVICE_LABEL[s], color: DEVICE_COLOR[s] }));
  const pageChartHeight = perPage.length * (devices.length === 2 ? 30 : 18) + 48;

  return (
    <div className="space-y-6">
      {/* KPI: puntajes promedio */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ScoreTile
          hero title="General"
          scores={devices.map((s) => ({ label: DEVICE_LABEL[s], value: overallScore(urls, results, s) }))}
        />
        {CATEGORIES.map((c) => (
          <ScoreTile
            key={c} title={CATEGORY_LABEL[c]}
            scores={devices.map((s) => ({ label: DEVICE_LABEL[s], value: avgScore(urls, results, s, c).avg }))}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Mobile vs Desktop por categoría"
          subtitle="Puntaje promedio de todas las páginas. La línea punteada marca la meta de 90."
          table={{
            head: ['Categoría', ...devices.map((s) => DEVICE_LABEL[s])],
            rows: byCategory.map((r) => [r.name, ...devices.map((s) => r[s] ?? '—')]),
          }}
        >
          <Legend items={devLegend} />
          <div role="img" aria-label="Gráfico de barras: puntaje promedio por categoría y dispositivo" className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory} margin={{ top: 18, right: 8, left: -18, bottom: 0 }} barCategoryGap="26%">
                <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: 'var(--viz-axis)' }} tick={AXIS_TICK} interval={0} />
                <YAxis domain={[0, 100]} ticks={[0, 50, 90, 100]} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                <ReferenceLine y={90} stroke="var(--viz-muted)" strokeDasharray="4 4" />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
                {devices.map((s) => (
                  <Bar key={s} dataKey={s} name={DEVICE_LABEL[s]} fill={DEVICE_COLOR[s]} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                    <LabelList dataKey={s} position="top" fill="var(--foreground)" fontSize={11} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Distribución de páginas"
          subtitle={`Cuántas páginas caen en cada rango, por categoría${mode === 'both' ? ' (mobile + desktop sumados)' : ''}.`}
          table={{
            head: ['Categoría', 'Bueno', 'Mejorable', 'Deficiente'],
            rows: dist.map((d) => [d.name, d.good, d.avg, d.poor]),
          }}
        >
          <Legend items={(['good', 'avg', 'poor'] as Rating[]).map((r) => ({ label: RATING_LABEL[r], color: RATING_COLOR[r] }))} />
          <div role="img" aria-label="Gráfico de barras apiladas: páginas por rango de puntaje y categoría" className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dist} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barCategoryGap="30%">
                <XAxis type="number" hide domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="name" width={130} tickLine={false} axisLine={false} tick={{ ...AXIS_TICK, fill: 'var(--foreground)' }} />
                <Tooltip content={<ChartTooltip unit=" páginas" />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
                {(['good', 'avg', 'poor'] as Rating[]).map((r) => (
                  <Bar
                    key={r} dataKey={r} name={RATING_LABEL[r]} stackId="d" fill={RATING_COLOR[r]}
                    stroke="var(--viz-surface)" strokeWidth={2} isAnimationActive={false}
                  >
                    <LabelList
                      dataKey={r} fontSize={11} fontWeight={600}
                      fill={r === 'avg' ? '#0b0b0b' : '#ffffff'}
                      formatter={(v: unknown) => (Number(v) > 0 ? String(v) : '')}
                    />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title={`${CATEGORY_LABEL[pageCat]} por página`}
        subtitle="De peor a mejor. Haz clic en una barra para abrir el detalle de esa página."
        table={{
          head: ['Página', ...devices.map((s) => DEVICE_LABEL[s])],
          rows: perPage.map((r) => [r.page, ...devices.map((s) => r[s] ?? '—')]),
        }}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Legend items={devLegend} />
          <div role="group" aria-label="Categoría" className="flex flex-wrap gap-1 text-xs">
            {CATEGORIES.map((c) => (
              <button
                key={c} type="button" aria-pressed={pageCat === c} onClick={() => setPageCat(c)}
                className={cn('rounded-md border px-2 py-1 text-muted-foreground hover:text-foreground', pageCat === c && 'bg-muted font-medium text-foreground')}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          <div role="img" aria-label="Gráfico de barras: puntaje por página" style={{ height: pageChartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perPage} layout="vertical" margin={{ top: 4, right: 28, left: 0, bottom: 0 }} barCategoryGap="22%" barGap={2}>
                <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
                <XAxis type="number" domain={[0, 100]} ticks={[0, 50, 90, 100]} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                <YAxis
                  type="category" dataKey="page" width={190} tickLine={false} axisLine={{ stroke: 'var(--viz-axis)' }} interval={0}
                  tick={{ ...AXIS_TICK, fill: 'var(--foreground)' }}
                  tickFormatter={(v: string) => (v.length > 28 ? `${v.slice(0, 27)}…` : v)}
                />
                <ReferenceLine x={90} stroke="var(--viz-muted)" strokeDasharray="4 4" />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
                {devices.map((s) => (
                  <Bar
                    key={s} dataKey={s} name={DEVICE_LABEL[s]} fill={DEVICE_COLOR[s]} radius={[0, 4, 4, 0]} isAnimationActive={false}
                    cursor="pointer" onClick={(d: { payload?: { url?: string } }) => d.payload?.url && onOpen(d.payload.url)}
                  >
                    <LabelList dataKey={s} position="right" fill="var(--foreground)" fontSize={11} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
