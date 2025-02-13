import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const templates = [
  {
    id: 1,
    name: "Business Card",
    category: "Business",
    image: "/www/.print/categories/a.png",
  },
  {
    id: 2,
    name: "Wedding Invitation",
    category: "Personal",
    image: "/www/.print/categories/b.png",
  },
  {
    id: 3,
    name: "Flyer",
    category: "Marketing",
    image: "/www/.print/categories/d.png",
  },
  {
    id: 4,
    name: "Brochure",
    category: "Marketing",
    image: "/www/.print/categories/c.png",
  },
  {
    id: 5,
    name: "Resume",
    category: "Personal",
    image: "/www/.print/categories/b.png",
  },
  {
    id: 6,
    name: "Menu",
    category: "Business",
    image: "/www/.print/categories/a.png",
  },
  {
    id: 7,
    name: "Postcard",
    category: "Marketing",
    image: "/www/.print/categories/c.png",
  },
  {
    id: 8,
    name: "Poster",
    category: "Marketing",
    image: "/www/.print/categories/d.png",
  },
];

export default function TemplatesPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Print Templates</h1>

      <div className="mb-8">
        <Input
          type="search"
          placeholder="Search templates..."
          className="max-w-sm"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {templates.map((template) => (
          <div
            key={template.id}
            className="bg-white rounded-lg shadow-md overflow-hidden"
          >
            <Image
              src={template.image || "/placeholder.svg"}
              alt={template.name}
              width={320}
              height={200}
              className="w-full h-40 object-cover"
            />
            <div className="p-4">
              <h3 className="font-semibold text-lg mb-1">{template.name}</h3>
              <p className="text-sm text-gray-600 mb-3">{template.category}</p>
              <Button className="w-full">Use Template</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
