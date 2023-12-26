export interface CraftDocument {
  width: number;
  height: number;
  children: string[];
  pages: Array<{
    id: string;
    name: string;
    children: any[];
  }>;
}

export interface State extends CraftDocument {}
