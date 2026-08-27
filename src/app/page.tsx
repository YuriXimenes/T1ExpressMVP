import { HeroSection } from "@/components/sections/hero-section";
import { QuickFeaturesRow } from "@/components/sections/quick-features-row";
import { HowItWorksSection } from "@/components/sections/how-it-works-section";
import { NetworkSection } from "@/components/sections/network-section";
import { TrackingSection } from "@/components/sections/tracking-section";
import { ForShopsSection } from "@/components/sections/for-shops-section";
import { getFeaturedStores, getPartnerStores } from "@/lib/services/stores.service";

export default async function Home() {
  const [allStores, featuredStores] = await Promise.all([
    getPartnerStores(),
    getFeaturedStores(6),
  ]);

  return (
    <>
      <HeroSection stores={allStores} />
      <QuickFeaturesRow />
      <HowItWorksSection />
      <NetworkSection stores={featuredStores} />
      <TrackingSection />
      <ForShopsSection />
    </>
  );
}
