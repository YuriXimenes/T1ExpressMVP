import { Check, Clock } from "lucide-react";
import { soonItem } from "@/components/admin/shell/nav";

/** Página de uma tela que ainda vai ser construída: o que vai ter e quando. */
export function SoonPage({ href }: { href: string }) {
  const item = soonItem(href);
  const Icon = item.icon;
  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 sm:p-10">
        <div className="flex items-center gap-3">
          <span className="bg-brand-50 text-brand-600 flex h-11 w-11 items-center justify-center rounded-xl">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{item.label}</h1>
            <p className="flex items-center gap-1 text-xs font-medium text-amber-700">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Em breve · entrega {item.soon.delivery} do roteiro do backoffice
            </p>
          </div>
        </div>
        <p className="mt-5 text-slate-600">{item.soon.summary}</p>
        <ul className="mt-4 flex flex-col gap-2">
          {item.soon.features.map((feature) => (
            <li key={feature} className="flex gap-2 text-sm text-slate-600">
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
                aria-hidden="true"
              />
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
