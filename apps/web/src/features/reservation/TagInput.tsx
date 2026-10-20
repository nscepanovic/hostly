import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Tag, X } from 'lucide-react';
import type { TagKind } from '@hostly/shared';
import { useTags } from '@/lib/queries';

/** Chips for predefined tags of a kind, plus free text entries. */
export function TagInput({ kind, tags, onChange }: { kind: TagKind; tags: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useTranslation();
  const { data: all = [] } = useTags();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const options = all.filter((tag) => tag.kind === kind);
  const colorOf = new Map(all.map((tag) => [tag.label, tag.color]));
  const toggle = (label: string) => onChange(tags.includes(label) ? tags.filter((x) => x !== label) : [...tags, label]);
  const addText = () => {
    const v = text.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setText('');
  };

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag size={16} className="text-muted" />
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm font-medium text-white"
            style={{ background: colorOf.get(tag) ?? '#64748b' }}
          >
            {tag} <X size={14} />
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-full bg-accent px-3 text-sm font-semibold text-accent-ink"
        >
          {t('reservation.addTag')} <Plus size={14} />
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.label)}
              className={`h-9 rounded-full border px-3 text-sm ${tags.includes(o.label) ? 'border-transparent text-white' : 'border-border'}`}
              style={tags.includes(o.label) ? { background: o.color } : undefined}
            >
              {o.label}
            </button>
          ))}
          <input
            className="field h-9 w-40 flex-1"
            placeholder={t('reservation.typeHere')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addText();
              }
            }}
            onBlur={addText}
          />
        </div>
      )}
    </div>
  );
}
