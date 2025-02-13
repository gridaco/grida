import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type TemplateCategory = {
  id: number;
  name: string;
  description: string;
  image: string;
};

export const categories: TemplateCategory[] = [
  {
    id: 1,
    name: "Docs",
    description: "Create professional documents with ease.",
    image: "/www/.print/categories/01.png",
  },
  {
    id: 2,
    name: "Whiteboards",
    description: "Collaborate visually with brainstorming and planning tools.",
    image: "/www/.print/categories/02.png",
  },
  {
    id: 3,
    name: "Presentations",
    description: "Design engaging slides for meetings and events.",
    image: "/www/.print/categories/03.png",
  },
  {
    id: 4,
    name: "Logos",
    description: "Craft unique logos for your brand or business.",
    image: "/www/.print/categories/04.png",
  },
  {
    id: 5,
    name: "Videos",
    description: "Edit and create stunning video content.",
    image: "/www/.print/categories/05.png",
  },
  {
    id: 7,
    name: "Infographics",
    description: "Visualize data and information effectively.",
    image: "/www/.print/categories/06.png",
  },
  {
    id: 8,
    name: "Business Cards",
    description: "Create sleek and professional business cards.",
    image: "/www/.print/categories/07.png",
  },
  {
    id: 9,
    name: "T-Shirts",
    description: "Design custom apparel with unique graphics.",
    image: "/www/.print/categories/08.png",
  },
  {
    id: 10,
    name: "Instagram Stories",
    description: "Engage your audience with stylish story templates.",
    image: "/www/.print/categories/09.png",
  },
  {
    id: 11,
    name: "Instagram Posts",
    description: "Create eye-catching posts for social media.",
    image: "/www/.print/categories/11.png",
  },
  {
    id: 12,
    name: "Resumes",
    description: "Build impressive resumes that stand out.",
    image: "/www/.print/categories/12.png",
  },
  {
    id: 13,
    name: "Brochures",
    description: "Inform and promote with well-designed brochures.",
    image: "/www/.print/categories/13.png",
  },
  {
    id: 14,
    name: "Desktop Wallpapers",
    description: "Customize your desktop with stunning backgrounds.",
    image: "/www/.print/categories/14.png",
  },
  {
    id: 15,
    name: "Book Covers",
    description: "Design book covers that captivate readers.",
    image: "/www/.print/categories/15.png",
  },
  {
    id: 16,
    name: "Letterheads",
    description: "Maintain a professional look for official documents.",
    image: "/www/.print/categories/16.png",
  },
  {
    id: 17,
    name: "Album Covers",
    description: "Create stunning visuals for music albums.",
    image: "/www/.print/categories/17.png",
  },
];

interface Template {
  id: number;
  name: string;
  category: string;
  image: string;
}

const templates = [
  {
    id: 1,
    name: "Business Card",
    category: "Business",
    image: "/www/.print/categories/01.png",
  },
  {
    id: 2,
    name: "Wedding Invitation",
    category: "Personal",
    image: "/www/.print/categories/02.png",
  },
  {
    id: 3,
    name: "Flyer",
    category: "Marketing",
    image: "/www/.print/categories/03.png",
  },
  {
    id: 4,
    name: "Brochure",
    category: "Marketing",
    image: "/www/.print/categories/04.png",
  },
  {
    id: 5,
    name: "Resume",
    category: "Personal",
    image: "/www/.print/categories/05.png",
  },
  {
    id: 6,
    name: "Menu",
    category: "Business",
    image: "/www/.print/categories/06.png",
  },
  {
    id: 7,
    name: "Postcard",
    category: "Marketing",
    image: "/www/.print/categories/07.png",
  },
  {
    id: 8,
    name: "Poster",
    category: "Marketing",
    image: "/www/.print/categories/08.png",
  },
];

export default function TemplatesPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Browse Templates</h1>

      <div className="mb-8">
        <Input
          type="search"
          placeholder="Search templates..."
          className="max-w-sm"
        />
      </div>

      <div className="grid gap-4">
        <label>
          <span className="text-sm font-medium">Categories</span>
        </label>
        <div className="flex items-center gap-4 overflow-x-scroll">
          {categories.map((category) => (
            <CategoryCard key={category.id} {...category} />
          ))}
        </div>
      </div>

      <div className="h-20" />

      <div className="grid gap-4">
        <label>
          <span className="text-sm font-medium">Popular</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoryCard({ name, image }: { name: string; image: string }) {
  return (
    <div className="flex flex-col">
      <div className="relative h-20 aspect-video rounded-lg overflow-hidden">
        <Image
          src={image || "/placeholder.svg"}
          alt={name}
          layout="fill"
          objectFit="cover"
        />
      </div>
      <div className="w-full text-ellipsis">
        <p className="mt-2 w-full text-xs font-medium">{name}</p>
      </div>
    </div>
  );
}

function TemplateCard({ template }: { template: Template }) {
  return (
    <div className="flex flex-col">
      <div className="bg-background rounded-lg shadow-md overflow-hidden">
        <Image
          src={template.image || "/placeholder.svg"}
          alt={template.name}
          width={400}
          height={300}
          className="w-full h-56 object-cover"
        />
      </div>
      <div className="py-2">
        <h3 className="font-semibold mb-1">{template.name}</h3>
        <p className="text-sm text-muted-foreground">{template.category}</p>
      </div>
    </div>
  );
}
