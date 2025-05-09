import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Folder,
  File,
  ChevronRight,
  MoreHorizontal,
  Check,
} from "lucide-react";
import { cn } from "@/components/lib/utils";
import { vfs } from "@/lib/vfs";

type PathTokens = string[];

type FileNode = {
  type: "file";
  name: string;
  key: string;
  mimetype: string;
  size: number;
  modified?: string;
  url: string;
  thumbnail?: string;
};

type FolderNode = {
  type: "folder";
  name: string;
  key: string;
  size?: number;
  modified?: string;
};

type EntityNode = FileNode | FolderNode;

type FilePickerContextType = {
  currentPath: string[];
  currentNodes: EntityNode[];
  selectedNodes: EntityNode[];
  selectNode: (node: EntityNode) => void;
  navigateToFolder: (node: EntityNode) => void;
  navigateToBreadcrumb: (index: number) => void;
};

const FilePickerContext = createContext<FilePickerContextType | null>(null);
const useFilePicker = () => {
  const ctx = useContext(FilePickerContext);
  if (!ctx) throw new Error("useFilePicker must be used within Provider");
  return ctx;
};

interface FilePickerProviderProps {
  children: React.ReactNode;
  nodes: EntityNode[];
  list: (path: string[]) => Promise<void>;
  onValueChange?: (nodes: EntityNode[]) => void;
  onValueCommit?: (nodes: EntityNode[]) => void;
  multiple?: boolean;
}

const FilePickerProvider: React.FC<FilePickerProviderProps> = ({
  children,
  nodes,
  list,
  onValueChange,
  multiple = false,
}) => {
  const [currentPath, setCurrentPath] = useState<string[]>(["/"]);
  const [selectedNodes, setSelectedNodes] = useState<EntityNode[]>([]);

  const currentNodes = useMemo(() => {
    const currentSegments =
      currentPath[0] === "/" && currentPath.length === 1
        ? []
        : currentPath.slice(1);
    return nodes.filter((node) => {
      const nodeSegments = node.key.split("/").filter(Boolean);
      return (
        nodeSegments.length === currentSegments.length + 1 &&
        currentSegments.every((seg, i) => nodeSegments[i] === seg)
      );
    });
  }, [nodes, currentPath]);

  useEffect(() => {
    list(currentPath);
  }, [currentPath, list]);

  const selectNode = useCallback(
    (node: EntityNode) => {
      if (node.type !== "file") return;
      setSelectedNodes((prev) => {
        const next = multiple
          ? prev.includes(node)
            ? prev.filter((n) => n !== node)
            : [...prev, node]
          : [node];
        onValueChange && onValueChange(next);
        return next;
      });
    },
    [multiple, onValueChange]
  );

  const navigateToFolder = useCallback((node: EntityNode) => {
    if (node.type !== "folder") return;
    setCurrentPath((prev) => [...prev, node.name]);
  }, []);

  const navigateToBreadcrumb = useCallback((index: number) => {
    setCurrentPath((prev) => prev.slice(0, index + 1));
  }, []);

  return (
    <FilePickerContext.Provider
      value={{
        currentPath,
        currentNodes,
        selectedNodes,
        selectNode,
        navigateToFolder,
        navigateToBreadcrumb,
      }}
    >
      {children}
    </FilePickerContext.Provider>
  );
};

const Breadcrumb: React.FC = () => {
  const { currentPath, navigateToBreadcrumb } = useFilePicker();
  const maxVisible = 4;
  let visible = currentPath;
  if (currentPath.length > maxVisible) {
    visible = [currentPath[0], "...", ...currentPath.slice(-2)];
  }
  return (
    <div className="flex items-center text-sm mb-4">
      {visible.map((crumb, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <ChevronRight className="h-4 w-4 mx-1" />}
          {crumb === "..." ? (
            <MoreHorizontal className="h-4 w-4 mx-1" />
          ) : (
            <button
              onClick={() => navigateToBreadcrumb(currentPath.indexOf(crumb))}
              className="hover:underline"
            >
              {crumb}
            </button>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

interface FileListProps {
  accept: string[];
  loading?: boolean;
}

const FileList: React.FC<FileListProps> = ({ accept, loading }) => {
  const { currentNodes, selectNode, navigateToFolder, selectedNodes } =
    useFilePicker();

  const isAccepted = useCallback(
    (node: EntityNode) => {
      if (node.type === "folder") return true;
      if (!accept.length) return true;
      return accept.some((a) => {
        if (a.endsWith("/*")) {
          const base = a.split("/")[0];
          return node.mimetype.startsWith(base);
        }
        return node.mimetype === a;
      });
    },
    [accept]
  );

  const filtered = currentNodes.filter(isAccepted);
  if (loading) return <div className="p-4">Loading...</div>;
  if (!filtered.length) return <div className="p-4">No files found.</div>;

  return (
    <ul className="space-y-1">
      {filtered.map((node) => (
        <li key={node.key}>
          <button
            className={cn(
              "flex items-center w-full text-left px-2 py-1 rounded",
              node.type === "file" ? "text-blue-600" : "text-gray-800",
              selectedNodes.includes(node) && "bg-blue-100",
              "hover:bg-gray-100"
            )}
            onClick={() => selectNode(node)}
            onDoubleClick={() => {
              if (node.type === "folder") {
                navigateToFolder(node);
              }
            }}
          >
            {node.type === "folder" ? (
              <Folder className="mr-2 h-4 w-4 text-yellow-500" />
            ) : (
              <File className="mr-2 h-4 w-4" />
            )}
            <span className="text-sm flex-grow">{node.name}</span>
            {selectedNodes.includes(node) && <Check className="h-4 w-4" />}
          </button>
        </li>
      ))}
    </ul>
  );
};

const Footer: React.FC<{
  onValueCommit?: (nodes: EntityNode[]) => void;
}> = ({ onValueCommit }) => {
  const { selectedNodes } = useFilePicker();
  return (
    <div className="p-4 border-t mt-auto flex justify-end">
      <Button
        size="sm"
        onClick={() => onValueCommit && onValueCommit(selectedNodes)}
        disabled={selectedNodes.length === 0}
      >
        Select {selectedNodes.length > 1 ? "Files" : "File"}
      </Button>
    </div>
  );
};

interface FilePickerProps {
  title?: string;
  nodes: EntityNode[];
  list: (path: string[]) => Promise<void>;
  loading?: boolean;
  accept?: string;
  multiple?: boolean;
  onValueChange?: (nodes: EntityNode[]) => void;
  onValueCommit?: (nodes: EntityNode[]) => void;
}

export const FilePicker: React.FC<FilePickerProps> = ({
  title = "File Picker",
  nodes,
  list,
  loading,
  accept = "",
  multiple = false,
  onValueChange,
  onValueCommit,
}) => {
  const acceptArr = useMemo(
    () =>
      accept
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [accept]
  );
  return (
    <div className="w-80 border rounded-lg shadow-sm flex flex-col">
      <FilePickerProvider
        nodes={nodes}
        list={list}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
        multiple={multiple}
      >
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold mb-2">{title}</h2>
          <Breadcrumb />
        </div>
        <div className="min-h-40 max-h-96 overflow-y-auto p-2">
          <FileList accept={acceptArr} loading={loading} />
        </div>
        <Footer onValueCommit={onValueCommit} />
      </FilePickerProvider>
    </div>
  );
};

export { useFilePicker };
