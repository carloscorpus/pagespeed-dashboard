'use client';

import { useRef, useState } from 'react';
import { FileText, Globe, Layers, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { pagePath, parseUrlList } from '@/lib/format';
import { SAMPLE_SIZE, groupTemplates, type SampleInfo, type TemplateGroup } from '@/lib/sampling';

interface Props {
  onStart: (urls: string[], withRaw: boolean, samples: SampleInfo[]) => void;
}

/** Paso 1 (URL → sitemap, o .txt / pegar) y paso 2 (elegir qué páginas analizar). */
export function SiteInput({ onStart }: Props) {
  const [site, setSite] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [urls, setUrls] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState('');
  const [withRaw, setWithRaw] = useState(false);
  // Páginas repetitivas (solo si vienen del sitemap): de cada grupo se analiza una muestra.
  const [groups, setGroups] = useState<TemplateGroup[]>([]);
  const [fullGroups, setFullGroups] = useState<Set<string>>(new Set()); // grupos que se analizan completos
  const [offGroups, setOffGroups] = useState<Set<string>>(new Set()); // grupos excluidos
  const fileRef = useRef<HTMLInputElement>(null);

  /** `sitemapOf` solo llega desde el sitemap: una lista subida o pegada se analiza tal cual, sin agrupar. */
  const load = (list: string[], note?: string, sitemapOf?: Record<string, string>) => {
    const t = sitemapOf ? groupTemplates(list, sitemapOf) : { singles: list, groups: [] };
    setUrls(t.singles);
    setSelected(new Set(t.singles));
    setGroups(t.groups);
    setFullGroups(new Set());
    setOffGroups(new Set());
    setMessage(note ?? null);
  };
  const toggle = (set: (fn: (p: Set<string>) => Set<string>) => void, key: string, on: boolean) =>
    set((prev) => { const next = new Set(prev); if (on) next.add(key); else next.delete(key); return next; });

  const findSitemap = async () => {
    if (!site.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/sitemap?site=${encodeURIComponent(site.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (json.urls.length) load(json.urls, `${json.urls.length} páginas encontradas en ${json.source}`, json.groups ?? {});
      else { load([]); setMessage(json.note || 'No se encontró un sitemap.'); }
    } catch (e) {
      load([]);
      setMessage((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fromText = (text: string, origin: string) => {
    const list = parseUrlList(text);
    if (list.length) load(list, `${list.length} URLs cargadas desde ${origin}`);
    else { load([]); setMessage('No se encontraron URLs válidas.'); }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    fromText(await f.text(), f.name);
    if (fileRef.current) fileRef.current.value = '';
  };

  const n = Number.parseInt(limit, 10);
  const activeGroups = groups.filter((g) => !offGroups.has(g.key));
  const chosen = [
    ...urls.filter((u) => selected.has(u)),
    ...activeGroups.flatMap((g) => (fullGroups.has(g.key) ? g.urls : g.sample)),
  ].slice(0, n > 0 ? n : undefined);
  const samples: SampleInfo[] = activeGroups
    .filter((g) => !fullGroups.has(g.key))
    .map((g) => ({ key: g.key, label: g.label, total: g.urls.length, urls: g.sample.filter((u) => chosen.includes(u)) }))
    .filter((x) => x.urls.length);
  const minutes = Math.max(1, Math.round((chosen.length * 2 * 35) / 4 / 60));

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-1 text-base font-semibold">1. ¿Qué sitio quieres analizar?</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Pega la URL principal y buscaré el sitemap automáticamente. Si no tiene, sube un .txt o pega las URLs.
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => { e.preventDefault(); void findSitemap(); }}
        >
          <Input
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="https://tusitio.com"
            aria-label="URL principal del sitio"
            className="h-9"
          />
          <Button type="submit" disabled={loading || !site.trim()}>
            {loading ? <Loader2 className="animate-spin" /> : <Globe />}
            Buscar sitemap
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> o carga las URLs a mano <span className="h-px flex-1 bg-border" />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={'https://tusitio.com/\nhttps://tusitio.com/contacto/\n# las líneas con # se ignoran'}
            rows={4}
            aria-label="Lista de URLs"
          />
          <div className="flex flex-row gap-2 sm:flex-col">
            <Button variant="outline" onClick={() => fromText(pasted, 'el texto pegado')} disabled={!pasted.trim()}>
              <FileText /> Usar lista
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload /> Subir .txt
            </Button>
            <input
              ref={fileRef} type="file" accept=".txt,.csv,.md,text/plain" className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </div>
        </div>
        {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
      </section>

      {(urls.length > 0 || groups.length > 0) && (
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">2. Elige las páginas</h2>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(urls))}>Todas</Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Ninguna</Button>
              <div className="flex items-center gap-2">
                <Label htmlFor="limit" className="text-muted-foreground">Límite</Label>
                <Input
                  id="limit" inputMode="numeric" value={limit} placeholder="todas" className="h-8 w-20"
                  onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </div>
          </div>

          {groups.length > 0 && (
            <div className="mb-4 rounded-lg border bg-muted/30 p-3">
              <p className="mb-1 flex items-center gap-2 text-sm font-medium"><Layers className="size-4" /> Páginas repetitivas (misma plantilla)</p>
              <p className="mb-2 text-xs text-muted-foreground">
                De cada grupo se analizan {SAMPLE_SIZE} páginas repartidas: lo que se corrija en la plantilla aplica a todas.
              </p>
              <ul className="divide-y">
                {groups.map((g) => (
                  <li key={g.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
                    <Label className="flex cursor-pointer items-center gap-2 font-normal">
                      <Checkbox checked={!offGroups.has(g.key)} onCheckedChange={(c) => toggle(setOffGroups, g.key, !c)} />
                      <code className="font-mono text-xs">{g.label}</code>
                    </Label>
                    <span className="text-muted-foreground">
                      {g.urls.length} páginas → se {fullGroups.has(g.key) ? 'analizan todas' : `analizan ${g.sample.length}`}
                    </span>
                    <Label className="ml-auto flex items-center gap-2 text-xs font-normal text-muted-foreground">
                      <Switch
                        size="sm" checked={fullGroups.has(g.key)} disabled={offGroups.has(g.key)}
                        onCheckedChange={(c) => toggle(setFullGroups, g.key, c)}
                      />
                      analizar todas
                    </Label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {urls.length > 0 && groups.length > 0 && <p className="mb-2 text-sm font-medium">Páginas únicas</p>}
          <ul className="max-h-72 divide-y overflow-auto rounded-lg border">
            {urls.map((u) => {
              const idx = chosen.indexOf(u);
              return (
                <li key={u}>
                  <Label className="flex cursor-pointer items-center gap-3 px-3 py-2 font-normal hover:bg-muted/50">
                    <Checkbox
                      checked={selected.has(u)}
                      onCheckedChange={(c) => setSelected((prev) => {
                        const next = new Set(prev);
                        if (c) next.add(u); else next.delete(u);
                        return next;
                      })}
                    />
                    <span className="truncate text-sm">{pagePath(u)}</span>
                    {selected.has(u) && idx === -1 && <span className="ml-auto text-xs text-muted-foreground">fuera del límite</span>}
                  </Label>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch id="raw" checked={withRaw} onCheckedChange={setWithRaw} />
              <Label htmlFor="raw" className="font-normal">Guardar JSON crudo (para depurar; usa más memoria)</Label>
            </div>
            <Button size="lg" disabled={!chosen.length} onClick={() => onStart(chosen, withRaw, samples)}>
              Analizar {chosen.length} {chosen.length === 1 ? 'página' : 'páginas'}
              <span className="text-xs opacity-70">· {chosen.length * 2} pruebas · ~{minutes} min</span>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
