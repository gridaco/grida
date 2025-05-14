import { Injectable } from "@nestjs/common";
import { PrismaService } from "../_prisma/prisma.service";

@Injectable()
export class WorkspaceManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkspaces(p: { user: string }) {
    const list = await this.prisma.workspace.findMany({
      where: {
        // query by owner (requester)
      },
    });
    return list;
  }

  async getWorkspace(p: { id: string }) {
    const workspace = await this.prisma.workspace.findUnique({
      where: {
        id: p.id,
      },
    });

    return workspace;
  }

  async getPrimaryWorkspace() {
    // primary = last used
    const userid = "";
    const workspace = await this.prisma.workspace.findFirst({
      orderBy: {
        updatedAt: "asc", // check this (asc? desc?)
      },
      where: {
        id: userid,
      },
    });

    return workspace;
  }

  async getPersonalWorkspace() {
    // personal = default created under user's name
  }

  async createWorkspace(p: { user: string; workspace: string }) {}

  async archiveWorkspace(p: { user: string; workspace: string }) {}

  async updateWorkspaceInformation() {}
}
