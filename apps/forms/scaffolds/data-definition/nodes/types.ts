export const TABLE_NODE_TYPE = "table";
export type TableNodeData = {
  name: string;
  is_referenced: boolean;
  properties: {
    id: string;
    name: string;
    format: string;
    is_primary: boolean;
    is_nullable: boolean;
    is_unique: boolean;
  }[];
};
