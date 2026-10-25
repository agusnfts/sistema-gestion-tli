import { useEffect } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo,
  Undo,
} from 'lucide-react';
import { isHtml } from '@tli/shared';
import { cn } from '@/lib/utils';

/**
 * Muestra texto guardado: el HTML del editor (ya sanitizado por el servidor, ADR 0009) o
 * texto plano de antes del editor, respetando renglones.
 */
export function RichText({ value, className }: { value: string; className?: string }) {
  if (!isHtml(value)) {
    return <p className={cn('whitespace-pre-wrap', className)}>{value}</p>;
  }
  // HTML sanitizado en el servidor (lista blanca); la CSP es la segunda barrera.
  return <div className={cn('rich-text', className)} dangerouslySetInnerHTML={{ __html: value }} />;
}

/** El editor vacío devuelve "<p></p>": para validar, se considera vacío. */
export function isRichTextEmpty(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').trim() === '';
}

/** Texto plano anterior al editor → párrafos HTML, para poder editarlo. */
function toEditorHtml(value: string): string {
  if (!value || isHtml(value)) return value;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return value
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-fg disabled:opacity-40',
        active && 'bg-primary-soft text-primary',
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      code: e.isActive('codeBlock'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Dirección del enlace (https://…)', prev ?? 'https://');
    if (url === null) return;
    if (!url.trim()) chain().extendMarkRange('link').unsetLink().run();
    else chain().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };
  return (
    <div
      role="toolbar"
      aria-label="Formato"
      className="flex flex-wrap gap-0.5 border-b border-border px-1 py-1"
    >
      <ToolbarButton label="Negrita" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold className="size-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton label="Cursiva" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic className="size-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Título"
        active={s.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Subtítulo"
        active={s.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="size-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Lista"
        active={s.bullet}
        onClick={() => chain().toggleBulletList().run()}
      >
        <List className="size-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Lista numerada"
        active={s.ordered}
        onClick={() => chain().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton label="Cita" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote className="size-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton label="Código" active={s.code} onClick={() => chain().toggleCodeBlock().run()}>
        <Code className="size-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton label="Enlace" active={s.link} onClick={setLink}>
        <LinkIcon className="size-4" aria-hidden />
      </ToolbarButton>
      <span className="mx-1 w-px self-stretch bg-border" aria-hidden />
      <ToolbarButton label="Deshacer" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
        <Undo className="size-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton label="Rehacer" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
        <Redo className="size-4" aria-hidden />
      </ToolbarButton>
    </div>
  );
}

/** Editor de texto enriquecido (TipTap). Devuelve HTML; el servidor lo sanitiza al guardar. */
export function RichTextEditor({
  value,
  onChange,
  label,
  placeholder,
  minHeight = '8rem',
  className,
  id,
}: {
  value: string;
  onChange: (html: string) => void;
  label: string;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  id?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] },
      }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: toEditorHtml(value),
    editorProps: {
      attributes: {
        id: id ?? '',
        'aria-label': label,
        'aria-multiline': 'true',
        role: 'textbox',
        class: 'rich-text min-h-[var(--editor-min-h)] px-3 py-2 text-sm focus:outline-none',
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  });

  // Si el valor cambia desde afuera (ej. se limpió después de enviar), se refleja.
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (value !== current) editor.commands.setContent(toEditorHtml(value), { emitUpdate: false });
  }, [value, editor]);

  return (
    <div
      className={cn(
        'rounded-[var(--radius-control)] border border-border-strong bg-surface focus-within:outline focus-within:outline-2 focus-within:outline-brand',
        className,
      )}
      style={{ ['--editor-min-h' as string]: minHeight }}
    >
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
