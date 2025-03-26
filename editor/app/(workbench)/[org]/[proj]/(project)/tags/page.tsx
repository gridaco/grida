import { Suspense } from "react";
import { TagsTable } from "./tags-table";
import { TagsTableSkeleton } from "./tags-table-skeleton";
import { CreateTagButton } from "./create-tag-button";
import { ProjectTagsProvider } from "./context";

export default function TagsPage() {
  return (
    <ProjectTagsProvider>
      <div className="container py-10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tags</h1>
            <p className="text-muted-foreground mt-2">
              Manage tags to organize and categorize your customers.
            </p>
          </div>
          <CreateTagButton />
        </div>
        <Suspense fallback={<TagsTableSkeleton />}>
          <TagsTable />
        </Suspense>
      </div>
    </ProjectTagsProvider>
  );
}
