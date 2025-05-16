import { CheckCircle2 } from "lucide-react";

export default function StartFree() {
  return (
    <div className="flex flex-col items-center">
      <h2 className="text-4xl font-semibold text-center max-w-2xl mx-auto">
        Start Free, Scale When You Need
      </h2>
      <div className="mt-16 max-w-3xl w-full">
        <div className="bg-card border rounded-xl p-8">
          <div className="flex flex-col gap-6">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="w-6 h-6 text-primary shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold">Unlimited Responses</h3>
                <p className="text-muted-foreground mt-1">
                  Free unlimited responses until you reach 10,000+ Monthly
                  Active Users
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle2 className="w-6 h-6 text-primary shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold">All Features Included</h3>
                <p className="text-muted-foreground mt-1">
                  Access to all customization features from day one, no premium
                  paywall
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle2 className="w-6 h-6 text-primary shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold">Free Custom Domain</h3>
                <p className="text-muted-foreground mt-1">
                  Get your own custom domain to maintain your brand identity
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
