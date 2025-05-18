import { Card, CardContent } from "@/components/ui/card";
import { fetchTemplates } from "./actions";
import { formlink } from "@/lib/forms/url";
import { Env } from "@/env";
import Header from "@/www/header";
import Footer from "@/www/footer";
import Image from "next/image";
import Link from "next/link";

export default async function TemplatesPage() {
  const data = await fetchTemplates();
  return (
    <div className="flex flex-col min-h-[100dvh]">
      <Header />
      <main className="flex-1">
        <section className="mt-20 w-full py-12 md:py-24 lg:py-32">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <h2 className="mx-auto max-w-2lg py-4 text-3xl font-bold tracking-tighter sm:text-5xl">
                  Explore Our Pre-Built Form Templates
                </h2>
                <p className="mx-auto max-w-md text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Browse our collection of customizable form templates to
                  kickstart your next project.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 mt-16">
              {data.map((item, i) => (
                <ItemCard
                  key={i}
                  form_id={item.form_id}
                  title={item.title}
                  description={item.description}
                  preview={item.preview_url}
                />
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function ItemCard({
  form_id,
  title,
  description,
  preview,
}: {
  form_id: string;
  title: string;
  description: string;
  preview: string;
}) {
  return (
    <Card className="group overflow-hidden">
      <Link
        href={formlink(Env.web.HOST, form_id)}
        target="_blank"
        prefetch={false}
      >
        <div className="overflow-hidden">
          <Image
            src={preview}
            width={600}
            height={450}
            alt={title}
            className="rounded-t-lg aspect-[4/3] object-cover group-hover:scale-105 transition-transform"
          />
        </div>
        <CardContent className="p-4">
          <h3 className="text-md font-semibold">{title}</h3>
          <p className="text-muted-foreground line-clamp-2 text-sm">
            {description}
          </p>
        </CardContent>
      </Link>
    </Card>
  );
}
