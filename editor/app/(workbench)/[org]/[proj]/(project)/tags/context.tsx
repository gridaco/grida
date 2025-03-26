"use client";

import { Platform } from "@/lib/platform";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { useProject } from "@/scaffolds/workspace";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface ProjectTagsState {
  isLoading: boolean;
  tags: Platform.Tag.TagWithUsageCount[];
  createTag: (
    tag: Platform.Tag.TagNameAndColorAndDescription
  ) => Promise<boolean>;
  deleteTag: (id: number) => Promise<boolean>;
  updateTag: (
    id: number,
    tag: Platform.Tag.TagNameAndColorAndDescription
  ) => Promise<boolean>;
}

const ProjectTagsContext = createContext<ProjectTagsState | null>(null);

export function ProjectTagsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { id: project_id } = useProject();
  const [value, setValue] = useState<
    Pick<ProjectTagsState, "isLoading" | "tags">
  >({
    isLoading: true,
    tags: [],
  });

  const supabase = useMemo(() => createClientWorkspaceClient(), []);

  const __fetchTags = useCallback(async () => {
    return await supabase
      .from("tag")
      .select(
        `
          *,
          customer_tag(count)
        `
      )
      .eq("project_id", project_id);
  }, [supabase, project_id]);

  const __createTag = useCallback(
    async (tag: Platform.Tag.TagNameAndColorAndDescription) => {
      return await supabase
        .from("tag")
        .insert({
          project_id,
          ...tag,
        })
        .select("*")
        .single();
    },
    [supabase, project_id]
  );

  useEffect(() => {
    __fetchTags().then(({ data, error }) => {
      if (!data) return;
      const tags = data;
      const tagsWithUsage = tags?.map((tag) => ({
        ...tag,
        usage_count: tag.customer_tag[0].count,
      })) satisfies Platform.Tag.TagWithUsageCount[];
      setValue({ isLoading: false, tags: tagsWithUsage });
      //
    });
  }, [__fetchTags]);

  const createTag = useCallback(
    async (
      tag: Platform.Tag.TagNameAndColorAndDescription
    ): Promise<boolean> => {
      const { data, error } = await __createTag(tag);
      if (error || !data) {
        console.error("Failed to create tag", error);
        return false;
      }

      setValue((prev) => ({
        ...prev,
        tags: [...prev.tags, { ...data, usage_count: 0 }],
      }));

      return true;
    },
    [__createTag]
  );

  const deleteTag = useCallback(
    async (tagId: number): Promise<boolean> => {
      const { error } = await supabase.from("tag").delete().eq("id", tagId);
      if (error) {
        console.error("Failed to delete tag", error);
        return false;
      }

      setValue((prev) => ({
        ...prev,
        tags: prev.tags.filter((tag) => tag.id !== tagId),
      }));

      return true;
    },
    [supabase]
  );

  const updateTag = useCallback(
    async (
      id: number,
      tag: Platform.Tag.TagNameAndColorAndDescription
    ): Promise<boolean> => {
      const { error } = await supabase.from("tag").update(tag).eq("id", id);
      if (error) {
        console.error("Failed to update tag", error);
        return false;
      }

      setValue((prev) => ({
        ...prev,
        tags: prev.tags.map((t) => (t.id === id ? { ...t, ...tag } : t)),
      }));

      return true;
    },
    [supabase]
  );

  return (
    <ProjectTagsContext.Provider
      value={{
        ...value,
        createTag,
        deleteTag,
        updateTag,
      }}
    >
      {children}
    </ProjectTagsContext.Provider>
  );
}

export function useTags() {
  const context = useContext(ProjectTagsContext);
  if (!context) {
    throw new Error("useTags must be used within a ProjectTagsProvider");
  }

  return context;
}
