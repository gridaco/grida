import Link from "next/link";

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
      <Link href="./products/new">
        <button>Add product</button>
      </Link>
    </main>
  );
}
