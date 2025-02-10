import { Pricing } from "@/www/pricing/pricing";
import Header from "@/www/header";
import Footer from "@/www/footer";

export default function WWWPricingPage() {
  return (
    <main className="container mx-auto">
      <Header />
      <div className="h-40" />
      <Pricing />
      <Footer />
    </main>
  );
}
