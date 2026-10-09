/** Dados de um CEP, como a consulta pública do ViaCEP devolve. */
export interface CepInfo {
  city: string;
  /** Vazio em cidades pequenas com CEP único. */
  neighborhood: string;
  uf: string;
}

interface ViaCepResponse {
  erro?: boolean | string;
  localidade?: string;
  bairro?: string;
  uf?: string;
}

const LOOKUP_TIMEOUT_MS = 6000;

/**
 * Consulta o CEP no ViaCEP (gratuito, sem chave, aceita chamada do navegador).
 * Nunca lança: CEP inexistente, formato errado, rede fora do ar, demora ou
 * resposta estranha viram `null` e quem chama segue por outro caminho.
 */
export async function lookupCep(
  zip: string | undefined,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<CepInfo | null> {
  const digits = (zip ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return null;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? LOOKUP_TIMEOUT_MS,
  );
  try {
    const response = await (options.fetchImpl ?? fetch)(
      `https://viacep.com.br/ws/${digits}/json/`,
      { signal: controller.signal },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as ViaCepResponse;
    if (data.erro || typeof data.localidade !== "string" || !data.localidade.trim()) {
      return null;
    }
    return {
      city: data.localidade.trim(),
      neighborhood: (data.bairro ?? "").trim(),
      uf: (data.uf ?? "").trim().toUpperCase(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
