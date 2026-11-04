import type { Metadata } from "next";
import { PickupConfirmView } from "@/components/sections/pickup-confirm-view";

export const metadata: Metadata = {
  title: "Retirada do pedido",
  robots: { index: false, follow: false },
};

export default async function RetiradaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PickupConfirmView token={token} />;
}
