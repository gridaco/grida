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
    | "integer"
    | "object"
    | "array"
    | "boolean"
    | "string"
    | "number"
    | "date"
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
    | "$ref"
    | "const";
  className?: string;
}) {
  const props = {
    className,
  };

  switch (type) {
    case "string":
      return <TextIcon {...props} />;
    case "integer":
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
    case "$ref":
      return <DotIcon {...props} />;
    case "const":
      return <LockClosedIcon {...props} />;
    default:
      return <ImageIcon {...props} />;
  }
}
