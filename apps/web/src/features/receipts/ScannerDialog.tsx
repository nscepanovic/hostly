import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import QrScanner from 'qr-scanner';
import { CameraOff, Check, ImageUp, Link2, Loader2, ScanLine } from 'lucide-react';
import type { ReceiptDto } from '@hostly/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import { ReceiptView } from './ReceiptView';

type Phase = 'scanning' | 'saving' | 'result';

/**
 * Receipt QR codes are dense (~800 characters), so the camera frame is scanned
 * at a higher resolution than the library default.
 */
function scanRegion(video: HTMLVideoElement) {
  const size = Math.round(Math.min(video.videoWidth, video.videoHeight) * 0.85);
  const down = Math.min(size, 1000);
  return { x: Math.round((video.videoWidth - size) / 2), y: Math.round((video.videoHeight - size) / 2), width: size, height: size, downScaledWidth: down, downScaledHeight: down };
}

export default function ScannerDialog({ reservationId, guestName, onClose }: { reservationId?: string; guestName?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('scanning');
  const [cameraError, setCameraError] = useState(false);
  const [link, setLink] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [result, setResult] = useState<{ receipt: ReceiptDto; duplicate: boolean } | null>(null);
  const [saved, setSaved] = useState(0);

  const save = useMutation({
    mutationFn: (url: string) => api.post<ReceiptDto>('/receipts', { url, reservationId: reservationId ?? null }),
    onMutate: () => setPhase('saving'),
    onSuccess: (receipt) => {
      setResult({ receipt, duplicate: false });
      setSaved((n) => n + 1);
      setPhase('result');
      void qc.invalidateQueries({ queryKey: ['receipts'] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.body.code === 'duplicate' && err.body.receipt) {
        setResult({ receipt: err.body.receipt as ReceiptDto, duplicate: true });
        setPhase('result');
        return;
      }
      const code = err instanceof ApiError ? err.body.code : undefined;
      toast.error(code === 'invalid_receipt' ? t('receipts.notFiscal') : code === 'not_original' ? `${t('receipts.notOriginal')} ${errorMessage(err)}` : errorMessage(err));
      setPhase('scanning');
    },
  });
  const assign = useMutation({
    mutationFn: (id: string) => api.patch<ReceiptDto>(`/receipts/${id}`, { reservationId }),
    onSuccess: (receipt) => {
      setResult({ receipt, duplicate: false });
      void qc.invalidateQueries({ queryKey: ['receipts'] });
      toast.success(t('receipts.linked'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Live camera while scanning; stopped as soon as a code is read.
  useEffect(() => {
    if (phase !== 'scanning' || !video.current) return;
    let done = false;
    const scanner = new QrScanner(
      video.current,
      (r) => {
        if (done) return;
        done = true;
        scanner.stop();
        save.mutate(r.data);
      },
      { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 8, calculateScanRegion: scanRegion, returnDetailedScanResult: true },
    );
    scanner.start().then(
      () => setCameraError(false),
      () => setCameraError(true),
    );
    return () => {
      done = true;
      scanner.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const fromImage = async (f: File) => {
    try {
      const r = await QrScanner.scanImage(f, { returnDetailedScanResult: true, alsoTryWithoutScanRegion: true });
      save.mutate(r.data);
    } catch {
      toast.error(t('receipts.noQrInPhoto'));
    }
  };

  const title = guestName ? `${t('receipts.scanTitle')} · ${guestName}` : t('receipts.scanTitle');
  const canLink = result?.duplicate && !result.receipt.reservationId && !!reservationId;

  return (
    <Modal open nested onClose={onClose} title={title} size="md">
      {phase !== 'result' && (
        <>
          <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-black">
            <video ref={video} className="h-full w-full object-cover" muted playsInline />
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/80">
                <CameraOff size={32} />
                {t('receipts.noCamera')}
              </div>
            )}
            {phase === 'saving' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white">
                <Loader2 size={32} className="animate-spin" />
                {t('receipts.reading')}
              </div>
            )}
          </div>
          <p className="mt-3 flex items-center justify-center gap-2 text-center text-sm text-muted">
            <ScanLine size={16} />
            {t('receipts.aim')}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button icon={<ImageUp size={18} />} onClick={() => file.current?.click()} disabled={phase === 'saving'}>
              {t('receipts.fromPhoto')}
            </Button>
            <Button icon={<Link2 size={18} />} onClick={() => setShowLink((v) => !v)} disabled={phase === 'saving'}>
              {t('receipts.pasteLink')}
            </Button>
          </div>
          {showLink && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (link.trim()) save.mutate(link.trim());
              }}
            >
              <input className="field min-w-0 flex-1" autoFocus placeholder="https://suf.purs.gov.rs/v/?vl=…" value={link} onChange={(e) => setLink(e.target.value)} />
              <Button type="submit" variant="primary" disabled={!link.trim() || phase === 'saving'}>
                {t('common.save')}
              </Button>
            </form>
          )}
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void fromImage(f);
            }}
          />
        </>
      )}

      {phase === 'result' && result && (
        <div className="flex flex-col gap-3">
          <p className={`flex items-center gap-2 font-semibold ${result.duplicate ? 'text-warn' : 'text-accent'}`}>
            <Check size={20} />
            {result.duplicate
              ? result.receipt.guestName
                ? t('receipts.alreadyScannedFor', { name: result.receipt.guestName })
                : t('receipts.alreadyScanned')
              : result.receipt.guestName
                ? t('receipts.savedFor', { name: result.receipt.guestName })
                : t('receipts.saved')}
          </p>
          <ReceiptView receipt={result.receipt} />
          <div className="flex flex-wrap justify-end gap-2">
            {canLink && (
              <Button variant="primary" disabled={assign.isPending} onClick={() => assign.mutate(result.receipt.id)}>
                {t('receipts.linkTo', { name: guestName ?? '' })}
              </Button>
            )}
            <Button
              onClick={() => {
                setResult(null);
                setPhase('scanning');
              }}
            >
              {t('receipts.scanAnother')}
            </Button>
            <Button variant="primary" onClick={onClose}>
              {saved > 1 ? t('receipts.doneCount', { count: saved }) : t('receipts.done')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
