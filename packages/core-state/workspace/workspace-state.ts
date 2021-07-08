import { HistoryState } from "../history";
import { Workspace } from "@core/model";
export interface WorkspaceState extends Workspace {
  history: HistoryState;
}
