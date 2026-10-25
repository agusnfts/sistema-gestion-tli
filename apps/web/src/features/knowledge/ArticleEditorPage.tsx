import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import {
  ARTICLE_TEMPLATES,
  ARTICLE_TEMPLATE_LABELS,
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_CATEGORY_LABELS,
  VISIBILITIES,
  VISIBILITY_LABELS,
  type ArticleDetail,
  type ArticleTemplate,
  type KnowledgeCategory,
  type KnowledgeVisibility,
  type ProblemDetail,
  type TicketDetail,
} from '@tli/shared';
import { api } from '@/lib/api';
import { useHasPermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, PageHeader, Spinner } from '@/components/ui/misc';
import { RichTextEditor } from '@/components/ui/rich-text';
import { errorText } from '@/features/problems/components';
import { parseTags } from './components';

const textareaClass =
  'w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm';

type Form = {
  title: string;
  category: KnowledgeCategory;
  template: ArticleTemplate;
  visibility: KnowledgeVisibility;
  tags: string;
  body: string;
  errorSymptom: string;
  errorCause: string;
  errorSolution: string;
  errorSteps: string;
};

const EMPTY: Form = {
  title: '',
  category: 'PROCEDURES',
  template: 'FREE',
  visibility: 'INTERNAL',
  tags: '',
  body: '',
  errorSymptom: '',
  errorCause: '',
  errorSolution: '',
  errorSteps: '',
};

/**
 * Alta y edición de artículos. Con ?ticket= o ?problem= arranca como ficha de error con los
 * datos del ticket o problema resuelto ("promoción" a la base de conocimiento).
 */
export function ArticleEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const ticketId = params.get('ticket');
  const problemId = params.get('problem');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const can = useHasPermission();
  const [form, setForm] = useState<Form | null>(id ? null : EMPTY);
  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const existing = useQuery({
    queryKey: ['knowledge', 'article', id, null],
    queryFn: () => api<ArticleDetail>(`/knowledge/articles/${id}`),
    enabled: !!id,
  });
  const ticket = useQuery({
    queryKey: ['tickets', 'detail', ticketId],
    queryFn: () => api<TicketDetail>(`/tickets/${ticketId}`),
    enabled: !id && !!ticketId,
  });
  const problem = useQuery({
    queryKey: ['problems', 'detail', problemId],
    queryFn: () => api<ProblemDetail>(`/problems/${problemId}`),
    enabled: !id && !!problemId,
  });

  useEffect(() => {
    const a = existing.data;
    if (!a) return;
    setForm({
      title: a.current.title,
      category: a.category,
      template: a.template,
      visibility: a.visibility,
      tags: a.tags.join(', '),
      body: a.current.body,
      errorSymptom: a.current.errorSymptom ?? '',
      errorCause: a.current.errorCause ?? '',
      errorSolution: a.current.errorSolution ?? '',
      errorSteps: a.current.errorSteps ?? '',
    });
  }, [existing.data]);

  useEffect(() => {
    const t = ticket.data;
    if (!t) return;
    setForm({
      ...EMPTY,
      title: t.subject,
      template: 'ERROR_SHEET',
      category: t.category === 'TMS' ? 'TMS' : t.category === 'WMS' ? 'WMS' : 'FREQUENT_ERRORS',
      errorSymptom: t.description,
      errorCause: t.resolutionCause ?? '',
      errorSolution: t.resolutionSolution ?? '',
    });
  }, [ticket.data]);

  useEffect(() => {
    const p = problem.data;
    if (!p) return;
    setForm({
      ...EMPTY,
      title: p.title,
      template: 'ERROR_SHEET',
      category: 'FREQUENT_ERRORS',
      errorSymptom: p.description,
      errorCause: p.rootCause ?? '',
      errorSolution: [p.permanentSolution, p.workaround && `Mientras tanto: ${p.workaround}`]
        .filter(Boolean)
        .join('\n\n'),
    });
  }, [problem.data]);

  const save = useMutation({
    mutationFn: () => {
      const f = form!;
      const content = {
        title: f.title,
        body: f.body,
        errorSymptom: f.errorSymptom || null,
        errorCause: f.errorCause || null,
        errorSolution: f.errorSolution || null,
        errorSteps: f.errorSteps || null,
        category: f.category,
        tags: parseTags(f.tags),
        ...(can('kb.publish') ? { visibility: f.visibility } : {}),
      };
      return id
        ? api<ArticleDetail>(`/knowledge/articles/${id}/versions`, {
            method: 'POST',
            body: content,
          })
        : api<ArticleDetail>('/knowledge/articles', {
            method: 'POST',
            body: {
              ...content,
              template: f.template,
              sourceTicketId: ticketId,
              sourceProblemId: problemId,
            },
          });
    },
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ['knowledge'] });
      navigate(`/conocimiento/articulos/${a.id}`);
    },
  });

  if (!form || existing.isLoading || ticket.isLoading || problem.isLoading) return <Spinner />;
  const errorSheet = form.template === 'ERROR_SHEET';

  return (
    <>
      <Link
        to={id ? `/conocimiento/articulos/${id}` : '/conocimiento'}
        className="mb-3 inline-flex items-center gap-1 text-sm text-brand hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> Volver
      </Link>
      <PageHeader
        title={id ? `Editar ${existing.data?.code ?? 'artículo'}` : 'Nuevo artículo'}
        description={
          id
            ? 'Guardar crea una versión nueva; las anteriores quedan en el historial.'
            : ticketId || problemId
              ? 'Ficha de error a partir de lo que se resolvió. Revisá y completá antes de publicar.'
              : 'Se guarda como borrador hasta que se publique.'
        }
      />
      <Card className="max-w-4xl space-y-4 p-5">
        {save.error && <Alert tone="danger">{errorText(save.error)}</Alert>}
        <Field label="Título" required>
          {(p) => (
            <Input {...p} value={form.title} onChange={(e) => set('title', e.target.value)} />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Categoría">
            {(p) => (
              <Select
                {...p}
                value={form.category}
                onChange={(e) => set('category', e.target.value as KnowledgeCategory)}
              >
                {KNOWLEDGE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {KNOWLEDGE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Tipo">
            {(p) => (
              <Select
                {...p}
                disabled={!!id}
                value={form.template}
                onChange={(e) => set('template', e.target.value as ArticleTemplate)}
              >
                {ARTICLE_TEMPLATES.map((t) => (
                  <option key={t} value={t}>
                    {ARTICLE_TEMPLATE_LABELS[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Visibilidad"
            hint={can('kb.publish') ? undefined : 'La define quien publica.'}
          >
            {(p) => (
              <Select
                {...p}
                disabled={!can('kb.publish')}
                value={form.visibility}
                onChange={(e) => set('visibility', e.target.value as KnowledgeVisibility)}
              >
                {VISIBILITIES.map((v) => (
                  <option key={v} value={v}>
                    {VISIBILITY_LABELS[v]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Etiquetas" hint="Separadas por coma. Ej.: etiquetas, impresoras, despacho.">
          {(p) => <Input {...p} value={form.tags} onChange={(e) => set('tags', e.target.value)} />}
        </Field>

        {errorSheet &&
          (
            [
              ['errorSymptom', 'Síntoma', 'Qué ve el usuario (mensaje, pantalla, cuándo pasa).'],
              ['errorCause', 'Causa', 'Por qué pasa.'],
              ['errorSolution', 'Solución', 'Qué hacer para resolverlo.'],
              ['errorSteps', 'Pasos', 'Paso a paso, si hace falta.'],
            ] as const
          ).map(([k, label, hint]) => (
            <Field key={k} label={label} hint={hint}>
              {(p) => (
                <textarea
                  {...p}
                  rows={3}
                  className={textareaClass}
                  value={form[k]}
                  onChange={(e) => set(k, e.target.value)}
                />
              )}
            </Field>
          ))}

        <div>
          <p className="mb-1 text-sm font-medium">
            {errorSheet ? 'Notas adicionales' : 'Contenido'}
          </p>
          <RichTextEditor
            label={errorSheet ? 'Notas adicionales' : 'Contenido'}
            minHeight={errorSheet ? '6rem' : '16rem'}
            value={form.body}
            onChange={(html) => set('body', html)}
          />
        </div>
        <div className="flex gap-2">
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {id ? 'Guardar versión' : 'Crear borrador'}
          </Button>
        </div>
      </Card>
    </>
  );
}
