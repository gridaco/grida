import {
  AsteriskSquareIcon,
  BoltIcon,
  BracesIcon,
  BracketsIcon,
  CircleOffIcon,
  FileQuestionIcon,
  HashIcon,
  SquareFunctionIcon,
} from "lucide-react";

import {
  CalendarIcon,
  CookieIcon,
  DotIcon,
  ImageIcon,
  LockClosedIcon,
  TextIcon,
} from "@radix-ui/react-icons";

export default function PropertyTypeIcon({
  type,
  className,
}: {
  type:
    | "string"
    | "number"
    | "boolean"
    | "date"
    | "object"
    | "array"
    | "null"
    | "undefined"
    | "function"
    | "symbol"
    | "bigint"
    | "any"
    | "unknown"
    | "never"
    | "void"
    | "this"
    | "const"
    | "object";
  className?: string;
}) {
  const props = {
    className,
  };

  switch (type) {
    case "string":
      return <TextIcon {...props} />;
    case "number":
    case "bigint":
      return <HashIcon {...props} />;
    case "boolean":
      return <LockClosedIcon {...props} />;
    case "object":
      return <BracesIcon {...props} />;
    case "array":
      return <BracketsIcon {...props} />;
    case "date":
      return <CalendarIcon {...props} />;
    case "null":
    case "undefined":
    case "never":
    case "void":
      return <CircleOffIcon {...props} />;
    case "function":
      return <SquareFunctionIcon {...props} />;
    case "symbol":
      return <LockClosedIcon {...props} />;
    case "any":
      return <AsteriskSquareIcon {...props} />;
    case "unknown":
      return <FileQuestionIcon {...props} />;
    case "this":
      return <DotIcon {...props} />;
    case "const":
      return <LockClosedIcon {...props} />;
    default:
      return <ImageIcon {...props} />;
  }
}
