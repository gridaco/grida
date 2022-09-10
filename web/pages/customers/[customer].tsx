import React from "react";

export default function CareersPage({ id }: { id: string }) {
  return <h1>Customer - {id}</h1>;
}

export async function getServerSideProps(context: any) {
  const { customer } = context.query;
  return {
    props: {
      id: customer,
    }, // will be passed to the page component as props
  };
}
