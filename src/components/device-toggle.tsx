'use client';

import type { DeviceMode } from '@/lib/aggregate';
import { cn } from '@/lib/utils';

const OPTIONS: { value: DeviceMode; label: string }[] = [
    { value: 'mobile', label: 'Mobile' },
    { value: 'desktop', label: 'Desktop' },
    { value: 'both', label: 'Ambos' },
];

export function DeviceToggle({
    value,
    onChange,
}: {
    value: DeviceMode;
    onChange: (v: DeviceMode) => void;
}) {
    return (
        <div
            role="group"
            aria-label="Dispositivo"
            className="inline-flex rounded-lg bg-muted p-0.5 text-sm"
        >
            {OPTIONS.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    aria-pressed={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        'rounded-md px-3 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground',
                        value === o.value && 'bg-background text-foreground shadow-sm',
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
