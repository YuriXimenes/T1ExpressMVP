// Monitoramento de erros do navegador (site e admin): roda antes de a página
// ficar interativa. Envia para `log_client_error` (0025); nunca atrapalha a página.
import { describeError, reportError, sourceForPath } from "@/lib/system/errors";

const MAX_PER_PAGE = 10;
let sent = 0;
const seen = new Set<string>();

function send(err: unknown) {
  try {
    const { message, stack } = describeError(err);
    if (sent >= MAX_PER_PAGE || seen.has(message)) return;
    seen.add(message);
    sent += 1;
    const path = window.location.pathname;
    void reportError({
      source: sourceForPath(path),
      message,
      stack,
      path,
      userAgent: navigator.userAgent,
    });
  } catch {
    // ignora
  }
}

try {
  window.addEventListener("error", (event) => {
    // Erro de carregamento de imagem/script não tem `error`: só a mensagem.
    send(event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    send(event.reason);
  });
} catch {
  // ignora
}
