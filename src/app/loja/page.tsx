import type { Metadata } from "next";
import { StoreApp } from "@/components/store/store-app";

export const metadata: Metadata = {
  title: "Área da loja",
  robots: { index: false, follow: false },
};

export default function LojaPage() {
  return <StoreApp />;
}
