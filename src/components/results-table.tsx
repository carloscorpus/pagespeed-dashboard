'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ScoreBadge } from '@/components/score-badge';
import type { PageResult } from '@/hooks/use-analysis';
import { CATEGORY_SHORT, CATEGORY_LABEL, pagePath } from '@/lib/format';
import { CATEGORIES, type CategoryId, type Strategy } from '@/lib/types';
import type { SampleInfo } from '@/lib/sampling';

type SortKey = 'page' | `${Strategy}:${CategoryId}`;

interface SortState {
    key: SortKey;
    dir: 1 | -1;
}

function SortHead({
    k,
    sort,
    onSort,
    children,
    className,
    rowSpan,
}: {
    k: SortKey;
    sort: SortState;
    onSort: (k: SortKey) => void;
    children: React.ReactNode;
    className?: string;
    rowSpan?: number;
}) {
    return (
        <TableHead
            rowSpan={rowSpan}
            className={className}
            aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
        >
            <button
                type="button"
                onClick={() => onSort(k)}
                className="inline-flex items-center gap-1 font-medium hover:text-foreground"
            >
                {children}
                {sort.key === k &&
                    (sort.dir === 1 ? (
                        <ArrowUp className="size-3" />
                    ) : (
                        <ArrowDown className="size-3" />
                    ))}
            </button>
        </TableHead>
    );
}

interface Props {
    urls: string[];
    results: Record<string, PageResult>;
    running: boolean;
    onOpen: (url: string) => void;
    /** URL → grupo de páginas repetitivas del que es muestra. */
    sampleOf?: Record<string, SampleInfo>;
}

const STRATEGIES: Strategy[] = ['mobile', 'desktop'];

function Cell({
    r,
    s,
    c,
    running,
}: {
    r: PageResult | undefined;
    s: Strategy;
    c: CategoryId;
    running: boolean;
}) {
    const sum = r?.[s];
    if (sum) return <ScoreBadge score={sum.scores[c]} />;
    if (r?.errors[s])
        return (
            <span className="text-xs font-medium text-red-600" title={r.errors[s]}>
                Error
            </span>
        );
    return running ? (
        <Loader2 className="mx-auto size-3.5 animate-spin text-muted-foreground" />
    ) : (
        <span className="text-muted-foreground">—</span>
    );
}

export function ResultsTable({ urls, results, running, onOpen, sampleOf = {} }: Props) {
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<SortState>({ key: 'page', dir: 1 });

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = urls.filter((u) => !q || u.toLowerCase().includes(q));
        const value = (u: string): number | string | null => {
            if (sort.key === 'page') return pagePath(u);
            const [s, c] = sort.key.split(':') as [Strategy, CategoryId];
            return results[u]?.[s]?.scores[c] ?? null;
        };
        return list.sort((a, b) => {
            const va = value(a),
                vb = value(b);
            if (va == null && vb == null) return 0;
            if (va == null) return 1; // sin dato siempre al final
            if (vb == null) return -1;
            return (
                (typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number)) *
                sort.dir
            );
        });
    }, [urls, results, query, sort]);

    const toggle = (key: SortKey) =>
        setSort((s) =>
            s.key === key
                ? { key, dir: (s.dir * -1) as 1 | -1 }
                : { key, dir: key === 'page' ? 1 : -1 },
        );

    return (
        <div className="space-y-3">
            <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar página…"
                    className="h-9 pl-8"
                    aria-label="Buscar página"
                />
            </div>
            <div className="overflow-auto rounded-xl border bg-card shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <SortHead
                                k="page"
                                sort={sort}
                                onSort={toggle}
                                rowSpan={2}
                                className="min-w-56"
                            >
                                Página
                            </SortHead>
                            {STRATEGIES.map((s) => (
                                <TableHead key={s} colSpan={4} className="border-l text-center">
                                    {s === 'mobile' ? 'Mobile' : 'Desktop'}
                                </TableHead>
                            ))}
                        </TableRow>
                        <TableRow>
                            {STRATEGIES.flatMap((s) =>
                                CATEGORIES.map((c, i) => (
                                    <SortHead
                                        key={`${s}:${c}`}
                                        k={`${s}:${c}`}
                                        sort={sort}
                                        onSort={toggle}
                                        className={`text-center ${i === 0 ? 'border-l' : ''}`}
                                    >
                                        <span title={CATEGORY_LABEL[c]}>{CATEGORY_SHORT[c]}</span>
                                    </SortHead>
                                )),
                            )}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((u) => (
                            <TableRow key={u} onClick={() => onOpen(u)} className="cursor-pointer">
                                <TableCell className="max-w-80 truncate font-medium">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onOpen(u);
                                        }}
                                        className="truncate text-left hover:underline"
                                    >
                                        {pagePath(u)}
                                    </button>
                                    {sampleOf[u] && (
                                        <span
                                            className="ml-2 rounded border px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground"
                                            title={`Muestra de las páginas de ${sampleOf[u].label} (misma plantilla)`}
                                        >
                                            muestra · {sampleOf[u].urls.length} de{' '}
                                            {sampleOf[u].total}
                                        </span>
                                    )}
                                </TableCell>
                                {STRATEGIES.flatMap((s) =>
                                    CATEGORIES.map((c, i) => (
                                        <TableCell
                                            key={`${s}:${c}`}
                                            className={`text-center ${i === 0 ? 'border-l' : ''}`}
                                        >
                                            <Cell r={results[u]} s={s} c={c} running={running} />
                                        </TableCell>
                                    )),
                                )}
                            </TableRow>
                        ))}
                        {!rows.length && (
                            <TableRow>
                                <TableCell
                                    colSpan={9}
                                    className="py-8 text-center text-muted-foreground"
                                >
                                    Sin resultados.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
