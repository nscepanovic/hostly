/**
 * Scales a photo down in the browser before upload, so a 12 MP phone picture
 * becomes a few hundred KB. Never scales up. EXIF rotation is applied.
 */
export async function resizeImage(file: File, opts: { maxWidth: number; maxHeight: number; type: 'image/jpeg' | 'image/png'; quality?: number }): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, opts.maxWidth / bitmap.width, opts.maxHeight / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the image'))), opts.type, opts.quality ?? 0.85),
  );
}
