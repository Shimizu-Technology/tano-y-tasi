// Everything a product image goes through in the browser before it reaches S3.
export const DEFAULT_WIDTHS = [640, 1280, 2000];
export const MIN_SOURCE_WIDTH = 640;
export const WEBP = "image/webp";
const QUALITY = 0.82;

export type PreparedImage = {
  aspect: string;
  widths: number[];
  files: { width: number; blob: Blob }[];
  preview: string;
};
// A file that can never work. Trying the same one again won't help.
export class ImageRejected extends Error {}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}
export function aspectRatio(width: number, height: number) {
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}
// Never upscale, and always keep at least one size.
export function targetWidths(sourceWidth: number, defaults = DEFAULT_WIDTHS) {
  const fitting = defaults.filter((width) => width <= sourceWidth);
  return fitting.length ? fitting : defaults.slice(0, 1);
}
export function rejection(file: { name: string; type: string }) {
  return file.type.startsWith("image/") ? null : `${file.name} isn't an image. Choose a photo or picture file.`;
}
export function sizeRejection(name: string, width: number) {
  return width < MIN_SOURCE_WIDTH
    ? `${name} is only ${width} pixels wide. Use one at least ${MIN_SOURCE_WIDTH} pixels wide so it stays sharp.`
    : null;
}
// Safari's canvas silently returns PNG when asked for WebP, so every phone running iOS
// takes the encoder route. It's only downloaded by a browser that needs it.
async function encode(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, WEBP, QUALITY));
  if (blob?.type === WEBP) return blob;
  const { default: encodeWebp } = await import("@jsquash/webp/encode");
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  return new Blob([await encodeWebp(data, { quality: QUALITY * 100 })], { type: WEBP });
}
function dataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
export async function prepareImage(file: File): Promise<PreparedImage> {
  const notImage = rejection(file);
  if (notImage) throw new ImageRejected(notImage);
  let source: ImageBitmap;
  try {
    // Reads the file directly, so it needs no blob: allowance in the site's content security policy.
    source = await createImageBitmap(file);
  } catch {
    throw new ImageRejected(`${file.name} couldn't be opened. Save it as a JPEG or PNG and try again.`);
  }
  try {
    const small = sizeRejection(file.name, source.width);
    if (small) throw new ImageRejected(small);
    const widths = targetWidths(source.width);
    const files: PreparedImage["files"] = [];
    for (const width of widths) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.max(1, Math.round((source.height * width) / source.width));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser couldn't prepare the image.");
      context.imageSmoothingQuality = "high";
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      files.push({ width, blob: await encode(canvas, context) });
      canvas.width = canvas.height = 0;
    }
    return { aspect: aspectRatio(source.width, source.height), widths, files, preview: await dataUrl(files[0].blob) };
  } finally {
    source.close();
  }
}
export async function putImage(upload: { url: string; headers: Record<string, string> }, blob: Blob, signal: AbortSignal) {
  const response = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: blob, signal });
  if (!response.ok) throw new Error(`Storage answered ${response.status}.`);
}
