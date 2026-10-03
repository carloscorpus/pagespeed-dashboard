'use client';

import { useState } from 'react';
import { AlertTriangle, Download, History, Loader2, Play, RotateCcw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeviceToggle } from '@/components/device-toggle';
import { GlobalProblems } from '@/components/global-problems';
import { Overview } from '@/components/overview';
import type { DeviceMode } from '@/lib/aggregate';
import { buildExcel, excelFileName } from '@/lib/excel';
import { PageDetail } from '@/components/page-detail';
import { ResultsTable } from '@/components/results-table';
import { SiteInput } from '@/components/site-input';
import { SkillDialog } from '@/components/skill-dialog';
import { useAnalysis } from '@/hooks/use-analysis';
import { usePersistence } from '@/hooks/use-persistence';
import type { SavedAnalysis } from '@/lib/storage';

export default function Home() {
    const a = useAnalysis();
    const [open, setOpen] = useState<string | null>(null);
    const [mode, setMode] = useState<DeviceMode>('both');
    const restore = (s: SavedAnalysis) => a.restore(s);
    const persist = usePersistence(a, { onRestore: restore });
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const hasResults = Object.values(a.results).some((r) => r.mobile || r.desktop);
    const sampleOf = Object.fromEntries(a.samples.flatMap((g) => g.urls.map((u) => [u, g])));

    const downloadExcel = async () => {
        setExporting(true);
        setExportError(null);
        try {
            const date = new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD en hora local
            const host = a.urls[0] ? new URL(a.urls[0]).host : 'sitio';
            const blob = await buildExcel(a.urls, a.results, { host, date, samples: a.samples });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = excelFileName(a.urls, date);
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (e) {
            setExportError((e as Error).message);
        } finally {
            setExporting(false);
        }
    };
    const failed = Object.values(a.results).reduce((n, r) => n + Object.keys(r.errors).length, 0);

    return (
        <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">PageSpeed NERD</h1>
                    <p className="text-sm text-muted-foreground">
                        Rendimiento, accesibilidad, prácticas recomendadas y SEO de todas las
                        páginas de un sitio.
                    </p>
                </div>
                {a.phase !== 'idle' && (
                    <Button variant="outline" onClick={a.reset}>
                        <RotateCcw /> Nuevo análisis
                    </Button>
                )}
            </header>

            {!persist.ready ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Cargando…
                </p>
            ) : a.phase === 'idle' ? (
                <>
                    {persist.saved && (
                        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm shadow-sm">
                            <span>
                                <span className="font-medium">Último análisis guardado:</span>{' '}
                                {new URL(persist.saved.urls[0]).host} ·{' '}
                                {persist.saved.urls.length}{' '}
                                {persist.saved.urls.length === 1 ? 'página' : 'páginas'} ·{' '}
                                {new Date(persist.saved.savedAt).toLocaleString('es')}
                            </span>
                            <Button variant="outline" size="sm" onClick={() => restore(persist.saved!)}>
                                <History /> Recuperar
                            </Button>
                        </section>
                    )}
                    <SiteInput onStart={(urls, raw, samples) => void a.start(urls, raw, samples)} />
                </>
            ) : (
                <>
                    <section className="rounded-xl border bg-card p-4 shadow-sm" aria-live="polite">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="font-medium">
                                {a.phase === 'running'
                                    ? 'Analizando…'
                                    : a.missing > 0
                                      ? 'Análisis incompleto'
                                      : 'Análisis terminado'}{' '}
                                <span className="tabular-nums text-muted-foreground">
                                    [{a.done}/{a.total}]
                                </span>
                            </span>
                            <span className="flex flex-wrap items-center gap-3">
                                {failed > 0 && (
                                    <span className="text-red-700 dark:text-red-400">
                                        {failed} con error (ábrelas para reintentar)
                                    </span>
                                )}
                                {a.phase === 'done' && a.missing > 0 && (
                                    <Button variant="outline" size="sm" onClick={() => void a.resume()}>
                                        <Play /> Continuar ({a.missing} pendientes)
                                    </Button>
                                )}
                                {a.phase === 'running' && (
                                    <Button variant="outline" size="sm" onClick={a.cancel}>
                                        <Square /> Cancelar
                                    </Button>
                                )}
                                <SkillDialog
                                    urls={a.urls}
                                    results={a.results}
                                    disabled={!hasResults}
                                    samples={a.samples}
                                />
                                <Button
                                    size="sm"
                                    disabled={!hasResults || exporting}
                                    onClick={() => void downloadExcel()}
                                >
                                    {exporting ? (
                                        <Loader2 className="animate-spin" />
                                    ) : (
                                        <Download />
                                    )}{' '}
                                    Descargar Excel
                                </Button>
                            </span>
                        </div>
                        <Progress value={a.total ? (a.done / a.total) * 100 : 0} />
                        {a.phase === 'running' && (
                            <p className="mt-2 text-xs text-muted-foreground">
                                Deja esta pestaña abierta: el navegador va lanzando las pruebas una
                                a una. El avance se guarda; si recargas, podrás continuar.
                            </p>
                        )}
                        {a.phase === 'done' && a.missing > 0 && !a.fatal && (
                            <p className="mt-2 text-xs text-muted-foreground">
                                Análisis incompleto (se canceló o se recargó la página): pulsa
                                Continuar para lanzar solo las pruebas que faltan.
                            </p>
                        )}
                        {exportError && (
                            <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
                                No se pudo generar el Excel: {exportError}
                            </p>
                        )}
                        {a.fatal && (
                            <p
                                role="alert"
                                className="mt-3 flex items-start gap-2 text-sm text-red-700 dark:text-red-400"
                            >
                                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Se detuvo el
                                análisis: {a.fatal}
                            </p>
                        )}
                    </section>

                    <Tabs defaultValue="resumen">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <TabsList>
                                <TabsTrigger value="resumen">Resumen</TabsTrigger>
                                <TabsTrigger value="globales">Problemas globales</TabsTrigger>
                                <TabsTrigger value="paginas">Páginas</TabsTrigger>
                            </TabsList>
                            <DeviceToggle value={mode} onChange={setMode} />
                        </div>
                        <TabsContent value="resumen" className="mt-4">
                            <Overview
                                urls={a.urls}
                                results={a.results}
                                mode={mode}
                                onOpen={setOpen}
                            />
                        </TabsContent>
                        <TabsContent value="globales" className="mt-4">
                            <GlobalProblems urls={a.urls} results={a.results} mode={mode} />
                        </TabsContent>
                        <TabsContent value="paginas" className="mt-4">
                            <ResultsTable
                                urls={a.urls}
                                results={a.results}
                                running={a.phase === 'running'}
                                onOpen={setOpen}
                                sampleOf={sampleOf}
                            />
                        </TabsContent>
                    </Tabs>
                    <PageDetail
                        url={open}
                        result={open ? a.results[open] : undefined}
                        pending={a.pending}
                        onClose={() => setOpen(null)}
                        onRetry={(u, s) => void a.retry(u, s)}
                        getRaw={a.getRaw}
                    />
                </>
            )}

            <footer className="border-t pt-4 text-xs text-muted-foreground">
                Datos de la API oficial de{' '}
                <a
                    href="https://developers.google.com/speed/docs/insights/v5/about"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-foreground"
                >
                    Google PageSpeed Insights
                </a>{' '}
                (Lighthouse, datos de laboratorio) · Hecho por Carlos Corpus Susanibar
            </footer>
        </main>
    );
}
