import PageHead from "components/page-head";
import React from "react";

export default function ProjectsIndexPage() {
  return (
    <>
      <PageHead
        type="data"
        title="Projects"
        description="Grida projects"
        keywords={[]}
        route="/projects"
      />
      <h1>Projects</h1>
    </>
  );
}
