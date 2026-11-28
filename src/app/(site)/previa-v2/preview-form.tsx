"use client";

import { useState } from "react";
import { V2Card } from "@/components/site-v2/card";
import { V2Field, V2Input, V2Select, V2Textarea, describedBy } from "@/components/site-v2/field";
import { PillButton } from "@/components/site-v2/pill";
import { V2Dialog, V2DialogClose, V2DialogContent, V2DialogTrigger } from "@/components/site-v2/dialog";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Demonstração dos campos (com erro) e do diálogo. Nada é enviado. */
export function PreviewForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [ok, setOk] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Informe o nome da loja.";
    if (!EMAIL.test(email.trim())) next.email = "Informe um e-mail válido.";
    setErrors(next);
    setOk(Object.keys(next).length === 0);
    const first = next.name ? "pv-name" : next.email ? "pv-email" : null;
    if (first) document.getElementById(first)?.focus();
  }

  return (
    <div className="mt-6 grid gap-[18px] lg:grid-cols-2">
      <V2Card>
        <form noValidate onSubmit={submit} className="grid gap-4">
          <V2Field id="pv-name" label="Nome da loja" error={errors.name}>
            <V2Input
              id="pv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
              aria-describedby={describedBy("pv-name", { error: errors.name })}
            />
          </V2Field>
          <V2Field id="pv-email" label="Seu e-mail" help="Só para avisar quando a loja entrar." error={errors.email}>
            <V2Input
              id="pv-email"
              type="email"
              autoComplete="email"
              placeholder="voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.email}
              aria-describedby={describedBy("pv-email", { help: true, error: errors.email })}
            />
          </V2Field>
          <V2Field id="pv-kind" label="Tipo">
            <V2Select id="pv-kind" defaultValue="coleta">
              <option value="coleta">Coleta</option>
              <option value="retirada">Retirada</option>
            </V2Select>
          </V2Field>
          <V2Field id="pv-com" label="Comentário" optional>
            <V2Textarea id="pv-com" />
          </V2Field>
          <div className="flex flex-wrap items-center gap-3">
            <PillButton type="submit">Validar</PillButton>
            {ok && <span className="text-sm font-semibold text-t1-ok-ink">Tudo certo (nada foi enviado).</span>}
          </div>
        </form>
      </V2Card>
      <V2Card tone="sunken" className="flex flex-col items-start gap-3">
        <p className="text-sm text-t1-muted">
          O diálogo abre como folha de baixo no celular e centralizado no computador.
        </p>
        <V2Dialog>
          <V2DialogTrigger asChild>
            <PillButton variant="ghost">Abrir diálogo</PillButton>
          </V2DialogTrigger>
          <V2DialogContent
            title="Indique uma loja"
            description="Exemplo de diálogo do layout novo."
            footer={
              <>
                <V2DialogClose asChild>
                  <PillButton variant="ghost">Cancelar</PillButton>
                </V2DialogClose>
                <V2DialogClose asChild>
                  <PillButton>Confirmar</PillButton>
                </V2DialogClose>
              </>
            }
          >
            <p className="text-sm text-t1-muted">Conteúdo do diálogo. Nada é enviado nesta prévia.</p>
          </V2DialogContent>
        </V2Dialog>
      </V2Card>
    </div>
  );
}
