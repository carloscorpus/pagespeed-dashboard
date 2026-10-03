import { cn } from '@/lib/utils';
import { RATING_CLASS, scoreRating } from '@/lib/format';

export function ScoreBadge({ score, className }: { score: number | null | undefined; className?: string }) {
  if (score == null) return <span className={cn('text-muted-foreground', className)}>—</span>;
  return (
    <span
      className={cn(
        'inline-flex min-w-9 items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
        RATING_CLASS[scoreRating(score)],
        className,
      )}
    >
      {score}
    </span>
  );
}
