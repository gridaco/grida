import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { WorkspaceManagementService } from "./workspace-manage.service";

@Controller("workspace")
export class WorkspaceManagementController {
  constructor(private readonly service: WorkspaceManagementService) {}
  @Get("/")
  listWorkspaces() {
    const userid = ""; // todo add auth
    this.service.listWorkspaces({
      user: userid,
    });
  }

  @Get("/last")
  getLastUsedWorkspace() {
    this.service.getWorkspace({
      id: workspaceid,
    });
  }

  @Get("/:id")
  getWorkspace(@Param("id") id: string) {
    const workspaceid = id;
    this.service.getWorkspace({
      id: workspaceid,
    });
  }
}
