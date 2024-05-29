"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlphaDisabledFeature } from "@/components/beta/comming-soon-overlay";

export default function StoreProductsPage() {
  return (
    <AlphaDisabledFeature>
      <main className="h-full flex flex-col">
        <Tabs className="h-full" defaultValue="products">
          <TabsList>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
          </TabsList>
          <TabsContent className="w-full h-full" value="products">
            <div className="h-full flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm">
              <div className="flex flex-col items-center gap-1 text-center">
                <h3 className="text-2xl font-bold tracking-tight">
                  You have no products
                </h3>
                <p className="text-sm text-muted-foreground">
                  Let&apos;s start by adding your first product
                </p>
                <Link href="./products/new">
                  <Button className="mt-4">Add Product</Button>
                </Link>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </AlphaDisabledFeature>
  );
}
