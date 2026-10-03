import type { PsiSummary, Strategy } from './types';

export interface Job { url: string; strategy: Strategy }

export interface JobDone {
  job: Job;
  summary?: PsiSummary;
  raw?: unknown;
  error?: string;
}

const CONCURRENCY = 4;
const RETRIES = 2;
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });

class FatalError extends Error {}

/** Una prueba (1 llamada a /api/psi) con reintentos y backoff. */
export async function runJob(job: Job, withRaw: boolean, signal: AbortSignal): Promise<JobDone> {
  let lastErr = 'Error desconocido';
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (signal.aborted) return { job, error: 'Cancelado' };
    try {
      const qs = new URLSearchParams({ url: job.url, strategy: job.strategy });
      if (withRaw) qs.set('raw', '1');
      const res = await fetch(`/api/psi?${qs}`, { signal });
      const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || json.error) {
        if (json.fatal) throw new FatalError(json.error || `HTTP ${res.status}`);
        if (json.permanent) return { job, error: json.error }; // p. ej. la página da 404: no se reintenta
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      return { job, summary: json.summary, raw: json.raw };
    } catch (e) {
      if (signal.aborted) return { job, error: 'Cancelado' };
      if (e instanceof FatalError) throw e;
      lastErr = (e as Error).message;
      if (attempt < RETRIES) await sleep(5000 * (attempt + 1), signal);
    }
  }
  return { job, error: lastErr };
}

/** Ejecuta el lote con concurrencia 4. Si algo es fatal (key inválida, límite), aborta todo y lanza. */
export async function runBatch(
  jobs: Job[],
  withRaw: boolean,
  signal: AbortSignal,
  onDone: (d: JobDone) => void,
): Promise<void> {
  let i = 0;
  const inner = new AbortController();
  signal.addEventListener('abort', () => inner.abort(), { once: true });
  let fatal: Error | null = null;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
      while (i < jobs.length && !inner.signal.aborted) {
        const job = jobs[i++];
        try {
          onDone(await runJob(job, withRaw, inner.signal));
        } catch (e) {
          fatal = e as Error;
          inner.abort();
        }
      }
    }),
  );
  if (fatal) throw fatal;
}
