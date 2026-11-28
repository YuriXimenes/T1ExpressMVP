import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-t1-sm border border-t1-line-2 bg-white px-4 text-[15px] text-t1-ink transition-[border-color,box-shadow] placeholder:text-t1-placeholder hover:border-t1-line-3 focus:border-t1-brand focus:shadow-[0_0_0_3px_rgba(37,99,235,.18)] focus:outline-none disabled:bg-t1-sunken disabled:text-t1-dim aria-[invalid=true]:border-t1-danger aria-[invalid=true]:shadow-[0_0_0_3px_rgba(220,38,38,.14)]";

/**
 * Campo do layout novo: rótulo, controle, dica e erro.
 * O erro é ligado ao controle por aria-describedby (o controle recebe `id` e `aria-invalid`
 * de quem usa; os ids da dica e do erro são `${id}-help` e `${id}-error`).
 */
export function V2Field({
  id,
  label,
  optional = false,
  help,
  error,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  optional?: boolean;
  help?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-[7px]", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-t1-label">
        {label}
        {optional && <span className="font-normal text-t1-dim"> (opcional)</span>}
      </label>
      {children}
      {help && !error && (
        <p id={`${id}-help`} className="text-[12.5px] text-t1-dim">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="flex items-center gap-1.5 text-[12.5px] font-semibold text-t1-danger-ink">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

/** Junta os ids de dica/erro para o aria-describedby do controle. */
export function describedBy(id: string, opts: { help?: unknown; error?: unknown }): string | undefined {
  if (opts.error) return `${id}-error`;
  if (opts.help) return `${id}-help`;
  return undefined;
}

export function V2Input({ className, ...rest }: React.ComponentProps<"input">) {
  return <input className={cn(control, "min-h-[52px]", className)} {...rest} />;
}

export function V2Textarea({ className, ...rest }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-[110px] py-3", className)} {...rest} />;
}

export function V2Select({ className, ...rest }: React.ComponentProps<"select">) {
  return <select className={cn(control, "min-h-[52px] pr-10", className)} {...rest} />;
}
