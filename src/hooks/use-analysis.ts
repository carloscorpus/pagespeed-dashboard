'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { runBatch, runJob, type Job, type JobDone } from '@/lib/orchestrator';
import type { SampleInfo } from '@/lib/sampling';
import { clearAnalysis, loadAllRaw, saveRaw, type SavedAnalysis } from '@/lib/storage';
import type { PsiSummary, Strategy } from '@/lib/types';

export interface PageResult {
  mobile?: PsiSummary;
  desktop?: PsiSummary;
  errors: Partial<Record<Strategy, string>>;
}

export type Phase = 'idle' | 'running' | 'done';

const STRATEGIES: Strategy[] = ['mobile', 'desktop'];

/** Pruebas que todavía no tienen resultado ni error (canceladas, cortadas por un error fatal o por recargar). */
function missingJobs(urls: string[], results: Record<string, PageResult>): Job[] {
  return urls.flatMap((url) =>
    STRATEGIES.filter((s) => !results[url]?.[s] && !results[url]?.errors[s]).map((strategy) => ({ url, strategy })),
  );
}

export function useAnalysis() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [urls, setUrls] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, PageResult>>({});
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [fatal, setFatal] = useState<string | null>(null);
  const [withRaw, setWithRaw] = useState(false);
  const [samples, setSamples] = useState<SampleInfo[]>([]); // grupos de páginas repetitivas analizados por muestra
  const [pending, setPending] = useState<Set<string>>(new Set()); // `${url}|${strategy}` en reintento
  const [, setRawVersion] = useState(0); // re-render cuando llega el JSON crudo guardado
  const abortRef = useRef<AbortController | null>(null);
  const rawRef = useRef(new Map<string, unknown>());
  const withRawRef = useRef(false);

  const apply = useCallback((d: JobDone) => {
    const { url, strategy } = d.job;
    if (d.raw) {
      rawRef.current.set(`${url}|${strategy}`, d.raw);
      void saveRaw(`${url}|${strategy}`, d.raw);
    }
    setResults((prev) => {
      const cur: PageResult = prev[url] ?? { errors: {} };
      const errors = { ...cur.errors };
      if (d.summary) delete errors[strategy]; else errors[strategy] = d.error ?? 'Error';
      return { ...prev, [url]: { ...cur, ...(d.summary ? { [strategy]: d.summary } : {}), errors } };
    });
  }, []);

  const run = useCallback(async (jobs: Job[]) => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setFatal(null);
    setPhase('running');
    try {
      await runBatch(jobs, withRawRef.current, ctl.signal, (d) => {
        if (d.error === 'Cancelado') return;
        apply(d);
        setDone((n) => n + 1);
      });
    } catch (e) {
      setFatal((e as Error).message);
    }
    setPhase('done');
  }, [apply]);

  const start = useCallback(async (selected: string[], raw: boolean, sampled: SampleInfo[] = []) => {
    abortRef.current?.abort();
    await clearAnalysis();
    rawRef.current.clear();
    withRawRef.current = raw;
    setWithRaw(raw);
    setUrls(selected);
    setSamples(sampled);
    setResults({});
    setDone(0);
    setTotal(selected.length * STRATEGIES.length);
    await run(selected.flatMap((url) => STRATEGIES.map((strategy) => ({ url, strategy }))));
  }, [run]);

  const missing = useMemo(() => missingJobs(urls, results).length, [urls, results]);

  /** Lanza solo las pruebas que faltan, conservando lo ya analizado. */
  const resume = useCallback(() => run(missingJobs(urls, results)), [run, urls, results]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const retry = useCallback(async (url: string, strategy: Strategy) => {
    const key = `${url}|${strategy}`;
    setPending((p) => new Set(p).add(key));
    try {
      const d = await runJob({ url, strategy }, withRawRef.current, new AbortController().signal);
      apply(d);
    } catch (e) {
      apply({ job: { url, strategy }, error: (e as Error).message });
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(key); return n; });
    }
  }, [apply]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPhase('idle'); setUrls([]); setSamples([]); setResults({}); setDone(0); setTotal(0); setFatal(null);
  }, []);

  /** Carga un análisis guardado. Si se cortó a la mitad queda en "done" con pruebas pendientes para continuar. */
  const restore = useCallback((s: SavedAnalysis) => {
    abortRef.current?.abort();
    rawRef.current.clear();
    withRawRef.current = s.withRaw;
    setWithRaw(s.withRaw);
    setUrls(s.urls);
    setSamples(s.samples ?? []);
    setResults(s.results);
    setDone(s.done);
    setTotal(s.total);
    setFatal(s.fatal);
    setPhase('done');
    if (s.withRaw) {
      void loadAllRaw().then((m) => {
        m.forEach((v, k) => rawRef.current.set(k, v));
        setRawVersion((n) => n + 1);
      });
    }
  }, []);

  const getRaw = useCallback((url: string, strategy: Strategy) => rawRef.current.get(`${url}|${strategy}`), []);

  return {
    phase, urls, results, done, total, fatal, pending, withRaw, missing, samples,
    start, resume, cancel, retry, reset, restore, getRaw,
  };
}
