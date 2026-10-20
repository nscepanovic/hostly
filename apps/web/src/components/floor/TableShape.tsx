import type { ReactNode } from 'react';
import type { TableDto } from '@hostly/shared';

type Shape = Pick<TableDto, 'shape' | 'w' | 'h' | 'maxSeats'>;

const CHAIR = 14;
const GAP = 4;

/** Chair rectangles around a table in its local coordinate space. */
export function chairPositions(t: Shape): Array<{ x: number; y: number; w: number; h: number }> {
  const n = Math.max(1, t.maxSeats);
  if (t.shape === 'round') {
    const r = Math.min(t.w, t.h) / 2 + GAP + CHAIR / 2;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return { x: t.w / 2 + Math.cos(a) * r - CHAIR / 2, y: t.h / 2 + Math.sin(a) * r - CHAIR / 2, w: CHAIR, h: CHAIR };
    });
  }
  const horizontal = t.w >= t.h;
  const sideA = Math.ceil(n / 2);
  const sideB = n - sideA;
  const len = horizontal ? t.w : t.h;
  const along = (count: number, i: number) => (len / count) * (i + 0.5);
  const chairs: Array<{ x: number; y: number; w: number; h: number }> = [];
  const size = Math.min(len / Math.max(sideA, 1) - 6, 34);
  for (let i = 0; i < sideA; i++) {
    const c = along(sideA, i);
    chairs.push(horizontal ? { x: c - size / 2, y: -GAP - CHAIR, w: size, h: CHAIR } : { x: -GAP - CHAIR, y: c - size / 2, w: CHAIR, h: size });
  }
  for (let i = 0; i < sideB; i++) {
    const c = along(sideB, i);
    chairs.push(horizontal ? { x: c - size / 2, y: t.h + GAP, w: size, h: CHAIR } : { x: t.w + GAP, y: c - size / 2, w: CHAIR, h: size });
  }
  return chairs;
}

export function TableShape({
  table,
  fill,
  stroke = 'var(--color-border)',
  strokeWidth = 2,
  className,
  children,
}: {
  table: Pick<TableDto, 'shape' | 'w' | 'h' | 'maxSeats' | 'rotation'>;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  className?: string;
  children?: ReactNode;
}) {
  const { w, h } = table;
  return (
    <g className={className}>
      <g transform={`rotate(${table.rotation} ${w / 2} ${h / 2})`}>
        {chairPositions(table).map((c, i) => (
          <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} rx={5} fill={fill} opacity={0.55} />
        ))}
        {table.shape === 'round' ? (
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        ) : (
          <rect width={w} height={h} rx={10} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        )}
      </g>
      {children}
    </g>
  );
}

/** Bounding box of a set of tables (including chairs), with padding. */
export function tablesBounds(tables: Array<Pick<TableDto, 'x' | 'y' | 'w' | 'h'>>, pad = 40) {
  if (!tables.length) return { x: 0, y: 0, w: 1000, h: 600 };
  const minX = Math.min(...tables.map((t) => t.x)) - pad;
  const minY = Math.min(...tables.map((t) => t.y)) - pad;
  const maxX = Math.max(...tables.map((t) => t.x + t.w)) + pad;
  const maxY = Math.max(...tables.map((t) => t.y + t.h)) + pad;
  return { x: minX, y: minY, w: Math.max(maxX - minX, 300), h: Math.max(maxY - minY, 200) };
}
