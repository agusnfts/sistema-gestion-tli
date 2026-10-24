import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { Card } from '@/components/ui/misc';

/** Layout de las pantallas de ingreso: fondo azul marino con las formas de la tapa del brochure. */
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-primary p-4">
      <BrandShapes />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo variant="white" className="h-14 w-auto" />
          <p className="text-sm font-medium tracking-wide text-white/85">Sistema de Gestión TLI</p>
        </div>
        <Card className="border-transparent p-6 shadow-xl">
          <h1 className="text-lg font-semibold text-brand">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          <div className="mt-5">{children}</div>
        </Card>
      </div>
    </main>
  );
}

/** Polígonos translúcidos superpuestos, como en la portada del brochure. Decorativo. */
function BrandShapes() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute -bottom-24 -right-24 h-[42rem] w-[42rem] max-w-none opacity-90"
      viewBox="0 0 600 600"
    >
      <path d="M380 40 L560 10 L600 560 L330 600 Z" fill="#ffffff" fillOpacity="0.10" />
      <path d="M120 230 L330 120 L560 330 L360 560 L80 470 Z" fill="#5b9bd5" fillOpacity="0.22" />
      <path d="M230 120 L420 60 L600 260 L470 470 Z" fill="#ffffff" fillOpacity="0.08" />
      <path d="M40 400 L210 330 L360 600 L60 600 Z" fill="#69bf4a" fillOpacity="0.28" />
      <path d="M300 330 L520 290 L560 600 L280 600 Z" fill="#6fb3e6" fillOpacity="0.35" />
    </svg>
  );
}
