'use client';

import { useEffect, useState } from 'react';
import { loadAnalysis, saveAnalysis, type SavedAnalysis } from '@/lib/storage';
import type { useAnalysis } from './use-analysis';

interface Options {
  onRestore: (s: SavedAnalysis) => void;
}

/**
 * Guarda el análisis en IndexedDB mientras avanza y lo restaura al recargar la pestaña.
 * Devuelve `ready` (ya se revisó si había algo guardado) y `saved` (último análisis guardado,
 * para ofrecer recuperarlo después de "Nuevo análisis").
 */
export function usePersistence(a: ReturnType<typeof useAnalysis>, { onRestore }: Options) {
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<SavedAnalysis | null>(null);

  // Al montar: si hay un análisis guardado, se restaura directamente.
  useEffect(() => {
    let alive = true;
    void loadAnalysis().then((s) => {
      if (!alive) return;
      if (s) onRestore(s);
      setReady(true);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

  const { phase, urls, results, done, total, fatal, withRaw, samples } = a;

  // Guardado automático (con un pequeño debounce: los resultados llegan de a uno).
  useEffect(() => {
    if (!ready || phase === 'idle' || !urls.length) return;
    const t = setTimeout(() => {
      void saveAnalysis({ urls, results, done, total, fatal, running: phase === 'running', withRaw, samples });
    }, 300);
    return () => clearTimeout(t);
  }, [ready, phase, urls, results, done, total, fatal, withRaw, samples]);

  // Al volver a la pantalla inicial se ofrece recuperar lo último guardado.
  useEffect(() => {
    if (!ready || phase !== 'idle') return;
    let alive = true;
    void loadAnalysis().then((s) => { if (alive) setSaved(s); });
    return () => { alive = false; };
  }, [ready, phase]);

  return { ready, saved };
}
