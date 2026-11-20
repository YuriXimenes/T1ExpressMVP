"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  FilePlus2,
  Layers,
  ImagePlus,
  Loader2,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { gameOptions } from "@/lib/data/games";
import { matchStore, sameStore } from "@/lib/order-import/match-store";
import {
  checkStoreTotal,
  parseOrderText,
  type ImportedItem,
  type ImportedStore,
} from "@/lib/order-import/parse-order";
import {
  applyImportPlan,
  planImport,
  type PlannedLot,
} from "@/lib/order-import/plan-import";
import { isBlankGroup } from "@/lib/order-import/to-groups";
import { cn } from "@/lib/utils";
import type { GameTag } from "@/lib/types/signup";
import type { PedidoGroup } from "@/lib/types/order";

export interface ImportTargetStore {
  id: string;
  name: string;
  /** Lotes (pedidos) já abertos nessa loja. */
  groups: PedidoGroup[];
}

const GAME_KEY = "t1.importar.jogo";
const SKIP = "__nao_importar";

function readSavedGame(): GameTag {
  try {
    const v = localStorage.getItem(GAME_KEY);
    if (v && gameOptions.some((g) => g.id === v)) return v as GameTag;
  } catch {
    // sem armazenamento local: usa o padrão
  }
  return "magic";
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface ReviewBlock extends ImportedStore {
  key: string;
  targetId: string;
}

type Step = "input" | "reading" | "review" | "confirm-store" | "confirm-lots";

/**
 * Importa os itens de um pedido (print lido por OCR no aparelho, ou texto colado)
 * e entrega os lotes atualizados das lojas do pedido T1, após conferência e avisos:
 * mesmo nº de pedido → entra no lote aberto; nº diferente → lote novo.
 */
export function OrderImportDialog({
  open,
  onOpenChange,
  stores,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lojas que podem receber itens. Com uma só, tudo vai para ela. */
  stores: ImportTargetStore[];
  /** Lotes finais das lojas alteradas (as demais não aparecem). */
  onApply: (next: Record<string, PedidoGroup[]>) => void;
}) {
  const [mode, setMode] = useState<"print" | "texto">("print");
  const [step, setStep] = useState<Step>("input");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [game, setGame] = useState<GameTag>("magic");
  const [progress, setProgress] = useState({ p: 0, label: "" });
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ReviewBlock[]>([]);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [frozen, setFrozen] = useState<{
    current: Record<string, PedidoGroup[]>;
    plan: PlannedLot[];
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Ao abrir: estado limpo e jogo lembrado.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setStep("input");
      setFiles([]);
      setText("");
      setError(null);
      setBlocks([]);
      setIncludeDuplicates(false);
      setFrozen(null);
      setGame(readSavedGame());
    });
  }, [open]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    queueMicrotask(() => setPreviews(urls));
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function addFiles(list: FileList | File[]) {
    const images = [...list].filter((f) => f.type.startsWith("image/"));
    if (images.length) {
      setFiles((prev) => [...prev, ...images].slice(0, 6));
      setError(null);
    }
  }

  // No computador: colar um print (Ctrl+V) direto na janela.
  function onPaste(event: React.ClipboardEvent) {
    if (step !== "input" || mode !== "print") return;
    const imgs = [...event.clipboardData.items]
      .filter((i) => i.type.startsWith("image/"))
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    if (imgs.length) {
      event.preventDefault();
      addFiles(imgs);
    }
  }

  function toReview(parsed: ImportedStore[]) {
    if (!parsed.length) {
      setError(
        mode === "print"
          ? "Não encontramos cartas nesse print. Tente uma imagem mais nítida, sem zoom reduzido, mostrando a tabela de cartas da loja."
          : "Não encontramos cartas nesse texto. Copie a página inteira do pedido (Ctrl+A, Ctrl+C) e cole aqui.",
      );
      setStep("input");
      return;
    }
    const used = new Set<string>();
    setBlocks(
      parsed.map((s, i) => {
        let target = stores.length === 1 ? stores[0] : matchStore(s.name, stores);
        if (target && used.has(target.id) && stores.length > 1) target = null;
        if (target) used.add(target.id);
        return { ...s, key: `${i}-${s.orderNumber ?? ""}`, targetId: target?.id ?? SKIP };
      }),
    );
    setStep("review");
  }

  async function read() {
    setError(null);
    try {
      localStorage.setItem(GAME_KEY, game);
    } catch {
      // ignora
    }
    if (mode === "texto") {
      toReview(parseOrderText(text).stores);
      return;
    }
    setStep("reading");
    setProgress({ p: 0, label: "Preparando o leitor…" });
    try {
      const { recognizeImages } = await import("@/lib/order-import/ocr");
      const ocrText = await recognizeImages(files, (p, label) =>
        setProgress({ p, label }),
      );
      toReview(parseOrderText(ocrText).stores);
    } catch {
      setError(
        "Não foi possível ler a imagem agora. Verifique sua conexão (o leitor é baixado na primeira vez) ou use “Colar texto”.",
      );
      setStep("input");
    }
  }

  function updateItem(blockKey: string, index: number, patch: Partial<ImportedItem>) {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.key !== blockKey) return b;
        const items = b.items.map((it, i) => {
          if (i !== index) return it;
          const next = { ...it, ...patch, doubtful: false };
          next.total = Math.round(next.unitPrice * next.quantity * 100) / 100;
          return next;
        });
        return { ...b, items };
      }),
    );
  }

  function removeItem(blockKey: string, index: number) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.key === blockKey ? { ...b, items: b.items.filter((_, i) => i !== index) } : b,
      ),
    );
  }

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "";
  const current = Object.fromEntries(stores.map((s) => [s.id, s.groups]));
  const usable = blocks
    .filter((b) => b.targetId !== SKIP)
    .map((b) => ({ ...b, items: b.items.filter((i) => i.name.trim()) }))
    .filter((b) => b.items.length > 0);
  const itemCount = usable.reduce((s, b) => s + b.items.length, 0);
  // Loja lida no pedido diferente da loja que vai receber os itens.
  const mismatches = usable.filter(
    (b) => b.name.trim() && !sameStore(b.name, storeName(b.targetId)),
  );
  const duplicateCount = (frozen?.plan ?? []).reduce(
    (s, l) => s + l.duplicates.length,
    0,
  );
  /** Loja já tem algum lote preenchido (para o texto do aviso). */
  const hasOpenLots = (storeId: string) =>
    (frozen?.current[storeId] ?? []).some((g) => !isBlankGroup(g));

  function proceed() {
    // Congela o plano: os textos do aviso não mudam enquanto a janela fecha.
    setFrozen({
      current,
      plan: planImport(
        current,
        usable.map((b) => ({
          storeId: b.targetId,
          orderNumber: b.orderNumber ?? "",
          items: b.items,
        })),
      ),
    });
    setStep(mismatches.length ? "confirm-store" : "confirm-lots");
  }

  function apply() {
    if (!frozen) return;
    onApply(applyImportPlan(frozen.current, frozen.plan, game, includeDuplicates));
    onOpenChange(false);
  }

  const cartas = (n: number) => `${n} ${n === 1 ? "carta" : "cartas"}`;

  const canRead = mode === "print" ? files.length > 0 : text.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onPaste={onPaste}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wand2 className="text-brand-600 h-4 w-4" aria-hidden="true" />
            Importar itens do pedido
          </DialogTitle>
          <DialogDescription>
            {step === "review"
              ? "Confira o que foi lido antes de usar. Você pode corrigir qualquer valor."
              : step === "confirm-store"
                ? "Atenção: lojas diferentes."
                : step === "confirm-lots"
                  ? "Veja o que será feito com os itens."
                  : "Envie o print do pedido na loja (ex.: Liga) ou cole o texto da página. A imagem é lida no seu aparelho e não é enviada nem guardada."}
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="tablist">
              {(
                [
                  { id: "print", label: "Enviar print", icon: ImagePlus },
                  { id: "texto", label: "Colar texto", icon: ClipboardPaste },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === opt.id}
                  onClick={() => {
                    setMode(opt.id);
                    setError(null);
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                    mode === opt.id
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300",
                  )}
                >
                  <opt.icon className="h-4 w-4" aria-hidden="true" />
                  {opt.label}
                </button>
              ))}
            </div>

            {mode === "print" ? (
              <div className="space-y-3">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  aria-label="Escolher prints do pedido"
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    addFiles(e.dataTransfer.files);
                  }}
                  className="hover:border-brand-400 flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-center transition-colors"
                >
                  <ImagePlus className="text-brand-600 h-6 w-6" aria-hidden="true" />
                  <span className="font-medium text-slate-800">Escolher print(s)</span>
                  <span className="text-xs text-slate-500">
                    Ou arraste aqui / cole com Ctrl+V. Pedido grande? Envie em partes (até
                    6).
                  </span>
                </button>
                {previews.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {previews.map((src, i) => (
                      <div key={src} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element -- imagem local (blob), não otimizável */}
                        <img
                          src={src}
                          alt={`Print ${i + 1}`}
                          className="h-20 w-28 rounded-md border border-slate-200 object-cover object-top"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setFiles((prev) => prev.filter((_, k) => k !== i))
                          }
                          className="absolute -top-2 -right-2 rounded-full bg-slate-900 p-0.5 text-white"
                          aria-label={`Remover print ${i + 1}`}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  Dica: dê zoom na tabela de cartas antes do print. Quanto mais nítido,
                  melhor a leitura.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="import-text">Texto do pedido</Label>
                <Textarea
                  id="import-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={7}
                  placeholder="Na página do pedido: Ctrl+A para selecionar tudo, Ctrl+C para copiar e cole aqui."
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Jogo das cartas</Label>
              <Select value={game} onValueChange={(v) => setGame(v as GameTag)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {gameOptions.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <p
                className="flex gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}
          </div>
        )}

        {step === "reading" && (
          <div className="space-y-3 py-6 text-center" aria-live="polite">
            <Loader2
              className="text-brand-600 mx-auto h-8 w-8 animate-spin"
              aria-hidden="true"
            />
            <p className="font-medium text-slate-800">{progress.label}</p>
            <div className="mx-auto h-2 max-w-xs overflow-hidden rounded-full bg-slate-100">
              <div
                className="bg-brand-600 h-full transition-all"
                style={{ width: `${Math.round(progress.p * 100)}%` }}
              />
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            {blocks.map((block) => {
              const check = checkStoreTotal(block);
              const skipped = block.targetId === SKIP;
              return (
                <div
                  key={block.key}
                  className={cn(
                    "space-y-3 rounded-lg border border-slate-200 p-3",
                    skipped && "opacity-60",
                  )}
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500">Lido no pedido</p>
                      <p className="truncate font-semibold text-slate-900">
                        {block.name || "Loja não identificada"}
                      </p>
                    </div>
                    <div className="w-full sm:w-40">
                      <Label htmlFor={`import-order-${block.key}`} className="text-xs">
                        Nº do pedido
                      </Label>
                      <Input
                        id={`import-order-${block.key}`}
                        className="mt-1"
                        value={block.orderNumber ?? ""}
                        placeholder="Digite o nº"
                        onChange={(e) =>
                          setBlocks((prev) =>
                            prev.map((b) =>
                              b.key === block.key
                                ? { ...b, orderNumber: e.target.value }
                                : b,
                            ),
                          )
                        }
                      />
                    </div>
                    {stores.length > 1 && (
                      <div className="w-full sm:w-56">
                        <Label className="text-xs">Colocar na loja</Label>
                        <Select
                          value={block.targetId}
                          onValueChange={(v) =>
                            setBlocks((prev) =>
                              prev.map((b) =>
                                b.key === block.key ? { ...b, targetId: v } : b,
                              ),
                            )
                          }
                        >
                          <SelectTrigger className="mt-1 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {stores.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                            <SelectItem value={SKIP}>Não importar</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {skipped && stores.length > 1 && (
                    <p className="text-xs text-amber-700">
                      Essa loja não foi reconhecida entre as lojas do seu pedido. Escolha
                      a loja ou deixe sem importar.
                    </p>
                  )}

                  <div className="space-y-2">
                    <div className="hidden grid-cols-[1fr_4rem_6rem_5.5rem_2rem] gap-2 px-1 text-xs text-slate-500 sm:grid">
                      <span>Carta</span>
                      <span>Qtd</span>
                      <span>Unitário</span>
                      <span className="text-right">Total</span>
                      <span />
                    </div>
                    {block.items.map((item, i) => (
                      <div
                        key={i}
                        className={cn(
                          "grid grid-cols-[1fr_1fr_2rem] items-center gap-2 rounded-md p-1 sm:grid-cols-[1fr_4rem_6rem_5.5rem_2rem]",
                          item.doubtful && "bg-amber-50 ring-1 ring-amber-200",
                        )}
                      >
                        <Input
                          aria-label="Nome da carta"
                          value={item.name}
                          onChange={(e) =>
                            updateItem(block.key, i, { name: e.target.value })
                          }
                          className="col-span-3 sm:col-span-1"
                        />
                        <Input
                          aria-label="Quantidade"
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(block.key, i, {
                              quantity: Math.max(
                                1,
                                Math.floor(Number(e.target.value) || 1),
                              ),
                            })
                          }
                        />
                        <Input
                          aria-label="Preço unitário"
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateItem(block.key, i, {
                              unitPrice: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                        <span className="hidden text-right text-sm text-slate-700 tabular-nums sm:block">
                          {brl(item.total)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(block.key, i)}
                          aria-label={`Remover ${item.name || "item"}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {check.matches === true && (
                    <p className="flex items-center gap-1.5 text-sm text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Soma dos itens {brl(check.sum)} = total da loja no pedido
                    </p>
                  )}
                  {check.matches === false && (
                    <p className="flex gap-1.5 text-sm text-amber-800">
                      <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      Soma dos itens {brl(check.sum)} é diferente do total da loja no
                      pedido ({brl(block.storeTotal ?? 0)}). Confira as linhas — algum
                      valor pode ter sido lido errado.
                    </p>
                  )}
                  {check.matches === null && (
                    <p className="text-sm text-slate-600">
                      Soma dos itens: {brl(check.sum)} (não achamos o total da loja para
                      conferir).
                    </p>
                  )}
                  {!block.orderNumber?.trim() && !skipped && (
                    <p className="text-xs text-amber-700">
                      Não conseguimos ler o nº do pedido. Digite acima para juntar ao lote
                      certo; sem número, será aberto um lote novo.
                    </p>
                  )}
                  {block.items.some((i) => i.doubtful) && (
                    <p className="text-xs text-amber-700">
                      Linhas destacadas: leitura incerta, confira nome e valores.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === "confirm-store" && (
          <div className="space-y-3" aria-live="polite">
            {mismatches.map((b) => (
              <div
                key={b.key}
                className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p>
                  Você está adicionando itens na loja{" "}
                  <strong>{storeName(b.targetId)}</strong>, mas durante a leitura vimos
                  que esse pedido é da loja <strong>{b.name}</strong>. São lojas
                  diferentes. Deseja continuar mesmo assim?
                </p>
              </div>
            ))}
          </div>
        )}

        {step === "confirm-lots" && (
          <div className="space-y-3" aria-live="polite">
            {(frozen?.plan ?? []).map((lot, i) => {
              const n =
                lot.items.length + (includeDuplicates ? lot.duplicates.length : 0);
              const Icon = lot.action === "append" ? Layers : FilePlus2;
              return (
                <div
                  key={`${lot.storeId}-${lot.orderNumber}-${i}`}
                  className="flex gap-3 rounded-lg border border-slate-200 p-4 text-sm text-slate-700"
                >
                  <Icon
                    className="text-brand-600 mt-0.5 h-5 w-5 shrink-0"
                    aria-hidden="true"
                  />
                  <div className="space-y-1">
                    {lot.action === "append" ? (
                      <p>
                        Vimos que o pedido <strong>#{lot.orderNumber}</strong> já está
                        aberto na loja <strong>{storeName(lot.storeId)}</strong>
                        {/[.!?]$/.test(storeName(lot.storeId)) ? "" : "."}{" "}
                        {n > 0 ? (
                          <>
                            {n === 1 ? "" : "As "}
                            <strong>{cartas(n)}</strong>{" "}
                            {n === 1 ? "será incluída" : "serão incluídas"} nesse lote.
                          </>
                        ) : (
                          <>Nenhuma carta nova será incluída.</>
                        )}
                      </p>
                    ) : lot.orderNumber && !hasOpenLots(lot.storeId) ? (
                      <p>
                        Será aberto um <strong>lote</strong> para o pedido{" "}
                        <strong>#{lot.orderNumber}</strong> na loja{" "}
                        <strong>{storeName(lot.storeId)}</strong> com {cartas(n)}.
                      </p>
                    ) : lot.orderNumber ? (
                      <p>
                        Vimos que o pedido <strong>#{lot.orderNumber}</strong> é diferente
                        dos que já estão abertos na loja{" "}
                        <strong>{storeName(lot.storeId)}</strong>
                        {/[.!?]$/.test(storeName(lot.storeId)) ? "" : "."} Será aberto um{" "}
                        <strong>novo lote</strong> com esse número e {cartas(n)}.
                      </p>
                    ) : (
                      <p>
                        Esse pedido está sem número. Será aberto um{" "}
                        <strong>novo lote sem número</strong> na loja{" "}
                        <strong>{storeName(lot.storeId)}</strong> com {cartas(n)} (você
                        pode preencher o número depois).
                      </p>
                    )}
                    {lot.duplicates.length > 0 && (
                      <p className="text-amber-800">
                        {lot.duplicates.length === 1
                          ? "1 carta já estava nesse lote"
                          : `${lot.duplicates.length} cartas já estavam nesse lote`}{" "}
                        ({lot.duplicates.map((d) => d.name).join(", ")})
                        {lot.duplicates.length === 1
                          ? includeDuplicates
                            ? " e será incluída de novo."
                            : " e não será repetida."
                          : includeDuplicates
                            ? " e serão incluídas de novo."
                            : " e não serão repetidas."}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {duplicateCount > 0 && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="accent-brand-600 h-4 w-4"
                  checked={includeDuplicates}
                  onChange={(e) => setIncludeDuplicates(e.target.checked)}
                />
                Incluir as cartas repetidas mesmo assim
              </label>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "input" && (
            <Button type="button" onClick={read} disabled={!canRead}>
              {mode === "print" ? "Ler print" : "Ler texto"}
            </Button>
          )}
          {step === "review" && (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("input")}>
                Voltar
              </Button>
              <Button type="button" onClick={proceed} disabled={itemCount === 0}>
                Usar {itemCount} {itemCount === 1 ? "item" : "itens"}
              </Button>
            </>
          )}
          {(step === "confirm-store" || step === "confirm-lots") && (
            <Button type="button" variant="outline" onClick={() => setStep("review")}>
              Voltar para editar
            </Button>
          )}
          {step === "confirm-store" && (
            <Button type="button" onClick={() => setStep("confirm-lots")}>
              Continuar mesmo assim
            </Button>
          )}
          {step === "confirm-lots" && (
            <Button type="button" onClick={apply}>
              OK
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
