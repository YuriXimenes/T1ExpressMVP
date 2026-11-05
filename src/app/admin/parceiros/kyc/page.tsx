import type { Metadata } from "next";
import { KycView } from "@/components/admin/parceiros/kyc-view";

export const metadata: Metadata = { title: "KYC / Onboarding" };

export default function AdminKycPage() {
  return <KycView />;
}
