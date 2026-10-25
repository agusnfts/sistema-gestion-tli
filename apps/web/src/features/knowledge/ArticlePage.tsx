import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, History, Pencil } from 'lucide-react';
import {
  ARTICLE_TEMPLATE_LABELS,
  KNOWLEDGE_CATEGORY_LABELS,
  type ArticleDetail,
  type ArticleStatus,
} from '@tli/shared';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useHasPermission } from '@/lib/auth';
import { Button, buttonClasses } from '@/components/ui/button';
import { Alert, Badge, Card, Spinner } from '@/components/ui/misc';
import { RichText } from '@/components/ui/rich-text';
import { errorText } from '@/features/problems/components';
import { ArticleStatusBadge, VisibilityBadge } from './components';

const ERROR_SECTIONS = [
  ['errorSymptom', 'Síntoma'],
  ['errorCause', 'Causa'],
  ['errorSolution', 'Solución'],
  ['errorSteps', 'Pasos'],
] as const;

export function ArticlePage() {
  const { id = '' } = useParams();
  const can = useHasPermission();
  const qc = useQueryClient();
  const [versionId, setVersionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const key = ['knowledge', 'article', id, versionId];
  const article = useQuery({
    queryKey: key,
    queryFn: () =>
      api<ArticleDetail>(`/knowledge/articles/${id}`, {
        query: versionId ? { version: versionId } : undefined,
      }),
  });
  const refresh = (d: ArticleDetail) => {
    setVersionId(null);
    qc.setQueryData(['knowledge', 'article', id, null], d);
    void qc.invalidateQueries({ queryKey: ['knowledge', 'articles'] });
  };
  const status = useMutation({
    mutationFn: (s: ArticleStatus) =>
      api<ArticleDetail>(`/knowledge/articles/${id}/status`, {
        method: 'POST',
        body: { status: s },
      }),
    onSuccess: refresh,
  });
  const restore = useMutation({
    mutationFn: (vid: string) =>
      api<ArticleDetail>(`/knowledge/articles/${id}/versions/${vid}/restore`, { method: 'POST' }),
    onSuccess: refresh,
  });

  if (article.isLoading) return <Spinner />;
  if (!article.data) return <Alert tone="warning" title="No encontramos el artículo" />;
  const a = article.data;
  const v = a.current;
  const old = versionId !== null && v.version !== a.version;
  const error = status.error ?? restore.error;

  return (
    <>
      <Link
        to="/conocimiento"
        className="mb-3 inline-flex items-center gap-1 text-sm text-brand hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> Conocimiento
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <article className="min-w-0 space-y-4">
          <header>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <span className="font-mono">{a.code}</span>·
              <span>{KNOWLEDGE_CATEGORY_LABELS[a.category]}</span>
              {a.template === 'ERROR_SHEET' && (
                <Badge tone="warning">{ARTICLE_TEMPLATE_LABELS.ERROR_SHEET}</Badge>
              )}
              {a.canEdit && (
                <>
                  <ArticleStatusBadge status={a.status} />
                  <VisibilityBadge visibility={a.visibility} />
                </>
              )}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-brand">{v.title}</h1>
            <p className="mt-1 text-xs text-muted">
              Versión {v.version} · {v.author.fullName} · {formatDateTime(v.createdAt)}
            </p>
          </header>

          {old && (
            <Alert tone="warning">
              Estás viendo la versión {v.version}; la vigente es la {a.version}.{' '}
              <button className="underline" onClick={() => setVersionId(null)}>
                Ver la vigente
              </button>
            </Alert>
          )}
          {error && <Alert tone="danger">{errorText(error)}</Alert>}

          {a.template === 'ERROR_SHEET' && (
            <Card className="divide-y divide-border">
              {ERROR_SECTIONS.filter(([k]) => v[k]).map(([k, label]) => (
                <section key={k} className="p-4">
                  <h2 className="mb-1 text-sm font-semibold text-brand">{label}</h2>
                  <p className="whitespace-pre-wrap text-sm">{v[k]}</p>
                </section>
              ))}
            </Card>
          )}
          {v.body && (
            <Card className="p-5">
              <RichText value={v.body} className="text-sm" />
            </Card>
          )}
          {a.tags.length > 0 && (
            <p className="flex flex-wrap gap-1">
              {a.tags.map((t) => (
                <span key={t} className="rounded bg-bg px-1.5 py-0.5 text-xs text-muted">
                  #{t}
                </span>
              ))}
            </p>
          )}
        </article>

        {a.canEdit && (
          <aside className="space-y-4">
            <Card className="space-y-3 p-4 text-sm">
              <Link
                to={`/conocimiento/articulos/${id}/editar`}
                className={buttonClasses('primary', 'sm', 'w-full')}
              >
                <Pencil className="size-4" aria-hidden /> Editar
              </Link>
              {can('kb.publish') && (
                <div className="flex flex-wrap gap-1.5">
                  {a.status !== 'PUBLISHED' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={status.isPending}
                      onClick={() => status.mutate('PUBLISHED')}
                    >
                      Publicar
                    </Button>
                  )}
                  {a.status === 'PUBLISHED' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={status.isPending}
                      onClick={() => status.mutate('DRAFT')}
                    >
                      Volver a borrador
                    </Button>
                  )}
                  {a.status !== 'ARCHIVED' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={status.isPending}
                      onClick={() => status.mutate('ARCHIVED')}
                    >
                      Archivar
                    </Button>
                  )}
                </div>
              )}
              <p className="text-xs text-muted">
                {a.visibility === 'PUBLIC'
                  ? 'Público: cuando está publicado lo ven todos los usuarios.'
                  : 'Interno: solo lo ve IT.'}
              </p>
              {(a.source.ticket || a.source.problem) && (
                <p className="text-xs">
                  Generado desde{' '}
                  {a.source.ticket && (
                    <Link
                      to={`/tickets/${a.source.ticket.id}`}
                      className="text-brand hover:underline"
                    >
                      {a.source.ticket.number}
                    </Link>
                  )}
                  {a.source.problem && (
                    <Link
                      to={`/problemas/${a.source.problem.id}`}
                      className="text-brand hover:underline"
                    >
                      {a.source.problem.code}
                    </Link>
                  )}
                </p>
              )}
            </Card>

            <Card className="p-4 text-sm">
              <button
                className="flex w-full items-center justify-between font-semibold"
                aria-expanded={showHistory}
                onClick={() => setShowHistory(!showHistory)}
              >
                <span className="inline-flex items-center gap-1.5">
                  <History className="size-4" aria-hidden /> Versiones ({a.history.length})
                </span>
              </button>
              {showHistory && (
                <ol className="mt-2 space-y-2">
                  {a.history.map((h) => (
                    <li key={h.id} className="text-xs">
                      <button
                        className={h.id === v.id ? 'font-semibold' : 'text-brand hover:underline'}
                        onClick={() => setVersionId(h.id === a.history[0]?.id ? null : h.id)}
                      >
                        v{h.version} · {h.author.fullName}
                      </button>
                      <span className="block text-muted">{formatDateTime(h.createdAt)}</span>
                      {h.id !== a.history[0]?.id && h.id === v.id && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-1"
                          loading={restore.isPending}
                          onClick={() => restore.mutate(h.id)}
                        >
                          Restaurar esta versión
                        </Button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </aside>
        )}
      </div>
    </>
  );
}
