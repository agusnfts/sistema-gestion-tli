import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/misc';

// Piezas del dashboard. Criterios (skill de visualización): un número principal va en un
// tile, no en un gráfico; las barras son finas, con extremo redondeado y separadas; el texto
// usa la tinta del sistema, nunca el color de la serie; la identidad nunca es solo color.

/** Series de la evolución semanal (validadas: separación para daltonismo OK; el verde no
 *  llega a 3:1 sobre blanco, por eso el gráfico tiene leyenda, tooltip y vista de tabla). */
export const SERIES = {
  created: { color: '#005cb9', label: 'Abiertos' },
  done: { color: '#69bf4a', label: 'Cerrados' },
} as const;

/** Número principal con link a la lista que lo explica. */
export function StatTile({
  label,
  value,
  to,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  to?: string;
  hint?: string;
  tone?: 'danger' | 'warning';
  icon?: ReactNode;
}) {
  const body = (
    <Card
      className={cn(
        'h-full p-4 transition-colors',
        to && 'hover:border-brand',
        tone === 'danger' && 'border-danger/40 bg-danger-soft',
        tone === 'warning' && 'border-warning/40 bg-warning-soft',
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
  return to ? (
    <Link to={to} className="block h-full rounded-lg" aria-label={`${label}: ${value}`}>
      {body}
    </Link>
  ) : (
    body
  );
}

/** Barras horizontales de una sola serie (sin leyenda: el título la nombra). Cada fila es un link. */
export function BarList({
  rows,
  title,
  emptyText = 'Sin datos',
}: {
  rows: { label: string; value: number; to?: string }[];
  /** Subtítulo cuando hay más de una lista en la misma tarjeta. */
  title?: string;
  emptyText?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <div>
      {title && <p className="mb-1 text-xs font-medium text-muted">{title}</p>}
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const inner = (
            <>
              <span className="w-[45%] max-w-32 shrink-0 truncate text-sm" title={r.label}>
                {r.label}
              </span>
              <span className="relative h-3 min-w-10 flex-1 rounded-r bg-bg">
                <span
                  className="absolute inset-y-0 left-0 rounded-r bg-brand"
                  style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-sm tabular-nums">{r.value}</span>
            </>
          );
          return (
            <li key={r.label}>
              {r.to ? (
                <Link
                  to={r.to}
                  className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-primary-soft"
                  aria-label={`${r.label}: ${r.value}`}
                >
                  {inner}
                </Link>
              ) : (
                <div className="flex items-center gap-2 px-1 py-0.5">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const fmtWeek = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

/**
 * Abiertos vs cerrados por semana: barras agrupadas (dos series, una sola escala), con
 * leyenda, tooltip al pasar el mouse y vista de tabla.
 */
export function WeeklyChart({ data }: { data: { week: string; created: number; done: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.flatMap((d) => [d.created, d.done]));
  // Escala "redonda" para la grilla.
  const top = max <= 5 ? 5 : Math.ceil(max / 5) * 5;
  const W = 560;
  const H = 180;
  const padL = 28;
  const padB = 22;
  const plotW = W - padL;
  const plotH = H - padB - 8;
  const group = plotW / data.length;
  const barW = Math.min(14, (group - 10) / 2);
  const y = (v: number) => 8 + plotH - (v / top) * plotH;
  const hovered = hover === null ? undefined : data[hover];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex gap-4 text-xs" aria-label="Series">
          {(['created', 'done'] as const).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm"
                style={{ background: SERIES[k].color }}
                aria-hidden
              />
              {SERIES[k].label}
            </li>
          ))}
        </ul>
        <button className="text-xs text-brand hover:underline" onClick={() => setTable(!table)}>
          {table ? 'Ver gráfico' : 'Ver como tabla'}
        </button>
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-medium">Semana del</th>
              <th className="py-1 text-right font-medium">{SERIES.created.label}</th>
              <th className="py-1 text-right font-medium">{SERIES.done.label}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.week} className="border-t border-border">
                <td className="py-1">{fmtWeek(d.week)}</td>
                <td className="py-1 text-right tabular-nums">{d.created}</td>
                <td className="py-1 text-right tabular-nums">{d.done}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label="Tickets abiertos y cerrados por semana"
            onMouseLeave={() => setHover(null)}
          >
            {[0, top / 2, top].map((v) => (
              <g key={v}>
                <line
                  x1={padL}
                  x2={W}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="var(--color-border)"
                  strokeWidth={1}
                />
                <text
                  x={padL - 6}
                  y={y(v) + 4}
                  textAnchor="end"
                  fontSize={10}
                  fill="var(--color-muted)"
                >
                  {v}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x0 = padL + i * group + group / 2;
              return (
                <g key={d.week}>
                  {/* Zona de hover más grande que las barras. */}
                  <rect
                    x={padL + i * group}
                    y={0}
                    width={group}
                    height={H - padB}
                    fill={hover === i ? 'var(--color-primary-soft)' : 'transparent'}
                    onMouseEnter={() => setHover(i)}
                  />
                  {(['created', 'done'] as const).map((k, j) => {
                    const v = d[k];
                    const h = Math.max(v ? 2 : 0, (v / top) * plotH);
                    const x = j === 0 ? x0 - barW - 1 : x0 + 1;
                    return (
                      <path
                        key={k}
                        pointerEvents="none"
                        fill={SERIES[k].color}
                        // Extremo de datos redondeado (4px), base recta.
                        d={
                          h > 4
                            ? `M${x},${y(0)} v${-(h - 4)} q0,-4 4,-4 h${barW - 8} q4,0 4,4 v${h - 4} z`
                            : `M${x},${y(0)} v${-h} h${barW} v${h} z`
                        }
                      />
                    );
                  })}
                  <text
                    x={x0}
                    y={H - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--color-muted)"
                  >
                    {fmtWeek(d.week)}
                  </text>
                </g>
              );
            })}
          </svg>
          {hover !== null && hovered && (
            <div
              role="tooltip"
              className="pointer-events-none absolute top-0 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm"
              style={{
                left: `${((padL + hover * group + group / 2) / W) * 100}%`,
                transform: 'translateX(-50%)',
              }}
            >
              <p className="font-medium">Semana del {fmtWeek(hovered.week)}</p>
              {(['created', 'done'] as const).map((k) => (
                <p key={k} className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-sm"
                    style={{ background: SERIES[k].color }}
                    aria-hidden
                  />
                  {SERIES[k].label}: <span className="tabular-nums">{hovered[k]}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Section({
  title,
  to,
  children,
  className,
}: {
  title: string;
  to?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('p-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {to && (
          <Link to={to} className="text-xs text-brand hover:underline">
            Ver todo
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

/** Fila "dato: valor" dentro de una sección, con link opcional. */
export function Metric({
  label,
  value,
  to,
  tone,
}: {
  label: string;
  value: ReactNode;
  to?: string;
  tone?: 'danger';
}) {
  const v = (
    <span className={cn('font-semibold tabular-nums', tone === 'danger' && 'text-danger')}>
      {value}
    </span>
  );
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border py-1.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      {to ? (
        <Link to={to} className="hover:underline">
          {v}
        </Link>
      ) : (
        v
      )}
    </div>
  );
}
