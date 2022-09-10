import React from "react";

export default function JobPage({ id }: { id: string }) {
  return <h1>Job openning - {id}</h1>;
}

export async function getServerSideProps(context: any) {
  const { job } = context.query;
  return {
    props: {
      id: job,
    }, // will be passed to the page component as props
  };
}
