import type { Instrumentation } from "next";

// Erros do servidor (páginas, rotas de API e ações) vão para `log_client_error`
// (0025), junto com os do navegador, na tela Sistema › Integrações.
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  const { describeError, reportError } = await import("@/lib/system/errors");
  const { message, stack } = describeError(err);
  const userAgent = request.headers["user-agent"];
  await reportError({
    source: "server",
    message: `${message} [${context.routeType} ${context.routePath}]`,
    stack,
    path: request.path,
    userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
  });
};
