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
import { tokens } from "@grida/tokens";
import { Badge } from "@/components/ui/badge";
import PropertyAccessDropdownMenu from "./context/variable";
import PropertyTypeIcon from "@/components/property-type-icon";
import { PropertyAccessExpressionControl } from "./props-property-access-expression";
import { useSchema } from "../schema";

export function StringValueControl({
  value,
  onValueChange,
  placeholder = "Value",
  maxlength,
  disabled,
}: {
  value?: tokens.StringValueExpression | null;
  onValueChange?: (value?: tokens.StringValueExpression) => void;
  placeholder?: string;
  maxlength?: number;
  disabled?: boolean;
}) {
  const schema = useSchema();
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
        maxLength={maxlength}
        disabled={disabled}
      />
      <DropdownMenu>
        <DropdownMenuTrigger disabled={disabled} asChild>
          <button
            disabled={disabled}
            className="absolute opacity-0 group-hover:opacity-100 right-0 top-0 bottom-0 p-2 m-0.5 rounded-sm flex items-center justify-center z-10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <BoltIcon className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="bottom"
          className="max-w-sm overflow-hidden min-w-96"
        >
          {schema && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PropertyTypeIcon type="object" className="size-4" />
                props
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  {tokens.is.propertyAccessExpression(value) && (
                    <PropertyAccessExpressionControl
                      value={value}
                      onValueChange={onValueChange}
                      schema={schema}
                    />
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          )}
          {/* TODO: */}
          {/* <PropertyAccessDropdownMenu
            asSubmenu
            // schema={schema}
            onSelect={(path) => {
              onValueChange?.(
                factory.createPropertyAccessExpression(path)
              );
            }}
          >
            <PropertyTypeIcon type="object" className="me-2 size-4" />
            Page
          </PropertyAccessDropdownMenu> */}
          {/* <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <TokensIcon className="me-2 size-4" />
              Item (in list)
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="number" className="me-2 size-4" />
                  property.a
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="string" className="me-2 size-4" />
                  property.b
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="string" className="me-2 size-4" />
                  property.c
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="any" className="me-2 size-4" />
                  property.d
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub> */}
          {/* <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <CookieIcon className="me-2 size-4" />
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
              <LockClosedIcon className="size-4" />
              Constants
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="boolean" className="size-4" />
                  True
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="boolean" className="size-4" />
                  False
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PropertyTypeIcon type="null" className="size-4" />
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
            <ReloadIcon className="size-4" />
            Reset
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              onValueChange?.("Text");
            }}
          >
            <InputIcon className="size-4" />
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
  maxLength,
  disabled,
}: {
  value?: tokens.StringValueExpression;
  onValueChange?: (value: tokens.StringValueExpression) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  if (tokens.is.templateExpression(value)) {
    return <TemplateExpressionValue value={value} />;
  } else if (tokens.is.propertyAccessExpression(value)) {
    return <PropertyAccessExpressionValue value={value} />;
  }

  return (
    <StringLiteralControl
      value={value as string}
      onValueChange={onValueChange}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
    />
  );
}

function StringLiteralControl({
  value,
  onValueChange,
  placeholder,
  maxLength,
  disabled,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <Input
      type="text"
      value={(value as string) || ""}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      onChange={(e) => onValueChange?.(e.target.value)}
      className={WorkbenchUI.inputVariants({ size: "xs" })}
    />
  );
}

function PropertyAccessExpressionValue({
  value,
}: {
  value: tokens.PropertyAccessExpression;
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

function TemplateExpressionValue({
  value,
}: {
  value: tokens.TemplateExpression;
}) {
  return (
    <div className="flex h-8 w-full rounded-md border border-input bg-transparent py-1 text-sm shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50">
      <div className="px-1 flex overflow-hidden gap-1">
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
