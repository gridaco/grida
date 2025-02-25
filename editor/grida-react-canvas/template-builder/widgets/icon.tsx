import * as RadixIcons from "@radix-ui/react-icons";

type IconWidgetProps =
  | {
      repository: "radix-ui/icons";
      name: keyof typeof RadixIcons;
    }
  | {
      repository:
        | "tailwindlabs/heroicons"
        | "google/material-design-icons"
        | "lucide-icons/lucide";
      name: string;
    };

export function IconWidget({ repository, name }: IconWidgetProps) {
  switch (repository) {
    case "radix-ui/icons":
      return <RadixIconWidget name={name} />;
    case "tailwindlabs/heroicons":
      return <HeroIconWidget />;
    case "google/material-design-icons":
      return <MaterialIconWidget />;
    case "lucide-icons/lucide":
      return <LucideIconWidget />;
  }
}

function RadixIconWidget({ name }: { name: keyof typeof RadixIcons }) {
  const Component = RadixIcons[name];
  if (Component) return <Component />;
  return <></>;
}

function HeroIconWidget() {
  return <></>;
}

function MaterialIconWidget() {
  return <></>;
}

function LucideIconWidget() {
  return <></>;
}
