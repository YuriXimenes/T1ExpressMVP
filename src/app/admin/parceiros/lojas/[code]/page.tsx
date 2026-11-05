import type { Metadata } from "next";
import { StoreProfileView } from "@/components/admin/parceiros/store-profile-view";

export const metadata: Metadata = { title: "Ficha da loja" };

export default async function AdminStoreProfilePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <StoreProfileView code={decodeURIComponent(code)} />;
}
