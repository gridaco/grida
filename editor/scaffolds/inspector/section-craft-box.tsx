import {
  PropertyGroup,
  PropertyGroupHeader,
  PropertyInput,
  PropertyLine,
  PropertyLines,
  PropertyNumericInput,
} from "@editor-ui/property";
import {
  PaddingIcon,
  MarginIcon,
  SpaceBetweenVerticallyIcon,
  SpaceBetweenHorizontallyIcon,
  ArrowRightIcon,
  ArrowDownIcon,
  SpaceEvenlyVerticallyIcon,
} from "@radix-ui/react-icons";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useDispatch } from "core/dispatch";
import { useInspectorElement } from "hooks/use-inspector-element";
import { useCallback } from "react";

export function CraftBoxLayoutSection() {
  const dispatch = useDispatch();
  const element = useInspectorElement();

  // flex
  // padding
  // margin
  // direction
  // wrap
  // gap vertical
  // gap horizontal

  const onDirectionChange = useCallback(
    (direction: "column" | "row") => {
      dispatch({
        type: "(craft)/node/flex/direction",
        direction,
      });
    },
    [dispatch]
  );

  const onGapChange = useCallback(
    (gap: number) => {
      dispatch({
        type: "(craft)/node/flex/gap",
        gap,
      });
    },
    [dispatch]
  );

  if (!element || !element.style) {
    return <></>;
  }

  const { flexDirection, gap } = element.style;

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Layout</h6>
      </PropertyGroupHeader>
      <PropertyLines>
        <PropertyLine label="Direction">
          <ToggleGroup.Root
            className="flex gap-2"
            type="single"
            defaultValue="col"
            aria-label="display"
            value={flexDirection}
            onValueChange={onDirectionChange}
          >
            <ToggleGroup.Item
              className="p-2 rounded-md data-[state='on']:bg-white/20"
              value="row"
              aria-label="Row"
            >
              <ArrowRightIcon />
            </ToggleGroup.Item>
            <ToggleGroup.Item
              className="p-2 rounded-md data-[state='on']:bg-white/20"
              value="column"
              aria-label="Column"
            >
              <ArrowDownIcon />
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </PropertyLine>
        <PropertyLine label="Gap">
          <PropertyNumericInput
            stopPropagation
            value={gap}
            onChange={onGapChange}
            prefix={<GapIcon direction={flexDirection as any} />}
          />
        </PropertyLine>
        <PropertyLine label="Padding">
          <PropertyNumericInput prefix={<PaddingIcon />} />
        </PropertyLine>
        <PropertyLine label="Margin">
          <PropertyNumericInput prefix={<MarginIcon />} />
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
  );
}

function GapIcon({ direction }: { direction?: "column" | "row" }) {
  switch (direction) {
    case "column":
      return <SpaceEvenlyVerticallyIcon />;
    case "row":
      return <SpaceBetweenHorizontallyIcon />;
    default:
      return <SpaceBetweenHorizontallyIcon />;
  }
}
