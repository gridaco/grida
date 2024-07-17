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
import { Tokens } from "@/ast";
import { Badge } from "@/components/ui/badge";
import { Factory } from "@/ast/factory";

export function StringValueControl({
  value,
  onValueChange,
  placeholder = "Value",
}: {
  value?: Tokens.StringValueExpression;
  onValueChange?: (value?: Tokens.StringValueExpression) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative group w-full">
      <Control
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="absolute opacity-0 group-hover:opacity-100 right-0 top-0 bottom-0 p-2 m-0.5 rounded flex items-center justify-center z-10">
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
          <DropdownMenuItem
            onSelect={() => {
              onValueChange?.(undefined);
            }}
          >
            <ReloadIcon className="me-2 w-4 h-4" />
            Reset
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Control({
  value,
  onValueChange,
  placeholder,
}: {
  value?: Tokens.StringValueExpression;
  onValueChange?: (value: Tokens.StringValueExpression) => void;
  placeholder?: string;
}) {
  if (Factory.isTemplateExpression(value)) {
    return <TemplateExpressionControl value={value} />;
  }

  return (
    <StringLiteralControl
      value={value as string}
      onValueChange={onValueChange}
      placeholder={placeholder}
    />
  );
}

function StringLiteralControl({
  value,
  onValueChange,
  placeholder,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      type="text"
      value={(value as string) || ""}
      placeholder={placeholder}
      onChange={(e) => onValueChange?.(e.target.value)}
      className={inputVariants({ size: "sm" })}
    />
  );
}

function TemplateExpressionControl({
  value,
}: {
  value: Tokens.TemplateExpression;
}) {
  return (
    <div className="flex h-8 max-w-full rounded-md border border-input bg-transparent py-1 text-sm shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50">
      <div className="px-1 flex max-w-full overflow-hidden space-x-1">
        {value.templateSpans.map((span, i) => {
          switch (span.kind) {
            case "StringLiteral":
              return <span key={i}>{span.value}</span>;
            case "Identifier":
              return (
                <Badge key={i} variant="secondary" className="font-mono">
                  {span.name}
                </Badge>
              );
            case "PropertyPathLiteral":
              return (
                <Badge key={i} variant="secondary" className="font-mono">
                  {span.path}
                </Badge>
              );
          }
        })}
      </div>
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
