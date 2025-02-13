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
    image: "/www/.print/materials/01.png",
    properties: ["220 gsm", "Acid-free", "Archival quality"],
  },
  {
    id: 2,
    name: "Glossy Photo Paper",
    description: "High-shine finish for vivid photo reproductions and posters.",
    image: "/www/.print/materials/02.png",
    properties: ["260 gsm", "Water-resistant", "Instant dry"],
  },
  {
    id: 3,
    name: "Textured Canvas",
    description:
      "Artist-grade canvas for fine art reproductions and photo prints.",
    image: "/www/.print/materials/03.png",
    properties: ["400 gsm", "Acid-free", "Stretchable"],
  },
  {
    id: 4,
    name: "Recycled Kraft Paper",
    description: "Eco-friendly option with a unique, natural texture.",
    image: "/www/.print/materials/04.png",
    properties: ["300 gsm", "100% recycled", "Biodegradable"],
  },
  {
    id: 5,
    name: "Translucent Vellum",
    description:
      "Semi-transparent paper for layering and creative print projects.",
    image: "/www/.print/materials/05.png",
    properties: ["80 gsm", "Acid-free", "Smooth finish"],
  },
  {
    id: 6,
    name: "Metallic Foil Paper",
    description: "Shimmering metallic finish for luxury invitations and cards.",
    image: "/www/.print/materials/06.png",
    properties: ["120 gsm", "Acid-free", "Metallic finish"],
  },
  {
    id: 7,
    name: "Adhesive Vinyl",
    description:
      "Durable, weatherproof vinyl for stickers, decals, and labels.",
    image: "/www/.print/materials/07.png",
    properties: ["100 micron", "Waterproof", "UV-resistant"],
  },
  {
    id: 8,
    name: "Magnetic Sheet",
    description:
      "Flexible magnetic sheet for fridge magnets and promotional items.",
    image: "/www/.print/materials/08.png",
    properties: ["0.5 mm", "Magnetic", "Printable"],
  },
  {
    id: 9,
    name: "Acrylic Plexiglass",
    description:
      "Clear, durable plexiglass for signs, displays, and photo mounting.",
    image: "/www/.print/materials/09.png",
    properties: ["3 mm", "Lightweight", "Impact-resistant"],
  },
  {
    id: 10,
    name: "Corrugated Cardboard",
    description:
      "Sturdy, lightweight cardboard for packaging and shipping boxes.",
    image: "/www/.print/materials/10.png",
    properties: ["3 mm", "Recyclable", "Shock-absorbent"],
  },
  {
    id: 11,
    name: "Fabric Canvas",
    description:
      "Polyester canvas with a fabric texture for banners and displays.",
    image: "/www/.print/materials/11.png",
    properties: ["220 gsm", "Waterproof", "Tear-resistant"],
  },
  {
    id: 12,
    name: "Wooden Board",
    description:
      "Natural wood board for rustic signs, decorations, and wall art.",
    image: "/www/.print/materials/12.png",
    properties: ["5 mm", "Sustainable", "Eco-friendly"],
  },
  {
    id: 13,
    name: "Metal Aluminum",
    description:
      "Brushed aluminum sheet for industrial signs and outdoor displays.",
    image: "/www/.print/materials/13.png",
    properties: ["1 mm", "Weatherproof", "Rust-resistant"],
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
