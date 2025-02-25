import type { DataGridCellPositionQuery } from "../state";

export interface ICursorId {
  cursor_id: string;
}

export interface ICursorPos {
  x: number;
  y: number;
}

export interface ICursorWindowLocation {
  location: string;
}

export interface ICursorMessage {
  message: string;
}

export interface ICursorNode {
  type: "cell";
  pos: DataGridCellPositionQuery;
}
