import type { MetadataRoute } from "next";
import { IS_STAGING } from "@/lib/app-env";

// Produção: tudo liberado (mesmo efeito de não ter robots.txt, como antes).
// Staging: nada é indexado.
export default function robots(): MetadataRoute.Robots {
  return IS_STAGING
    ? { rules: { userAgent: "*", disallow: "/" } }
    : { rules: { userAgent: "*", allow: "/" } };
}
