import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LocateFixed, ZoomIn, ZoomOut } from 'lucide-react';
import { IconButton } from '@/components/ui/Button';
import type { PanZoom } from './usePanZoom';

/** Zoom out / level / zoom in / fit, shared by the floor plan and the editor. */
export function ZoomControls({ view, children, className = '' }: { view: PanZoom; children?: ReactNode; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={`flex items-center gap-0.5 rounded-xl border border-border bg-surface p-0.5 ${className}`}>
      {children}
      <IconButton label={t('floor.zoomOut')} onClick={view.zoomOut}>
        <ZoomOut size={20} />
      </IconButton>
      <span className="w-12 text-center text-xs text-muted tabular-nums" aria-live="polite">
        {Math.round(view.zoom * 100)}%
      </span>
      <IconButton label={t('floor.zoomIn')} onClick={view.zoomIn}>
        <ZoomIn size={20} />
      </IconButton>
      <IconButton label={t('floor.fit')} onClick={view.reset}>
        <LocateFixed size={20} />
      </IconButton>
    </div>
  );
}
