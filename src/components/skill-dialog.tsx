'use client';

import { useMemo, useState } from 'react';
import { Download, FileText, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { PageResult } from '@/hooks/use-analysis';
import type { SampleInfo } from '@/lib/sampling';
import { buildSkillZip, generateSkill, skillZipName } from '@/lib/skill';
import { cn } from '@/lib/utils';

interface Props {
  urls: string[];
  results: Record<string, PageResult>;
  disabled: boolean;
  samples: SampleInfo[];
}

/** Genera el skill de correcciones (sin IA: plantillas) y deja revisar cada archivo antes de descargar el ZIP. */
export function SkillDialog({ urls, results, disabled, samples }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const host = urls[0] ? new URL(urls[0]).host : 'sitio';
  const date = new Date().toLocaleDateString('en-CA');
  const files = useMemo(() => (open ? generateSkill(urls, results, { host, date, samples }) : []), [open, urls, results, host, date, samples]);
  const short = (p: string) => p.replace('.claude/skills/pagespeed-fixes/', '');

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const blob = await buildSkillZip(files);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = skillZipName(host, date);
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => { setSelected(0); setOpen(true); }}>
        <Sparkles /> Generar skill de correcciones
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-hidden p-5 data-[side=right]:w-full data-[side=right]:sm:max-w-6xl">
          <SheetHeader className="p-0 pr-8">
            <SheetTitle>Skill de correcciones para Claude Code</SheetTitle>
            <SheetDescription>
              Descomprime el ZIP en la raíz del proyecto del sitio (queda en <code>.claude/skills/pagespeed-fixes/</code>) y pídele a Claude Code:
              «aplica las correcciones de pagespeed-fixes». Se generó con plantillas, sin IA.
            </SheetDescription>
          </SheetHeader>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{files.length} archivos</span>
            <Button onClick={() => void download()} disabled={busy || !files.length}>
              {busy ? <Loader2 className="animate-spin" /> : <Download />} Descargar ZIP
            </Button>
          </div>
          {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">No se pudo generar el ZIP: {error}</p>}
          <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-[14rem_1fr]">
            <ul className="space-y-1 overflow-auto sm:border-r sm:pr-3" aria-label="Archivos del skill">
              {files.map((f, i) => (
                <li key={f.path}>
                  <button
                    type="button" onClick={() => setSelected(i)} aria-current={selected === i}
                    className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted', selected === i && 'bg-muted font-medium')}
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{short(f.path)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <pre className="min-h-0 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
              {files[selected]?.content.slice(0, 40_000)}
            </pre>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
