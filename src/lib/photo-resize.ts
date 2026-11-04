/** Lado maior das fotos enviadas: suficiente para ler a carta, leve para o celular. */
export const PHOTO_MAX_SIDE = 1600;

/** Tamanho final mantendo a proporção; nunca aumenta a imagem. */
export function fitWithin(
  width: number,
  height: number,
  max: number = PHOTO_MAX_SIDE,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Reduz a foto no navegador e devolve um JPEG (as fotos do celular chegam a 5–10 MB). */
export async function resizeImage(
  file: File,
  max: number = PHOTO_MAX_SIDE,
  quality = 0.85,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível.");
  // JPEG não tem transparência: sem fundo, um PNG transparente vira preto.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao converter a foto."))),
      "image/jpeg",
      quality,
    ),
  );
}
