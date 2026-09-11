"use client";

import { useRef, useState, type ReactNode } from "react";
import { Camera, Loader2 } from "lucide-react";
import { resizeImageToDataUrl } from "@/lib/resize-image";
import { cn } from "@/lib/utils";

export function AvatarUploader({
  value,
  onChange,
  fallback,
  label,
  className,
}: {
  value?: string;
  onChange: (dataUrl: string) => void;
  fallback: ReactNode;
  label?: string;
  className?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Escolha um arquivo de imagem.");
      return;
    }

    setError(null);
    setIsUploading(true);
    try {
      onChange(await resizeImageToDataUrl(file));
    } catch {
      setError("Não foi possível carregar essa imagem. Tente outra.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative h-24 w-24">
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL local ao navegador, sem otimização do Next Image.
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            fallback
          )}
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          aria-label="Alterar foto de perfil"
          className="bg-brand-600 hover:bg-brand-700 absolute -right-1 -bottom-1 flex h-8 w-8 items-center justify-center rounded-full text-white ring-4 ring-white transition-colors disabled:opacity-60"
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleChange}
        />
      </div>
      {label && <p className="text-xs text-slate-500">{label}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
