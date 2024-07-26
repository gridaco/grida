"use client";

import React, { createContext, useContext, useReducer, useEffect } from "react";
import produce from "immer";
import type { GDocument, Organization, Project } from "@/types";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { PublicUrls } from "@/services/public-urls";
import useSWR from "swr";
import { EditorApiResponse } from "@/types/private/api";

type OrganizationWithAvatar = Organization & {
  avatar_url: string | null;
};

interface WorkspaceState {
  loading: boolean;
  organization: OrganizationWithAvatar;
  organizations: OrganizationWithAvatar[];
  projects: Project[];
  documents: GDocument[];
}

type WorkspaceAction =
  | { type: "init/organizations"; organizations: OrganizationWithAvatar[] }
  | { type: "init/projects"; projects: Project[] }
  | { type: "init/documents"; documents: GDocument[] };

const WorkspaceContext = createContext<{
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
}>({
  state: null as any,
  dispatch: () => null,
});

const workspaceReducer = (state: WorkspaceState, action: WorkspaceAction) =>
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

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }

  return context;
};

export function Workspace({
  children,
  organization,
}: React.PropsWithChildren<{
  organization: Organization;
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
    documents: [],
  } satisfies WorkspaceState;

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
    if (data?.data) {
      const { organizations, projects, documents } = data.data;
      dispatch({
        type: "init/organizations",
        organizations: organizations,
      });
      dispatch({ type: "init/projects", projects: projects });
      dispatch({ type: "init/documents", documents: documents });
    }
  }, [data]);

  console.log("workspace", state);

  return (
    <WorkspaceContext.Provider value={{ state, dispatch }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
