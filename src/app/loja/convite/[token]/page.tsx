import type { Metadata } from "next";
import { StoreInviteView } from "@/components/store/store-invite-view";

export const metadata: Metadata = {
  title: "Convite da loja",
  robots: { index: false, follow: false },
};

export default async function LojaConvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <StoreInviteView token={token} />;
}
