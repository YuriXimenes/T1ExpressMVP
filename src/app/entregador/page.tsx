import type { Metadata } from "next";
import { DriverApp } from "@/components/driver/driver-app";

export const metadata: Metadata = {
  title: "Entregador",
  robots: { index: false, follow: false },
};

export default function EntregadorPage() {
  return <DriverApp />;
}
