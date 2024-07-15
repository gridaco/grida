import { Input } from "@/components/ui/input";
import { inputVariants } from "./utils/input-variants";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CalendarIcon,
  CookieIcon,
  DotIcon,
  ImageIcon,
  LockClosedIcon,
  ReloadIcon,
  ShuffleIcon,
  TextIcon,
  TokensIcon,
} from "@radix-ui/react-icons";
import { DropdownMenuItemIndicator } from "@radix-ui/react-dropdown-menu";

export function StringLiteralControl({
  value,
  onChangeValue,
  placeholder = "Value",
}: {
  value?: string;
  onChangeValue?: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative group w-full">
      <Input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChangeValue?.(e.target.value)}
        className={inputVariants({ size: "sm" })}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="absolute opacity-0 group-hover:opacity-100 right-0 top-0 bottom-0 p-2 flex items-center justify-center">
            <BoltIcon className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="bottom"
          className="max-w-sm overflow-hidden min-w-96"
        >
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <TokensIcon className="me-2 w-4 h-4" />
              Item (in list)
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="number" className="me-2 w-4 h-4" />
                  property.a
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="string" className="me-2 w-4 h-4" />
                  property.b
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="string" className="me-2 w-4 h-4" />
                  property.c
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="any" className="me-2 w-4 h-4" />
                  property.d
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <CookieIcon className="me-2 w-4 h-4" />
              Sample Data
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem>aa</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ShuffleIcon className="me-2 w-4 h-4" />
              Random
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="number" className="me-2 w-4 h-4" />
                  Random Number
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="number" className="me-2 w-4 h-4" />
                  Random Integer
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="date" className="me-2 w-4 h-4" />
                  Random Date
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="string" className="me-2 w-4 h-4" />
                  Random Title
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="string" className="me-2 w-4 h-4" />
                  Random Word
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="string" className="me-2 w-4 h-4" />
                  Random Paragraph
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <ImageIcon className="me-2 w-4 h-4" />
                  Random Image
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <LockClosedIcon className="me-2 w-4 h-4" />
              Constants
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="boolean" className="me-2 w-4 h-4" />
                  True
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="boolean" className="me-2 w-4 h-4" />
                  False
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="null" className="me-2 w-4 h-4" />
                  Null
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuItem>
            <ReloadIcon className="me-2 w-4 h-4" />
            Reset
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function PropertyTypeIcon({
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
