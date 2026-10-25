import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Selección múltiple como chips (cómodo en el celular, sin desplegables anidados).
 * Cada opción es un botón con aria-pressed.
 */
export function ChipSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  required,
  hint,
}: {
  label: string;
  options: { value: T; label: string; group?: string }[];
  value: T[];
  onChange: (next: T[]) => void;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
}) {
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  const toggle = (v: T) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">
        {label}
        {required && <span className="text-danger"> *</span>}
      </legend>
      <div className="space-y-1.5">
        {groups.map((g) => (
          <div key={g} className="flex flex-wrap items-center gap-1.5">
            {g && <span className="mr-1 text-xs text-muted">{g}:</span>}
            {options
              .filter((o) => (o.group ?? '') === g)
              .map((o) => {
                const on = value.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(o.value)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-60',
                      on
                        ? 'border-primary bg-primary-soft font-medium text-primary'
                        : 'border-border-strong bg-surface text-fg hover:bg-bg',
                    )}
                  >
                    {on && <Check className="size-3" aria-hidden />}
                    {o.label}
                  </button>
                );
              })}
          </div>
        ))}
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </fieldset>
  );
}
