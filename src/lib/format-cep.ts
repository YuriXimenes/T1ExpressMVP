/** Formata para o padrão XXXXX-XXX, aceitando só dígitos (máx. 8). */
export function formatCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}
