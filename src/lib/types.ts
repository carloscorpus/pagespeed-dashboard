export type Strategy = 'mobile' | 'desktop';
export type CategoryId = 'performance' | 'accessibility' | 'best-practices' | 'seo';

export const CATEGORIES: CategoryId[] = ['performance', 'accessibility', 'best-practices', 'seo'];

export interface Resource {
  name: string;
  ms: number;
  bytes: number;
  size: number;
}

export interface Issue {
  id: string;
  category: CategoryId;
  /** Nombre en español (diccionario por ID); si el ID no está, el `title` de la API. */
  name: string;
  /** Texto de la API o del diccionario al momento del análisis; al mostrar se usa fixText() (diccionario actual). */
  fix: string;
  ms: number;
  bytes: number;
  resources: Resource[];
  /** Orden de prioridad dentro de su categoría. */
  sortKey: number;
}

export interface LcpElement {
  text: string;
  flags: string[];
}

export interface PsiSummary {
  url: string;
  strategy: Strategy;
  fetchedAt: string;
  lighthouseVersion: string | null;
  scores: Record<CategoryId, number | null>;
  metrics: {
    lcp: number | null;
    tbt: number | null;
    cls: number | null;
    fcp: number | null;
    si: number | null;
  };
  ttfb: number | null;
  lcpEl: LcpElement | null;
  issues: Issue[];
}

