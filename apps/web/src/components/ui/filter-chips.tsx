import { X } from 'lucide-react';

/**
 * Filtros que llegan por la URL sin control propio en la pantalla (por ejemplo, desde el
 * dashboard: un responsable, un estado puntual, "vencidas"). Se muestran y se pueden quitar.
 */
export function FilterChips({ items }: { items: { label: string; onClear: () => void }[] }) {
  if (!items.length) return null;
  return (
    <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Filtros aplicados">
      {items.map((i) => (
        <li key={i.label}>
          <button
            type="button"
            onClick={i.onClear}
            className="inline-flex items-center gap-1 rounded-full border border-brand bg-primary-soft px-2.5 py-1 text-xs text-primary hover:bg-surface"
            aria-label={`Quitar filtro: ${i.label}`}
          >
            {i.label}
            <X className="size-3" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
