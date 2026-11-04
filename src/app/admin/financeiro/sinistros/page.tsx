import type { Metadata } from "next";
import { soonItem } from "@/components/admin/shell/nav";
import { SoonPage } from "@/components/admin/soon-page";

const HREF = "/admin/financeiro/sinistros";

export const metadata: Metadata = { title: soonItem(HREF).label };

export default function Page() {
  return <SoonPage href={HREF} />;
}
