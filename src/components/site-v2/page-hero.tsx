import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/site-v2/heading";

/** Herói das páginas internas: céu claro, título grande centralizado. */
export function PageHero({
  eyebrow,
  title,
  lead,
  actions,
  small = false,
  className,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
  /** Versão baixa, para telas de fluxo (login, pedido). */
  small?: boolean;
  className?: string;
  /** Conteúdo que "sobe" sobre o herói (ex.: cartões de destaque). */
  children?: React.ReactNode;
}) {
  return (
    <div className="px-2 sm:px-3">
      <section
        className={cn(
          "t1-page-hero relative isolate flex justify-center overflow-hidden rounded-3xl shadow-[inset_0_0_0_1px_rgba(15,23,42,.05)]",
          small ? "min-h-[180px]" : "min-h-[250px]",
          className,
        )}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(70%_80%_at_50%_35%,rgba(255,255,255,.55)_0%,transparent_65%),linear-gradient(180deg,transparent_55%,rgba(246,248,252,.92))]"
        />
        <div className={cn("relative max-w-[980px] px-[18px] text-center", small ? "pt-8 pb-12" : "pt-10 pb-[70px]")}>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1
            className={cn(
              "mt-2.5 font-t1-display leading-[1.02] font-normal text-t1-ink uppercase",
              small ? "text-[clamp(40px,6vw,72px)]" : "text-[clamp(46px,8.4vw,112px)]",
            )}
          >
            {title}
          </h1>
          {lead && <p className="mx-auto mt-3.5 max-w-[620px] text-[15.5px] text-[#334155]">{lead}</p>}
          {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">{actions}</div>}
        </div>
      </section>
      {children && (
        <div className="relative z-10 mx-auto -mt-14 w-full max-w-[1320px] px-2 sm:px-3 lg:px-6">{children}</div>
      )}
    </div>
  );
}
