/**
 * Logo de TML (extraído del brochure 2026).
 * - `color`: texto oscuro, para fondos claros.
 * - `white`: texto blanco, para fondos azul marino.
 * Para cambiarlo, reemplazar los PNG de apps/web/public.
 */
export function Logo({
  variant = 'color',
  className = 'h-9 w-auto',
}: {
  variant?: 'color' | 'white';
  className?: string;
}) {
  return (
    <img
      src={variant === 'white' ? '/logo-tml-blanco.png' : '/logo-tml.png'}
      alt="TML Logística a medida"
      className={className}
      width={391}
      height={115}
    />
  );
}
