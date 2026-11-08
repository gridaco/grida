import type { ComponentType } from "react";
import {
  AlibabaCloudLogo,
  AnthropicLogo,
  BlackForestLabsLogo,
  ByteDanceLogo,
  GoogleLogo,
  IdeogramLogo,
  MetaLogo,
  MicrosoftLogo,
  MiniMaxLogo,
  OpenAILogo,
  RecraftLogo,
  SpaceXAILogo,
  TencentLogo,
  TripoLogo,
} from "@grida/react-icons/logos";
import type { PublicModel } from "@/lib/gg/public-models/catalogue";

const labLogos: Partial<Record<string, ComponentType<{ className?: string }>>> =
  {
    alibaba: AlibabaCloudLogo,
    anthropic: AnthropicLogo,
    "black-forest-labs": BlackForestLabsLogo,
    bytedance: ByteDanceLogo,
    google: GoogleLogo,
    ideogram: IdeogramLogo,
    meta: MetaLogo,
    microsoft: MicrosoftLogo,
    minimax: MiniMaxLogo,
    openai: OpenAILogo,
    "recraft-ai": RecraftLogo,
    tencent: TencentLogo,
    tripo: TripoLogo,
    xai: SpaceXAILogo,
  };

export function LabLogo({ lab }: { lab: PublicModel["gg"]["card"]["lab"] }) {
  const Logo = Object.hasOwn(labLogos, lab.id) ? labLogos[lab.id] : undefined;
  return (
    <span
      aria-hidden="true"
      title={lab.name}
      className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background"
    >
      {Logo ? (
        <Logo className="size-5" />
      ) : (
        <span className="text-xs font-medium text-muted-foreground">
          {lab.name.slice(0, 1)}
        </span>
      )}
    </span>
  );
}
