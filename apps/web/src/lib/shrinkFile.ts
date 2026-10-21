/**
 * Quote files go up to 1.5 MB. A phone photo of a quote is usually bigger: it's redrawn smaller as a JPEG
 * (still easy to read) before it's sent. PDFs and small files are left as they are; when the browser
 * can't redraw it (an iPhone HEIC on some browsers), it goes as it is and the size check speaks up.
 */
export const MAX_QUOTE_FILE = 1_500_000;
export const QUOTE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export async function shrinkFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= MAX_QUOTE_FILE) return file;
  try {
    const bmp = await createImageBitmap(file);
    for (const [edge, quality] of [
      [2200, 0.85],
      [1800, 0.8],
      [1400, 0.75],
    ] as const) {
      const k = Math.min(1, edge / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * k);
      canvas.height = Math.round(bmp.height * k);
      canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_QUOTE_FILE) return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    }
  } catch {
    /* sent as it is */
  }
  return file;
}

/** Why a file can't be sent, or '' when it can. */
export function fileProblem(file: File) {
  if (!QUOTE_TYPES.includes(file.type)) return 'Choose a PDF or a photo (JPEG, PNG or HEIC).';
  if (file.size > MAX_QUOTE_FILE) return `That file is ${(file.size / 1_000_000).toFixed(1)} MB: the limit is 1.5 MB. Try “Save as smaller PDF”, or a photo of each page.`;
  return '';
}

/** A file as base64 (for sending in JSON). */
export async function base64Of(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
