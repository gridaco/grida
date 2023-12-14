import PageHead from "components/page-head";
import React from "react";

export default function ProductsIndexPage() {
  return (
    <>
      <PageHead
        type="data"
        title="Products"
        description="Grida products"
        keywords={[]}
        route="/products"
      />
      <h1>Products</h1>
    </>
  );
}
