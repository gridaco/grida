import Link from "next/link";
// import {
//   Select,
//   SelectTrigger,
//   SelectValue,
//   SelectContent,
//   SelectItem,
// } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/www/header";
import Footer from "@/www/footer";
import Image from "next/image";
import { fetchTemplates } from "./actions";
import { formlink } from "@/lib/forms/url";

const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

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
              {/* <div className="flex flex-col gap-2 min-[400px]:flex-row">
                <Select>
                  <SelectTrigger className="h-10 w-full sm:w-auto">
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="contact">Contact</SelectItem>
                    <SelectItem value="registration">Registration</SelectItem>
                    <SelectItem value="feedback">Feedback</SelectItem>
                    <SelectItem value="application">Application</SelectItem>
                  </SelectContent>
                </Select>
                <Select>
                  <SelectTrigger className="h-10 w-full sm:w-auto">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="popular">Most Popular</SelectItem>
                    <SelectItem value="rating">Highest Rated</SelectItem>
                  </SelectContent>
                </Select>
              </div> */}
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 mt-16">
              {data.map((item, i) => (
                <ItemCard
                  key={i}
                  form_id={item.form_id}
                  title={item.title}
                  description={item.description}
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
}: {
  form_id: string;
  title: string;
  description: string;
}) {
  return (
    <Card className="group overflow-hidden">
      <Link
        href={formlink(HOST_NAME, form_id)}
        target="_blank"
        prefetch={false}
      >
        <div className="overflow-hidden">
          <Image
            src="/images/abstract-placeholder.jpg"
            width={400}
            height={300}
            alt="Order Form"
            className="rounded-t-lg h-auto w-full object-cover group-hover:scale-105 transition-transform"
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
