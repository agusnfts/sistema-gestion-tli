/** Logo de TML. Para cambiarlo, reemplazar apps/web/public/logo-tml.svg. */
export function Logo({ className = 'h-8 w-auto' }: { className?: string }) {
  return <img src="/logo-tml.svg" alt="TML Logística" className={className} />;
}
