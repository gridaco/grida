import {
  FlutterIcon,
  ReactIcon,
  Html5Icon,
  Css3Icon,
} from "@code-editor/module-icons";
import {
  FileIcon,
  CodeIcon,
  EnvelopeClosedIcon,
  EnvelopeOpenIcon,
} from "@radix-ui/react-icons";

export function FileModuleIcon({
  type,
  color = "white",
  size = 16,
}: {
  type:
    | "ts"
    | "tsx"
    | "js"
    | "jsx"
    | "dart"
    | "html"
    | "css"
    | "scss"
    | "directory-open"
    | "directory-closed"
    | string;
  color?: React.CSSProperties["color"];
  size?: number;
}) {
  const props = {
    color: color,
    width: size,
    height: size,
    size: size,
  };

  switch (type) {
    case "directory-open":
      return <EnvelopeOpenIcon {...props} />;
    case "directory-closed":
      return <EnvelopeClosedIcon {...props} />;
    case "application/typescriptreact":
    case "jsx":
    case "tsx":
      return <ReactIcon {...props} />;
    case "dart":
      return <FlutterIcon {...props} />;
    case "text/html":
    case "html":
      return <Html5Icon {...props} />;
    case "text/css":
    case "css":
    case "scss":
      return <Css3Icon {...props} />;
    case "application/javascript":
    case "js":
    case "application/typescript":
    case "ts":
      return <CodeIcon {...props} />;
    default:
      return <FileIcon {...props} />;
  }
}
