import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Circle, Pencil, Plus, RotateCw, Save, Square, Trash2, Undo2 } from 'lucide-react';
import type { AreaDto, JoinGroupDto, TableDto, TableShape as Shape } from '@hostly/shared';
import { TableShape } from '@/components/floor/TableShape';
import { Button, IconButton } from '@/components/ui/Button';
import { confirmDialog } from '@/components/ui/Confirm';
import { Segmented } from '@/components/ui/Segmented';
import { toast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { qk, useAreas, useJoinGroups, useTables } from '@/lib/queries';

/** A table being edited; `id` is undefined until saved. */
interface DraftTable extends Omit<TableDto, 'id'> {
  id?: string;
  key: string;
}

const GRID = 10;
const snap = (v: number) => Math.round(v / GRID) * GRID;
const SEAT_TEMPLATES = [2, 4, 6, 8, 10];
const MIN_FOR: Record<number, number> = { 2: 1, 4: 2, 6: 4, 8: 6, 10: 8 };

function templateSize(shape: Shape, seats: number) {
  if (shape === 'round') {
    const d = { 2: 80, 4: 100, 6: 120, 8: 140, 10: 160 }[seats] ?? 100;
    return { w: d, h: d };
  }
  return { 2: { w: 80, h: 80 }, 4: { w: 90, h: 100 }, 6: { w: 160, h: 90 }, 8: { w: 200, h: 90 }, 10: { w: 240, h: 90 } }[seats] ?? { w: 90, h: 90 };
}

let keySeq = 0;
const toDraft = (t: TableDto): DraftTable => ({ ...t, key: t.id });

function nextLabel(tables: DraftTable[]) {
  const nums = tables.map((t) => Number(t.label.match(/(\d+)\s*$/)?.[1] ?? 0));
  const prefix = tables.find((t) => /\d+\s*$/.test(t.label))?.label.replace(/\d+\s*$/, '') ?? 'br ';
  return `${prefix}${Math.max(0, ...nums) + 1}`;
}

type Interaction =
  | { kind: 'move'; key: string; startX: number; startY: number; origX: number; origY: number }
  | { kind: 'resize'; key: string; startX: number; startY: number; origW: number; origH: number }
  | { kind: 'rotate'; key: string; cx: number; cy: number };

export default function EditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: areas = [] } = useAreas();
  const { data: allTables } = useTables();
  const { data: groups = [] } = useJoinGroups();
  const [areaId, setAreaId] = useState<string | null>(null);
  const [tab, setTab] = useState<'tables' | 'joined'>('tables');
  const [tables, setTables] = useState<DraftTable[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [history, setHistory] = useState<Array<{ tables: DraftTable[]; deleted: string[] }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const action = useRef<Interaction | null>(null);

  const area = areas.find((a) => a.id === areaId) ?? areas[0];

  // Load the area's tables whenever the area changes (and on first data).
  useEffect(() => {
    if (!allTables || !area) return;
    setTables(allTables.filter((tb) => tb.areaId === area.id && tb.active).map(toDraft));
    setDeleted([]);
    setHistory([]);
    setSelected(null);
    setDirty(false);
  }, [allTables, area]);

  const viewBox = useMemo(() => {
    const maxX = Math.max(1000, ...tables.map((tb) => tb.x + tb.w + 60));
    const maxY = Math.max(700, ...tables.map((tb) => tb.y + tb.h + 60));
    return { w: maxX, h: maxY };
    // Recomputed only when the table count changes, so dragging never shifts the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.length, area?.id]);

  const commit = (next: DraftTable[], nextDeleted = deleted) => {
    setHistory((h) => [...h.slice(-50), { tables, deleted }]);
    setTables(next);
    setDeleted(nextDeleted);
    setDirty(true);
  };
  const undo = () => {
    const last = history.at(-1);
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setTables(last.tables);
    setDeleted(last.deleted);
  };
  const update = (key: string, patch: Partial<DraftTable>) => commit(tables.map((tb) => (tb.key === key ? { ...tb, ...patch } : tb)));

  const svgPoint = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: pt.x, y: pt.y };
  };

  const begin = (e: ReactPointerEvent, i: Interaction) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setHistory((h) => [...h.slice(-50), { tables, deleted }]);
    action.current = i;
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const a = action.current;
    if (!a) return;
    const p = svgPoint(e);
    setTables((ts) =>
      ts.map((tb) => {
        if (tb.key !== a.key) return tb;
        if (a.kind === 'move') return { ...tb, x: snap(a.origX + p.x - a.startX), y: snap(a.origY + p.y - a.startY) };
        if (a.kind === 'resize') {
          const w = Math.max(40, snap(a.origW + p.x - a.startX));
          const h = Math.max(40, snap(a.origH + p.y - a.startY));
          return tb.shape === 'round' ? { ...tb, w: Math.max(w, h), h: Math.max(w, h) } : { ...tb, w, h };
        }
        const deg = (Math.atan2(p.y - a.cy, p.x - a.cx) * 180) / Math.PI + 90;
        return { ...tb, rotation: Math.round(deg / 15) * 15 };
      }),
    );
    setDirty(true);
  };
  const onPointerUp = () => {
    action.current = null;
  };

  const addTable = (shape: Shape, seats: number) => {
    if (!area) return;
    const size = templateSize(shape, seats);
    const key = `new-${++keySeq}`;
    // Drop new tables near the top-left free-ish spot; staff then drag them into place.
    const offset = (tables.length % 6) * 30;
    commit([
      ...tables,
      {
        key,
        areaId: area.id,
        label: nextLabel(tables),
        shape,
        x: snap(40 + offset),
        y: snap(40 + offset),
        ...size,
        rotation: 0,
        minSeats: MIN_FOR[seats] ?? 1,
        maxSeats: seats,
        rating: 5,
        active: true,
      },
    ]);
    setSelected(key);
  };

  const removeSelected = () => {
    const tb = tables.find((x) => x.key === selected);
    if (!tb) return;
    commit(
      tables.filter((x) => x.key !== selected),
      tb.id ? [...deleted, tb.id] : deleted,
    );
    setSelected(null);
  };

  const save = useMutation({
    mutationFn: () =>
      api.put<TableDto[]>('/floor-plan', {
        areaId: area!.id,
        tables: tables.map(({ key: _key, ...tb }) => tb),
        deletedTableIds: deleted,
      }),
    onSuccess: (rows) => {
      qc.setQueryData(qk.tables, rows);
      toast.success(t('editor.saved'));
      setDirty(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const leave = async () => {
    if (dirty && !(await confirmDialog(t('editor.discard'), { danger: true })).ok) return;
    navigate('/');
  };
  const switchArea = async (id: string) => {
    if (dirty && !(await confirmDialog(t('editor.discard'), { danger: true })).ok) return;
    setAreaId(id);
  };

  // Areas
  const areaMutation = useMutation({
    mutationFn: async (op: { kind: 'create' | 'rename' | 'delete'; area?: AreaDto; name?: string }) => {
      if (op.kind === 'create') return api.post<AreaDto>('/areas', { name: op.name, sort: areas.length });
      if (op.kind === 'rename') return api.patch<AreaDto>(`/areas/${op.area!.id}`, { name: op.name, sort: op.area!.sort });
      return api.delete(`/areas/${op.area!.id}`);
    },
    onSuccess: (res, op) => {
      void qc.invalidateQueries({ queryKey: qk.areas });
      void qc.invalidateQueries({ queryKey: qk.tables });
      if (op.kind === 'create' && res) setAreaId((res as AreaDto).id);
      if (op.kind === 'delete') setAreaId(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const promptName = async (title: string, initial = '') => {
    const { ok, text } = await confirmDialog(title, { input: t('editor.areaName') });
    return ok ? (text || initial).trim() : '';
  };

  // Joined tables
  const [groupDraft, setGroupDraft] = useState<{ id?: string; name: string; tableIds: string[] } | null>(null);
  const groupMutation = useMutation({
    mutationFn: async (op: { kind: 'save' | 'delete'; group: { id?: string; name: string; tableIds: string[] } }) => {
      if (op.kind === 'delete') return api.delete(`/join-groups/${op.group.id}`);
      const body = { name: op.group.name, tableIds: op.group.tableIds };
      return op.group.id ? api.put<JoinGroupDto>(`/join-groups/${op.group.id}`, body) : api.post<JoinGroupDto>('/join-groups', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.joinGroups });
      setGroupDraft(null);
      toast.success(t('common.saved'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const sel = tables.find((tb) => tb.key === selected);
  const groupTableIds = new Set(groupDraft?.tableIds ?? []);
  const groupCap = (ids: string[]) => {
    const ts = (allTables ?? []).filter((tb) => ids.includes(tb.id));
    return { min: ts.reduce((n, tb) => n + tb.minSeats, 0), max: ts.reduce((n, tb) => n + tb.maxSeats, 0) };
  };
  const labelOf = new Map((allTables ?? []).map((tb) => [tb.id, tb.label]));

  const onTableDown = (e: ReactPointerEvent, tb: DraftTable) => {
    if (tab === 'joined') {
      e.stopPropagation();
      if (!groupDraft || !tb.id) return;
      const ids = groupTableIds.has(tb.id) ? groupDraft.tableIds.filter((x) => x !== tb.id) : [...groupDraft.tableIds, tb.id];
      setGroupDraft({ ...groupDraft, tableIds: ids });
      return;
    }
    setSelected(tb.key);
    const p = svgPoint(e);
    begin(e, { kind: 'move', key: tb.key, startX: p.x, startY: p.y, origX: tb.x, origY: tb.y });
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <h1 className="text-xl font-bold text-accent">{t('editor.title')}</h1>
        <Button icon={<ArrowLeft size={18} />} onClick={leave}>
          {t('common.back')}
        </Button>
        <IconButton label={t('common.undo')} onClick={undo} disabled={!history.length} className="border border-border">
          <Undo2 size={20} />
        </IconButton>
        <select className="field h-11 w-auto min-w-32 flex-1 sm:flex-none" value={area?.id ?? ''} onChange={(e) => void switchArea(e.target.value)}>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <IconButton
          label={t('editor.renameArea')}
          className="border border-border"
          onClick={async () => {
            const name = await promptName(t('editor.renameArea'), area?.name);
            if (name && area) areaMutation.mutate({ kind: 'rename', area, name });
          }}
        >
          <Pencil size={18} />
        </IconButton>
        <IconButton
          label={t('editor.addArea')}
          className="border border-border"
          onClick={async () => {
            const name = await promptName(t('editor.addArea'));
            if (name) areaMutation.mutate({ kind: 'create', name });
          }}
        >
          <Plus size={20} />
        </IconButton>
        {areas.length > 1 && (
          <IconButton
            label={t('editor.deleteArea')}
            className="border border-border text-danger"
            onClick={async () => {
              if (area && (await confirmDialog(`${t('editor.deleteArea')}: ${area.name}?`, { danger: true })).ok) areaMutation.mutate({ kind: 'delete', area });
            }}
          >
            <Trash2 size={18} />
          </IconButton>
        )}
        <div className="flex-1" />
        {dirty && <span className="text-sm text-warn">{t('editor.unsaved')}</span>}
        <Button variant="primary" icon={<Save size={18} />} onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {t('common.save')}
        </Button>
      </header>

      <div className="flex justify-center border-b border-border bg-surface px-3 py-2">
        <Segmented
          className="w-full max-w-md"
          value={tab}
          onChange={(v) => {
            setTab(v);
            setSelected(null);
          }}
          options={[
            { value: 'tables', label: t('editor.tables') },
            { value: 'joined', label: t('editor.joined') },
          ]}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 flex-1 overflow-auto">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}
            className="h-full w-full touch-none select-none"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerDown={() => tab === 'tables' && setSelected(null)}
          >
            <defs>
              <pattern id="egrid" width={GRID * 2} height={GRID * 2} patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1.2" fill="var(--color-border)" />
              </pattern>
            </defs>
            <rect width={viewBox.w} height={viewBox.h} fill="url(#egrid)" />
            {tables.map((tb) => {
              const isSel = tb.key === selected;
              const inGroup = !!tb.id && groupTableIds.has(tb.id);
              return (
                <g key={tb.key} transform={`translate(${tb.x} ${tb.y})`} onPointerDown={(e) => onTableDown(e, tb)} className="cursor-move">
                  <TableShape
                    table={tb}
                    fill={inGroup ? 'var(--color-st-pending)' : isSel ? 'var(--color-st-reserved)' : 'var(--color-st-free)'}
                    stroke={isSel || inGroup ? 'var(--color-accent)' : 'rgba(255,255,255,0.15)'}
                    strokeWidth={isSel ? 4 : 2}
                  >
                    <text x={tb.w / 2} y={-22} textAnchor="middle" fontSize={13} fill="var(--color-muted)">
                      {tb.minSeats}-{tb.maxSeats} · ★{tb.rating}
                    </text>
                    <text x={tb.w / 2} y={tb.h / 2 + 6} textAnchor="middle" fontSize={18} fontWeight={700} fill="var(--color-text)">
                      {tb.label}
                    </text>
                  </TableShape>
                  {isSel && tab === 'tables' && (
                    <>
                      {/* Resize handle (bottom-right) */}
                      <circle
                        cx={tb.w}
                        cy={tb.h}
                        r={14}
                        fill="var(--color-accent)"
                        className="cursor-nwse-resize"
                        onPointerDown={(e) => {
                          const p = svgPoint(e);
                          begin(e, { kind: 'resize', key: tb.key, startX: p.x, startY: p.y, origW: tb.w, origH: tb.h });
                        }}
                      />
                      {/* Rotate handle (above) */}
                      <g
                        transform={`translate(${tb.w / 2} -48)`}
                        className="cursor-grab"
                        onPointerDown={(e) => begin(e, { kind: 'rotate', key: tb.key, cx: tb.x + tb.w / 2, cy: tb.y + tb.h / 2 })}
                      >
                        <circle r={14} fill="var(--color-accent)" />
                        <RotateCw x={-9} y={-9} width={18} height={18} color="var(--color-accent-ink)" />
                      </g>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="max-h-[45%] shrink-0 overflow-y-auto border-t border-border bg-surface p-3 lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l">
          {tab === 'tables' ? (
            <>
              <div className="label">{t('editor.palette')}</div>
              <div className="mb-4 grid grid-cols-5 gap-2">
                {(['rect', 'round'] as const).flatMap((shape) =>
                  SEAT_TEMPLATES.map((seats) => (
                    <button
                      key={`${shape}-${seats}`}
                      type="button"
                      onClick={() => addTable(shape, seats)}
                      className="flex h-14 flex-col items-center justify-center rounded-xl border border-border bg-surface-2 active:scale-95"
                      aria-label={`${t(`editor.${shape}`)} ${seats}`}
                    >
                      {shape === 'round' ? <Circle size={18} /> : <Square size={18} />}
                      <span className="text-sm font-bold">{seats}</span>
                    </button>
                  )),
                )}
              </div>
              {sel ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="col-span-2">
                    <span className="label">{t('editor.label')}</span>
                    <input className="field" value={sel.label} onChange={(e) => update(sel.key, { label: e.target.value })} />
                  </label>
                  <NumberField label={t('editor.minSeats')} value={sel.minSeats} min={1} onChange={(v) => update(sel.key, { minSeats: v, maxSeats: Math.max(v, sel.maxSeats) })} />
                  <NumberField label={t('editor.maxSeats')} value={sel.maxSeats} min={1} onChange={(v) => update(sel.key, { maxSeats: v, minSeats: Math.min(v, sel.minSeats) })} />
                  <NumberField label={t('editor.rating')} value={sel.rating} min={1} max={10} onChange={(v) => update(sel.key, { rating: v })} />
                  <label>
                    <span className="label">{t('editor.shape')}</span>
                    <select
                      className="field"
                      value={sel.shape}
                      onChange={(e) => {
                        const shape = e.target.value as Shape;
                        update(sel.key, shape === 'round' ? { shape, h: sel.w } : { shape });
                      }}
                    >
                      <option value="rect">{t('editor.rect')}</option>
                      <option value="round">{t('editor.round')}</option>
                    </select>
                  </label>
                  <NumberField label={t('editor.width')} value={sel.w} min={40} step={10} onChange={(v) => update(sel.key, sel.shape === 'round' ? { w: v, h: v } : { w: v })} />
                  <NumberField label={t('editor.height')} value={sel.h} min={40} step={10} onChange={(v) => update(sel.key, sel.shape === 'round' ? { w: v, h: v } : { h: v })} />
                  <NumberField label={t('editor.rotation')} value={sel.rotation} min={-360} max={360} step={15} onChange={(v) => update(sel.key, { rotation: v })} />
                  <Button variant="danger" className="col-span-2" icon={<Trash2 size={18} />} onClick={removeSelected}>
                    {t('editor.deleteTable')}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted">{t('editor.selectTable')}</p>
              )}
            </>
          ) : (
            <>
              {groupDraft ? (
                <div className="flex flex-col gap-3">
                  <label>
                    <span className="label">{t('editor.groupName')}</span>
                    <input
                      className="field"
                      value={groupDraft.name}
                      placeholder={groupDraft.tableIds.map((id) => labelOf.get(id)).join(' + ')}
                      onChange={(e) => setGroupDraft({ ...groupDraft, name: e.target.value })}
                    />
                  </label>
                  <p className="text-sm text-muted">{t('editor.groupHint')}</p>
                  <div className="font-semibold">
                    {groupDraft.tableIds.map((id) => labelOf.get(id)).join(' + ') || '—'}{' '}
                    <span className="text-sm font-normal text-muted">{t('editor.groupCapacity', groupCap(groupDraft.tableIds))}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => setGroupDraft(null)}>{t('common.cancel')}</Button>
                    {groupDraft.id && (
                      <Button variant="danger" onClick={() => groupMutation.mutate({ kind: 'delete', group: groupDraft })}>
                        <Trash2 size={18} />
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      className="flex-1"
                      disabled={groupDraft.tableIds.length < 2}
                      onClick={() =>
                        groupMutation.mutate({
                          kind: 'save',
                          group: { ...groupDraft, name: groupDraft.name.trim() || groupDraft.tableIds.map((id) => labelOf.get(id)).join(' + ') },
                        })
                      }
                    >
                      {t('common.save')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button variant="primary" icon={<Plus size={18} />} onClick={() => setGroupDraft({ name: '', tableIds: [] })}>
                    {t('editor.newGroup')}
                  </Button>
                  {!groups.length && <p className="text-sm text-muted">{t('editor.noGroups')}</p>}
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGroupDraft({ id: g.id, name: g.name, tableIds: g.tableIds })}
                      className="flex h-12 items-center justify-between rounded-lg bg-surface-2 px-3 text-left"
                    >
                      <span className="font-semibold">{g.name}</span>
                      <span className="text-sm text-muted">{t('editor.groupCapacity', groupCap(g.tableIds))}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="min-w-0">
      <span className="label">{label}</span>
      <input
        className="field tabular-nums"
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
        }}
      />
    </label>
  );
}
