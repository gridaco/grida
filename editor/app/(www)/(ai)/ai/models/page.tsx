import { type Metadata } from "next";
import ai from "@/lib/ai";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { ai as AITypes } from "@/lib/ai/ai";
import Header from "@/www/header";
import Footer from "@/www/footer";
export const metadata: Metadata = {
  title: "AI Models",
  description: "Explore the AI models on Grida",
};

function ModelCard({ model }: { model: AITypes.image.ImageModelCard }) {
  return (
    <Card className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card/50 backdrop-blur-sm border-muted relative hover:z-50 flex flex-col">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">{model.label}</CardTitle>
          <Badge
            variant="secondary"
            className="capitalize bg-muted/50 hover:bg-muted/80 transition-colors"
          >
            {model.vendor.replace(/-/g, " ")}
          </Badge>
        </div>
        <CardDescription className="text-base line-clamp-2">
          {model.short_description}
        </CardDescription>
      </CardHeader>
      <CardContent className="h-full flex flex-col justify-between gap-6">
        <div className="space-y-6">
          {/* Speed Info */}
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="capitalize bg-background/50">
              {model.speed_label}
            </Badge>
            <span className="text-sm text-muted-foreground">
              ~{model.speed_max}
            </span>
          </div>

          {/* Sizes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">
                Supported Sizes
              </h4>
              {model.sizes ? (
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-muted-foreground hover:text-foreground"
                    >
                      {model.sizes.length} sizes
                      <InfoCircledIcon className="ml-1 h-4 w-4" />
                    </Button>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-80" sideOffset={5}>
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Available Sizes</h4>
                      <div className="flex flex-wrap gap-2">
                        {model.sizes.map(
                          ([width, height, ratio]: AITypes.image.SizeSpec) => (
                            <Badge
                              key={ratio}
                              variant="outline"
                              className="bg-background/50"
                            >
                              {width}x{height}
                            </Badge>
                          )
                        )}
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Flexible dimensions
                </span>
              )}
            </div>
          </div>

          {/* Styles */}
          {model.styles && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Available Styles
              </h4>
              <div className="flex flex-wrap gap-2">
                {model.styles.slice(0, 3).map((style: string) => (
                  <Badge
                    key={style}
                    variant="secondary"
                    className="capitalize bg-muted/50 hover:bg-muted/80 transition-colors"
                  >
                    {style.replace(/_/g, " ")}
                  </Badge>
                ))}
                {model.styles.length > 3 && (
                  <Badge
                    variant="secondary"
                    className="bg-muted/50 hover:bg-muted/80 transition-colors"
                  >
                    +{model.styles.length - 3} more
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
        {/* Credit Info */}
        <div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              Average Credit
            </span>
            <span className="font-medium text-lg">{model.avg_credit}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AIModelsCatalogPage() {
  const models = ai.image.models;

  return (
    <main className="min-h-screen">
      <Header className="relative top-0 z-50" />
      {/* Hero Section */}
      <div className="container px-4 py-16 text-left">
        <h1 className="text-2xl font-bold tracking-tight mb-4">
          AI Models on Grida
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Explore our curated collection of state-of-the-art AI image generation
          models, each offering unique capabilities and creative possibilities.
        </p>
      </div>

      {/* Models Grid */}
      <div className="container mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {Object.values(models)
            .filter(
              (model): model is AITypes.image.ImageModelCard =>
                model !== undefined
            )
            .map((model) => (
              <ModelCard key={model.id} model={model} />
            ))}
        </div>
      </div>
      <div className="h-80" />
      <Footer />
    </main>
  );
}
