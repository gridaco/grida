export interface EditorState {
  selectedPage: string;
  selectedNodes: string[];
  design: ReflectRepository;
}

export interface EditorSnapshot {
  selectedPage: string;
  selectedNodes: string[];
  design: ReflectRepository;
}

// TODO:
interface ReflectRepository {
  pages: [];
}
