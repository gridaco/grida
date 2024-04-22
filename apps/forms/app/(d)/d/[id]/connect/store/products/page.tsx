import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function StoreProductsPage() {
  return (
    <main className="h-full flex flex-col">
      <nav>
        <ul className="flex gap-2">
          <li>Products</li>
          <li>Inventory</li>
          <li>Orders</li>
        </ul>
      </nav>
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm">
        <div className="flex flex-col items-center gap-1 text-center">
          <h3 className="text-2xl font-bold tracking-tight">
            You have no products
          </h3>
          <p className="text-sm text-muted-foreground">
            You can start selling as soon as you add a product.
          </p>
          <Link href="./products/new">
            <Button className="mt-4">Add Product</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
