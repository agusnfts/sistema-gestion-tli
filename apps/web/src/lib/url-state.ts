import { useSearchParams } from 'react-router';

/**
 * Un filtro que vive en la URL (así los links del dashboard abren la lista ya filtrada y la
 * vista se puede compartir). Con el valor por defecto, el parámetro se saca de la URL.
 */
export function useUrlState<T extends string>(name: string, fallback: T): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams();
  const value = (params.get(name) as T | null) ?? fallback;
  const set = (v: T) =>
    setParams(
      (p) => {
        if (v && v !== fallback) p.set(name, v);
        else p.delete(name);
        p.delete('page');
        return p;
      },
      { replace: true },
    );
  return [value, set];
}
