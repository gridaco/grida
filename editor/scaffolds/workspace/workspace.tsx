"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import useSWR, { mutate } from "swr";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { PublicUrls } from "@/services/public-urls";
import { EditorApiResponse } from "@/types/private/api";
import { Spinner } from "@/components/spinner";
import type {
  GDocument,
  OrganizationWithAvatar,
  OrganizationWithMembers,
  Project,
} from "@/types";
import type { Platform } from "@/lib/platform";
import produce from "immer";
import assert from "assert";

export interface WorkspaceState {
  loading: boolean;
  organization: OrganizationWithAvatar & OrganizationWithMembers;
  organizations: OrganizationWithAvatar[];
  project:
    | (Project & {
        organization_name: string;
      })
    | null;
  projects: Project[];
  documents: GDocument[];
  refresh: () => void;
}

interface __WorkspaceState {
  loading: boolean;
  organization: OrganizationWithAvatar & OrganizationWithMembers;
  organizations: OrganizationWithAvatar[];
  project: string | null;
  projects: Project[];
  documents: GDocument[];
  refresh: () => void;
}

type WorkspaceAction =
  | { type: "init/organizations"; organizations: OrganizationWithAvatar[] }
  | { type: "init/projects"; projects: Project[] }
  | { type: "init/documents"; documents: GDocument[] };

const WorkspaceContext = createContext<{
  state: __WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
}>({
  state: null as any,
  dispatch: () => null,
});

const workspaceReducer = (state: __WorkspaceState, action: WorkspaceAction) =>
  produce(state, (draft) => {
    switch (action.type) {
      case "init/organizations":
        draft.organizations = action.organizations;
        break;
      case "init/projects":
        draft.projects = action.projects;
        draft.loading = false;
        break;
      case "init/documents":
        draft.documents = action.documents;
        break;
      default:
        break;
    }
  });

export const useWorkspace = (): WorkspaceState => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  const { state } = context;
  const projectname = state.project;
  const project = useMemo(() => {
    return state.projects.find((p) => p.name === projectname) || null;
  }, [state.projects, projectname]);

  return {
    refresh: state.refresh,
    loading: state.loading,
    organization: state.organization,
    organizations: state.organizations,
    projects: state.projects,
    documents: state.documents,
    project: project
      ? {
          ...project,
          organization_name: state.organization.name,
        }
      : null,
  };
};

export function Workspace({
  children,
  organization,
  project,
}: React.PropsWithChildren<{
  organization: OrganizationWithMembers;
  project?: string;
}>) {
  const supabase = createClientWorkspaceClient();

  const key = `/private/workspace/${organization.id}`;
  const { data } = useSWR<
    EditorApiResponse<{
      organizations: OrganizationWithAvatar[];
      projects: Project[];
      documents: GDocument[];
    }>
  >(
    key,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    },
    {}
  );

  const initial = {
    loading: true,
    organization: {
      ...organization,
      avatar_url: organization.avatar_path
        ? PublicUrls.organization_avatar_url(supabase)(organization.avatar_path)
        : null,
    },
    organizations: [],
    projects: [],
    project: project || null,
    documents: [],
    refresh: () => {
      mutate(key);
    },
  } satisfies __WorkspaceState;

  const [state, dispatch] = useReducer(workspaceReducer, initial);

  useEffect(() => {
    if (!data?.data) return;
    const { organizations, projects, documents } = data.data;
    dispatch({
      type: "init/organizations",
      organizations: organizations,
    });
    dispatch({ type: "init/projects", projects: projects });
    dispatch({ type: "init/documents", documents: documents });
  }, [data]);

  return (
    <WorkspaceContext.Provider value={{ state, dispatch }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useProject() {
  const { project } = useWorkspace();
  assert(project, "Project not loaded");
  return project;
}

export function ProjectLoaded({
  children,
  loading = (
    <div className="w-full h-full flex items-center justify-center">
      <Spinner />
    </div>
  ),
}: React.PropsWithChildren<{
  loading?: React.ReactNode;
}>) {
  const { project } = useWorkspace();
  if (!project) return loading;
  return <>{children}</>;
}

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
  refresh: () => void;
}

const ProjectTagsContext = createContext<ProjectTagsState | null>(null);

export function ProjectTagsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { id: project_id, organization_id } = useProject();

  const supabase = useMemo(() => createClientWorkspaceClient(), []);

  const key = `/private/workspace/${organization_id}/projects/${project_id}/tags`;

  const { data, isLoading } = useSWR<
    EditorApiResponse<Platform.Tag.TagWithUsageCount[]>
  >(key, async (url: string) => {
    const res = await fetch(url);
    return res.json();
  });

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

  const createTag = useCallback(
    async (
      tag: Platform.Tag.TagNameAndColorAndDescription
    ): Promise<boolean> => {
      const { data, error } = await __createTag(tag);
      if (error || !data) {
        console.error("Failed to create tag", error);
        return false;
      }

      mutate(key);

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

      mutate(key);

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

      mutate(key);

      return true;
    },
    [supabase]
  );

  const refresh = useCallback(() => {
    mutate(key);
  }, [key]);

  return (
    <ProjectTagsContext.Provider
      value={{
        tags: data?.data || [],
        isLoading,
        createTag,
        deleteTag,
        updateTag,
        refresh,
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
