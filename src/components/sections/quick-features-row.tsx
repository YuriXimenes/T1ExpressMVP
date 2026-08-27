import { PackageCheck, ShieldCheck, Store, Truck } from "lucide-react";
import { Section } from "@/components/shared/section";
import { IconFeature } from "@/components/shared/icon-feature";

const features = [
  { icon: PackageCheck, title: "Compra" },
  { icon: Truck, title: "Transporte" },
  { icon: Store, title: "Para lojas" },
  { icon: ShieldCheck, title: "Segurança" },
];

export function QuickFeaturesRow() {
  return (
    <Section background="white" className="pt-8 pb-8 md:pt-10 md:pb-10">
      <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
        {features.map((feature) => (
          <IconFeature key={feature.title} icon={feature.icon} title={feature.title} />
        ))}
      </div>
    </Section>
  );
}
