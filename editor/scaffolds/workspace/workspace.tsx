"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useMemo,
} from "react";
import produce from "immer";
import type {
  GDocument,
  OrganizationWithAvatar,
  OrganizationWithMembers,
  Project,
} from "@/types";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { PublicUrls } from "@/services/public-urls";
import useSWR from "swr";
import { EditorApiResponse } from "@/types/private/api";
import { Spinner } from "@/components/spinner";
import assert from "assert";

export interface WorkspaceState {
  loading: boolean;
  organization: OrganizationWithAvatar & OrganizationWithMembers;
  organizations: OrganizationWithAvatar[];
  project: Project | null;
  projects: Project[];
  documents: GDocument[];
}

interface __WorkspaceState {
  loading: boolean;
  organization: OrganizationWithAvatar & OrganizationWithMembers;
  organizations: OrganizationWithAvatar[];
  project: string | null;
  projects: Project[];
  documents: GDocument[];
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
    loading: state.loading,
    organization: state.organization,
    organizations: state.organizations,
    projects: state.projects,
    documents: state.documents,
    project: project,
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
  } satisfies __WorkspaceState;

  const [state, dispatch] = useReducer(workspaceReducer, initial);

  const { data } = useSWR<
    EditorApiResponse<{
      organizations: OrganizationWithAvatar[];
      projects: Project[];
      documents: GDocument[];
    }>
  >(
    `/private/workspace/${organization.id}`,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    },
    {}
  );

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
