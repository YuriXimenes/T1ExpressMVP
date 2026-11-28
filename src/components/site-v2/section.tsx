import { cn } from "@/lib/utils";
import { V2Container } from "@/components/site-v2/container";
import { DisplayHeading, Eyebrow } from "@/components/site-v2/heading";

/** Seção com o espaçamento do layout novo. */
export function V2Section({
  id,
  className,
  containerClassName,
  size = "lg",
  labelledBy,
  children,
}: {
  id?: string;
  className?: string;
  containerClassName?: string;
  size?: "lg" | "sm";
  labelledBy?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(size === "sm" ? "pt-[clamp(36px,5vw,64px)]" : "pt-[clamp(56px,8vw,112px)]", className)}
    >
      <V2Container className={containerClassName}>{children}</V2Container>
    </section>
  );
}

/** Cabeçalho de seção: selo + título (e ações à direita, ou centralizado). */
export function SectionHead({
  eyebrow,
  title,
  titleId,
  actions,
  center = false,
  lead,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  titleId?: string;
  actions?: React.ReactNode;
  center?: boolean;
  lead?: React.ReactNode;
}) {
  if (center) {
    return (
      <div className="px-2 text-center">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <DisplayHeading id={titleId} className="mt-3 text-[clamp(44px,6.6vw,92px)] leading-[1.08]">
          {title}
        </DisplayHeading>
        {lead && <p className="mx-auto mt-3.5 max-w-[620px] text-t1-muted">{lead}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-4 border-b border-t1-line pb-[22px] md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <DisplayHeading id={titleId} className="mt-2 text-[clamp(40px,6vw,84px)]">
          {title}
        </DisplayHeading>
        {lead && <p className="mt-3 max-w-[640px] text-[16.5px] text-t1-muted">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
