import {
  PropertyGroup,
  PropertyGroupHeader,
  PropertyInput,
  PropertyInputToggleGroup,
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

  const onPaddingChange = useCallback(
    (padding: number) => {
      dispatch({
        type: "(craft)/node/box/padding",
        padding,
      });
    },
    [dispatch]
  );

  const onMarginChange = useCallback(
    (margin: number) => {
      dispatch({
        type: "(craft)/node/box/margin",
        margin,
      });
    },
    [dispatch]
  );

  if (!element || !element.style) {
    return <></>;
  }

  const { flexDirection, gap, padding, margin } = element.style;

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Layout</h6>
      </PropertyGroupHeader>
      <PropertyLines>
        <PropertyLine label="Direction">
          <PropertyInputToggleGroup
            defaultValue="row"
            value={flexDirection}
            onValueChange={onDirectionChange}
            options={[
              {
                value: "row",
                icon: <ArrowRightIcon />,
              },
              {
                value: "column",
                icon: <ArrowDownIcon />,
              },
            ]}
          />
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
          <PropertyNumericInput
            stopPropagation
            value={padding ?? 0}
            onChange={onPaddingChange}
            prefix={<PaddingIcon />}
          />
        </PropertyLine>
        <PropertyLine label="Margin">
          <PropertyNumericInput
            stopPropagation
            value={padding ?? 0}
            onChange={onMarginChange}
            prefix={<MarginIcon />}
          />
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
