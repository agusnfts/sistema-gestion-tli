import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BookOpen, Cable, FileText, Plus, Search } from 'lucide-react';
import {
  ARTICLE_TEMPLATE_LABELS,
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_CATEGORY_LABELS,
  type ArticleListItem,
  type KnowledgeCategory,
  type Paginated,
  type SearchHit,
} from '@tli/shared';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { useHasPermission } from '@/lib/auth';
import { buttonClasses } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Alert, Badge, Card, PageHeader, Spinner } from '@/components/ui/misc';
import { ArticleStatusBadge, Snippet, VisibilityBadge } from './components';
import { LibraryTab } from './LibraryTab';

type Tab = 'articles' | 'library';

/** Debounce simple para no buscar en cada tecla. */
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function KnowledgePage() {
  const can = useHasPermission();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'library' ? 'library' : 'articles';
  const [q, setQ] = useState(params.get('q') ?? '');
  const term = useDebounced(q.trim());
  const searching = term.length >= 2;

  return (
    <>
      <PageHeader
        title="Conocimiento"
        description="Cómo se hacen las cosas, errores frecuentes y la documentación de los sistemas."
        actions={
          can('kb.manage') && (
            <Link to="/conocimiento/articulos/nuevo" className={buttonClasses()}>
              <Plus className="size-4" aria-hidden /> Nuevo artículo
            </Link>
          )
        }
      />
      <div className="relative mb-5 max-w-2xl">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Buscar en la base de conocimiento"
          placeholder="Buscá un error, un procedimiento, un cliente… (también dentro de los PDF)"
          className="h-12 pl-10 text-base"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setParams(
              (p) => {
                if (e.target.value) p.set('q', e.target.value);
                else p.delete('q');
                return p;
              },
              { replace: true },
            );
          }}
        />
      </div>

      {searching ? (
        <SearchResults q={term} />
      ) : (
        <>
          <div role="tablist" aria-label="Secciones" className="mb-4 flex gap-1">
            {(
              [
                ['articles', 'Artículos'],
                ['library', 'Biblioteca'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() =>
                  setParams((p) => {
                    p.set('tab', id);
                    return p;
                  })
                }
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm',
                  tab === id
                    ? 'bg-primary-soft font-medium text-primary'
                    : 'text-muted hover:bg-panel',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'articles' ? <ArticlesTab /> : <LibraryTab />}
        </>
      )}
    </>
  );
}

function SearchResults({ q }: { q: string }) {
  const results = useQuery({
    queryKey: ['knowledge', 'search', q],
    queryFn: () => api<SearchHit[]>('/knowledge/search', { query: { q } }),
    placeholderData: keepPreviousData,
  });
  if (results.isLoading) return <Spinner />;
  if (results.error) return <Alert tone="danger">No se pudo buscar.</Alert>;
  if (!results.data?.length) {
    return (
      <Card className="p-8 text-center text-sm text-muted">
        No encontramos nada con “{q}”. Probá con otras palabras.
      </Card>
    );
  }
  return (
    <ul className="space-y-2" aria-label="Resultados">
      {results.data.map((h) => {
        const Icon = h.source === 'ARTICLE' ? BookOpen : h.source === 'DOCUMENT' ? FileText : Cable;
        const to =
          h.source === 'ARTICLE'
            ? `/conocimiento/articulos/${h.id}`
            : h.source === 'INTEGRATION'
              ? `/integraciones/${h.id}`
              : null;
        // Los PDF se abren en el visor del navegador, en la página donde está el texto.
        const href =
          h.source === 'DOCUMENT' && h.fileId
            ? `/api/attachments/${h.fileId}?inline=1${h.pageNumber ? `#page=${h.pageNumber}` : ''}`
            : null;
        const title = (
          <span className="font-medium text-brand group-hover:underline">
            {h.code && <span className="mr-1 font-mono text-xs text-muted">{h.code}</span>}
            {h.title}
          </span>
        );
        return (
          <li key={`${h.source}-${h.id}-${h.pageNumber}`}>
            <Card className="group p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Icon className="size-4 text-muted" aria-hidden />
                {to ? (
                  <Link to={to} className="group">
                    {title}
                  </Link>
                ) : href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="group">
                    {title}
                  </a>
                ) : (
                  title
                )}
                <Badge>
                  {h.source === 'ARTICLE'
                    ? 'Artículo'
                    : h.source === 'DOCUMENT'
                      ? `Documento${h.pageNumber ? ` · pág. ${h.pageNumber}` : ''}`
                      : 'Integración'}
                </Badge>
              </div>
              <Snippet text={h.snippet} />
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function ArticlesTab() {
  const can = useHasPermission();
  const [category, setCategory] = useState<KnowledgeCategory | ''>('');
  const articles = useQuery({
    queryKey: ['knowledge', 'articles', category],
    queryFn: () =>
      api<Paginated<ArticleListItem>>('/knowledge/articles', {
        query: { category: category || undefined, pageSize: 100 },
      }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <div className="mb-3">
        <Select
          aria-label="Categoría"
          className="w-auto"
          value={category}
          onChange={(e) => setCategory(e.target.value as KnowledgeCategory | '')}
        >
          <option value="">Todas las categorías</option>
          {KNOWLEDGE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {KNOWLEDGE_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </div>
      {articles.isLoading ? (
        <Spinner />
      ) : !articles.data?.items.length ? (
        <Card className="p-8 text-center text-sm text-muted">
          Todavía no hay artículos{category ? ' en esta categoría' : ''}.
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {articles.data.items.map((a) => (
            <li key={a.id}>
              <Link to={`/conocimiento/articulos/${a.id}`} className="block h-full">
                <Card className="h-full space-y-1.5 p-4 hover:border-brand">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span className="font-mono">{a.code}</span>·
                    <span>{KNOWLEDGE_CATEGORY_LABELS[a.category]}</span>
                    {a.template === 'ERROR_SHEET' && (
                      <Badge tone="warning">{ARTICLE_TEMPLATE_LABELS.ERROR_SHEET}</Badge>
                    )}
                    {can('kb.manage') && (
                      <>
                        <ArticleStatusBadge status={a.status} />
                        <VisibilityBadge visibility={a.visibility} />
                      </>
                    )}
                  </div>
                  <p className="font-medium">{a.title}</p>
                  {a.tags.length > 0 && (
                    <p className="flex flex-wrap gap-1">
                      {a.tags.map((t) => (
                        <span key={t} className="rounded bg-bg px-1.5 py-0.5 text-xs text-muted">
                          #{t}
                        </span>
                      ))}
                    </p>
                  )}
                  <p className="text-xs text-muted">Actualizado {formatDateTime(a.updatedAt)}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
