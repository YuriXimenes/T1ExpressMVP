/**
 * OCR no navegador (tesseract.js, gratuito). A imagem nunca sai do aparelho:
 * só o motor e os dicionários (por + eng) são baixados uma vez e ficam em cache.
 */

/** Prepara o print para o OCR: amplia 2x, usa o canal verde, inverte linhas de tema escuro, transforma as faixas
 * coloridas (barra da loja) em texto escuro sobre branco e estica o contraste. */
async function preprocess(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width < 1600 ? 2 : 1;
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  // Base: canal verde (texto escuro sobre fundo claro fica nítido).
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = d[i * 4 + 1];

  // Faixas coloridas (barra laranja da loja): o fundo vira branco e qualquer texto
  // — branco, amarelo (nº do pedido) ou selecionado — vira escuro, pela distância de cor.
  for (let y = 0; y < h; y++) {
    let n = 0;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 2] < 90 && d[i] > 150) {
        n++;
        sr += d[i];
        sg += d[i + 1];
        sb += d[i + 2];
      }
    }
    if (n / w <= 0.25) {
      // Linha de tema escuro (texto claro/colorido sobre fundo escuro): usa o canal mais
      // claro de cada ponto e inverte — branco, vermelho e azul viram texto escuro.
      let sum = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        sum += Math.max(d[i], d[i + 1], d[i + 2]);
      }
      if (sum / w < 110) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          gray[y * w + x] = 255 - Math.max(d[i], d[i + 1], d[i + 2]);
        }
      }
      continue;
    }
    const br = sr / n;
    const bgc = sg / n;
    const bb = sb / n;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dist = Math.hypot(d[i] - br, d[i + 1] - bgc, d[i + 2] - bb);
      gray[y * w + x] = 255 - Math.min(255, (dist * 255) / 180);
    }
  }

  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const cut = gray.length * 0.01;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < cut; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < cut; hi--);
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < gray.length; i++) {
    const v = Math.max(0, Math.min(255, ((gray[i] - lo) * 255) / range));
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Lê o texto de um ou mais prints. `onProgress` recebe 0–1. */
export async function recognizeImages(
  files: Blob[],
  onProgress?: (p: number, label: string) => void,
): Promise<string> {
  onProgress?.(0, "Preparando o leitor…");
  const { createWorker } = await import("tesseract.js");
  let current = 0;
  const worker = await createWorker(["por", "eng"], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") {
        onProgress?.(
          (current + m.progress) / files.length,
          files.length > 1
            ? `Lendo imagem ${current + 1} de ${files.length}…`
            : "Lendo a imagem…",
        );
      } else if (current === 0 && /loading|initializ/.test(m.status)) {
        onProgress?.(0, "Baixando o leitor (só na primeira vez)…");
      }
    },
  });
  try {
    const texts: string[] = [];
    for (current = 0; current < files.length; current++) {
      const canvas = await preprocess(files[current]);
      const { data } = await worker.recognize(canvas);
      texts.push(data.text);
    }
    onProgress?.(1, "Pronto");
    return texts.join("\n");
  } finally {
    await worker.terminate();
  }
}
