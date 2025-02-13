import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-12 text-center">
        Printing Materials
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {materials.map((material) => (
          <Card
            key={material.id}
            className="overflow-hidden transition-all duration-300 hover:shadow-lg"
          >
            <CardContent className="p-0">
              <div className="relative h-64 md:h-80">
                <Image
                  src={material.image || "/placeholder.svg"}
                  alt={material.name}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="p-6">
                <h2 className="text-2xl font-semibold mb-2">{material.name}</h2>
                <p className="text-gray-600 mb-4">{material.description}</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {material.properties.map((prop, index) => (
                    <span
                      key={index}
                      className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm"
                    >
                      {prop}
                    </span>
                  ))}
                </div>
                <Button className="w-full">Select Material</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
