"use client";
import Link from "next/link";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/www/header";
import Footer from "@/www/footer";
import Image from "next/image";

export default function TemplatesPage() {
  return (
    <main className="flex-1">
      <Header />
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
            <div className="flex flex-col gap-2 min-[400px]:flex-row">
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
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 mt-16">
            <ItemCard />
            <ItemCard />
            <ItemCard />
            <ItemCard />
            <ItemCard />
            <ItemCard />
            <ItemCard />
            <ItemCard />
            <ItemCard />
            <ItemCard />
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function ItemCard() {
  return (
    <Card className="group overflow-hidden">
      <Link href="#" prefetch={false}>
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
          <h3 className="text-md font-semibold">Order Form</h3>
          <p className="text-muted-foreground line-clamp-2 text-sm">
            A customizable order form template for your e-commerce website.
          </p>
        </CardContent>
      </Link>
    </Card>
  );
}
