'use client';

import { useState } from 'react';
import { AlertTriangle, Download, ExternalLink, Loader2, RefreshCw, Wrench } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScoreBadge } from '@/components/score-badge';
import type { PageResult } from '@/hooks/use-analysis';
import {
  CATEGORY_LABEL, METRIC_DEFS, ORIGIN_LABEL, RATING_CLASS, fmtSaving, metricRating, pagePath, psiLink, resourceOrigin,
} from '@/lib/format';
import { fixText, isServerIssue } from '@/lib/issues-dict';
import { CATEGORIES, type CategoryId, type Issue, type PsiSummary, type Strategy } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  url: string | null;
  result: PageResult | undefined;
  pending: Set<string>;
  onClose: () => void;
  onRetry: (url: string, strategy: Strategy) => void;
  getRaw: (url: string, strategy: Strategy) => unknown;
}

function IssueItem({ issue, index }: { issue: Issue; index: number }) {
  const [all, setAll] = useState(false);
  const saving = fmtSaving(issue.ms, issue.bytes);
  const shown = all ? issue.resources : issue.resources.slice(0, 3);
  return (
    <AccordionItem value={`${issue.id}-${index}`}>
      <AccordionTrigger className="items-center">
        <span className="flex flex-1 flex-wrap items-center gap-2 pr-2">
          <span>{issue.name}</span>
          {saving && <Badge variant="secondary">ahorro {saving}</Badge>}
          {isServerIssue(issue.id) && <Badge variant="outline" title="No se corrige en el código del proyecto">servidor / hosting</Badge>}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3 pb-2">
          <p className="flex items-start gap-2 text-sm">
            <Wrench className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span><strong>Cómo corregirlo:</strong> {fixText(issue)}</span>
          </p>
          {issue.resources.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">
                {issue.category === 'performance' ? 'Recursos afectados' : 'Elementos afectados'}
              </p>
              <ul className="space-y-1">
                {shown.map((r) => {
                  const origin = resourceOrigin(r.name);
                  return (
                  <li key={r.name} className="flex items-baseline justify-between gap-3 rounded bg-muted/50 px-2 py-1 font-mono text-xs">
                    <span className="break-all">
                      {r.name}
                      {origin && origin !== 'project' && (
                        <Badge variant="outline" className="ml-2 font-sans" title="No es código del proyecto">{ORIGIN_LABEL[origin]}</Badge>
                      )}
                    </span>
                    {fmtSaving(r.ms, r.bytes) && <span className="shrink-0 font-sans font-medium">{fmtSaving(r.ms, r.bytes)}</span>}
                  </li>
                  );
                })}
              </ul>
              {issue.resources.length > 3 && (
                <Button variant="link" size="sm" className="px-0" onClick={() => setAll((v) => !v)}>
                  {all ? 'Ver menos' : `Ver los ${issue.resources.length}`}
                </Button>
              )}
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function StrategyPanel({ s }: { s: PsiSummary }) {
  const [cat, setCat] = useState<CategoryId>('performance');
  const issues = s.issues.filter((i) => i.category === cat);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CATEGORIES.map((c) => (
          <button
            key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c}
            className={cn('rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50', cat === c && 'border-foreground/40 bg-muted/60')}
          >
            <ScoreBadge score={s.scores[c]} className="px-2 py-1 text-base" />
            <div className="mt-1.5 text-xs text-muted-foreground">{CATEGORY_LABEL[c]}</div>
            <div className="text-xs">{s.issues.filter((i) => i.category === c).length} problemas</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {METRIC_DEFS.map((m) => {
          const v = s.metrics[m.key];
          return (
            <div key={m.key} className={cn('rounded-lg p-2', v == null ? 'bg-muted' : RATING_CLASS[metricRating(m, v)])} title={m.hint}>
              <div className="text-[11px] opacity-80">{m.label}</div>
              <div className="text-sm font-semibold tabular-nums">{v == null ? '—' : m.fmt(v)}</div>
            </div>
          );
        })}
        <div className="rounded-lg bg-muted p-2" title="Tiempo de respuesta del servidor">
          <div className="text-[11px] opacity-80">TTFB</div>
          <div className="text-sm font-semibold tabular-nums">{s.ttfb == null ? '—' : `${Math.round(s.ttfb)} ms`}</div>
        </div>
      </div>

      {s.lcpEl && (
        <div className="rounded-lg border p-3 text-sm">
          <div className="mb-1 text-xs font-medium text-muted-foreground uppercase">Elemento LCP</div>
          <code className="font-mono text-xs break-all">{s.lcpEl.text}</code>
          {s.lcpEl.flags.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-red-700 dark:text-red-400">
              <AlertTriangle className="size-4" /> {s.lcpEl.flags.join(' · ')}
            </p>
          )}
        </div>
      )}

      <div>
        <h3 className="mb-1 text-sm font-semibold">{CATEGORY_LABEL[cat]}: {issues.length ? 'qué corregir' : 'todo en orden'}</h3>
        {issues.length ? (
          <Accordion multiple>
            {issues.map((i, idx) => <IssueItem key={`${i.id}-${idx}`} issue={i} index={idx} />)}
          </Accordion>
        ) : (
          <p className="text-sm text-muted-foreground">No se detectaron problemas en esta categoría.</p>
        )}
      </div>
    </div>
  );
}

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function PageDetail({ url, result, pending, onClose, onRetry, getRaw }: Props) {
  const slug = url ? (pagePath(url).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home').toLowerCase() : '';
  return (
    <Sheet open={!!url} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="overflow-y-auto p-5 data-[side=right]:w-full data-[side=right]:sm:max-w-4xl">
        {url && (
          <>
            <SheetHeader className="p-0 pr-8">
              <SheetTitle className="break-all">{pagePath(url)}</SheetTitle>
              <SheetDescription>
                <a href={psiLink(url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                  Ver en PageSpeed <ExternalLink className="size-3" />
                </a>
                <span className="ml-3 text-xs">Datos de laboratorio; pueden variar unos puntos entre mediciones.</span>
              </SheetDescription>
            </SheetHeader>
            <Tabs defaultValue="mobile">
              <TabsList>
                <TabsTrigger value="mobile">Mobile</TabsTrigger>
                <TabsTrigger value="desktop">Desktop</TabsTrigger>
              </TabsList>
              {(['mobile', 'desktop'] as Strategy[]).map((s) => {
                const sum = result?.[s];
                const err = result?.errors[s];
                const busy = pending.has(`${url}|${s}`);
                const raw = getRaw(url, s);
                return (
                  <TabsContent key={s} value={s} className="mt-4">
                    {sum ? (
                      <div className="space-y-4">
                        <StrategyPanel s={sum} />
                        {raw !== undefined && (
                          <Button variant="outline" size="sm" onClick={() => download(`${slug}-${s}.json`, raw)}>
                            <Download /> Descargar JSON crudo
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        {err ? (
                          <>
                            <p className="mb-3 text-red-700 dark:text-red-400">Falló la prueba: {err}</p>
                            <Button size="sm" disabled={busy} onClick={() => onRetry(url, s)}>
                              {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Reintentar
                            </Button>
                          </>
                        ) : (
                          <p className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Esperando resultado…</p>
                        )}
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
