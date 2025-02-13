import Image from "next/image";
import { Input } from "@/components/ui/input";
import * as k from "../../data";

export default function TemplatesPage() {
  return (
    <div className="container mx-auto px-4 py-16">
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
          {k.categories.map((category) => (
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
          {k.templates.map((template) => (
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

function TemplateCard({ template }: { template: k.Template }) {
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
