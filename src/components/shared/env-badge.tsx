import { IS_STAGING } from "@/lib/app-env";

/**
 * Selo fixo "Ambiente de testes" (só no staging). Fica sobreposto no canto, sem ocupar
 * espaço no layout (o /admin usa altura de tela cheia) e sem bloquear cliques.
 */
export function EnvBadge() {
  if (!IS_STAGING) return null;
  return (
    <div
      role="note"
      className="pointer-events-none fixed bottom-3 left-3 z-[9999] rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-950 shadow-lg print:hidden"
    >
      Ambiente de testes
    </div>
  );
}
