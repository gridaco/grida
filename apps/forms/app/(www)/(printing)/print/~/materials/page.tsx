import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const materials = [
  {
    id: 1,
    name: "Premium Matte Paper",
    description:
      "Smooth, non-glossy finish ideal for vibrant colors and sharp text.",
    image: "/www/.print/materials/a.png",
    properties: ["220 gsm", "Acid-free", "Archival quality"],
  },
  {
    id: 2,
    name: "Glossy Photo Paper",
    description: "High-shine finish for vivid photo reproductions and posters.",
    image: "/www/.print/materials/b.png",
    properties: ["260 gsm", "Water-resistant", "Instant dry"],
  },
  {
    id: 3,
    name: "Textured Canvas",
    description:
      "Artist-grade canvas for fine art reproductions and photo prints.",
    image: "/www/.print/materials/c.png",
    properties: ["400 gsm", "Acid-free", "Stretchable"],
  },
  {
    id: 4,
    name: "Recycled Kraft Paper",
    description: "Eco-friendly option with a unique, natural texture.",
    image: "/www/.print/materials/d.png",
    properties: ["300 gsm", "100% recycled", "Biodegradable"],
  },
];

export default function MaterialsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Materials</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {materials.map((material) => (
          <div key={material.id}>
            <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg">
              <CardContent className="p-0">
                <div className="relative w-full aspect-square">
                  <Image
                    src={material.image || "/placeholder.svg"}
                    alt={material.name}
                    fill
                    className="object-cover"
                  />
                </div>
              </CardContent>
            </Card>
            <div className="py-6">
              <h2 className="text-lg font-semibold mb-2">{material.name}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {material.description}
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {material.properties.map((prop, index) => (
                  <Badge variant="outline" key={index}>
                    {prop}
                  </Badge>
                ))}
              </div>
              <Button variant="link" className="p-0">
                View Details
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
