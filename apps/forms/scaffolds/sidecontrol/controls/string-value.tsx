import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";
import { BoltIcon } from "lucide-react";
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
  InputIcon,
  LockClosedIcon,
  ReloadIcon,
  TokensIcon,
} from "@radix-ui/react-icons";
import { Tokens } from "@/ast";
import { Badge } from "@/components/ui/badge";
import { Factory } from "@/ast/factory";
import PropertyAccessDropdownMenu from "./context/variable";
import PropertyTypeIcon from "@/components/property-type-icon";

export function StringValueControl({
  value,
  onValueChange,
  placeholder = "Value",
  disabled,
}: {
  value?: Tokens.StringValueExpression | null;
  onValueChange?: (value?: Tokens.StringValueExpression) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  // const schema = useMemo(
  //   () =>
  //     selected_node_context
  //       ? inferSchemaFromData(selected_node_context)
  //       : undefined,
  //   [selected_node_context]
  // );

  return (
    <div className="relative group w-full">
      <Control
        value={value ?? undefined}
        onValueChange={onValueChange}
        placeholder={placeholder}
        disabled={disabled}
      />
      <DropdownMenu>
        <DropdownMenuTrigger disabled={disabled} asChild>
          <button
            disabled={disabled}
            className="absolute opacity-0 group-hover:opacity-100 right-0 top-0 bottom-0 p-2 m-0.5 rounded flex items-center justify-center z-10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <BoltIcon className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="bottom"
          className="max-w-sm overflow-hidden min-w-96"
        >
          {/* TODO: */}
          <PropertyAccessDropdownMenu
            asSubmenu
            // schema={schema}
            onSelect={(path) => {
              onValueChange?.(Factory.createPropertyAccessExpression(path));
            }}
          >
            <PropertyTypeIcon type="object" className="me-2 w-4 h-4" />
            Page
          </PropertyAccessDropdownMenu>
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
          {/* <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <CookieIcon className="me-2 w-4 h-4" />
              Sample Data
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem>aa</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub> */}
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
          <DropdownMenuItem
            onSelect={() => {
              onValueChange?.("Text");
            }}
          >
            <InputIcon className="me-2 w-4 h-4" />
            Type Manually
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
//

function Control({
  value,
  onValueChange,
  placeholder,
  disabled,
}: {
  value?: Tokens.StringValueExpression;
  onValueChange?: (value: Tokens.StringValueExpression) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  if (Tokens.is.templateExpression(value)) {
    return <TemplateExpressionControl value={value} />;
  } else if (Tokens.is.propertyAccessExpression(value)) {
    return <PropertyAccessExpressionControl value={value} />;
  }

  return (
    <StringLiteralControl
      value={value as string}
      onValueChange={onValueChange}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

function StringLiteralControl({
  value,
  onValueChange,
  placeholder,
  disabled,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Input
      type="text"
      value={(value as string) || ""}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
      className={WorkbenchUI.inputVariants({ size: "sm" })}
    />
  );
}

function PropertyAccessExpressionControl({
  value,
}: {
  value: Tokens.PropertyAccessExpression;
}) {
  return (
    <div className="flex px-1 h-8 w-full rounded-md border border-input bg-transparent py-1 text-sm shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50">
      <Badge
        variant="secondary"
        className="font-mono overflow-hidden text-ellipsis"
      >
        {value.expression.join(".")}
      </Badge>
    </div>
  );
}

function TemplateExpressionControl({
  value,
}: {
  value: Tokens.TemplateExpression;
}) {
  return (
    <div className="flex h-8 w-full rounded-md border border-input bg-transparent py-1 text-sm shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50">
      <div className="px-1 flex overflow-hidden space-x-1">
        {value.templateSpans.map((span, i) => {
          switch (span.kind) {
            case "StringLiteral":
              return <span key={i}>{span.text}</span>;
            case "Identifier":
              return (
                <Badge key={i} variant="secondary" className="font-mono">
                  {span.name}
                </Badge>
              );
            case "PropertyAccessExpression":
              return (
                <Badge key={i} variant="secondary" className="font-mono">
                  {span.expression.join(".")}
                </Badge>
              );
          }
        })}
      </div>
    </div>
  );
}
