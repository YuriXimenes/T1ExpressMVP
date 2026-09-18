import { HeroSection } from "@/components/sections/hero-section";
import { StoreLogosSection } from "@/components/sections/store-logos-section";
import { HowItWorksSection } from "@/components/sections/how-it-works-section";
import { RioNetworkSection } from "@/components/sections/rio-network-section";
import { MarketComparisonSection } from "@/components/sections/market-comparison-section";
import { ForShopsSection } from "@/components/sections/for-shops-section";
import { getCatalog } from "@/lib/catalog/server";

export default async function Home() {
  const { pickupPartners, storeLogos } = await getCatalog();

  return (
    <>
      <HeroSection />
      <StoreLogosSection logos={storeLogos} />
      <HowItWorksSection />
      <RioNetworkSection partners={pickupPartners} />
      <MarketComparisonSection />
      <ForShopsSection />
    </>
  );
}
