import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { Card } from '@/components/ui/misc';

/** Layout centrado de las pantallas de ingreso. */
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
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo className="h-10 w-auto" />
          <p className="text-sm font-semibold text-primary">Sistema de Gestión TLI</p>
        </div>
        <Card className="p-6">
          <h1 className="text-lg font-semibold">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          <div className="mt-5">{children}</div>
        </Card>
      </div>
    </main>
  );
}
