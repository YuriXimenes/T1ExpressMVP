import type { Metadata } from "next";
import { StaffInviteView } from "@/components/sections/staff-invite-view";

export const metadata: Metadata = {
  title: "Convite para o backoffice",
  robots: { index: false, follow: false },
};

export default async function ConvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <StaffInviteView token={token} />;
}
