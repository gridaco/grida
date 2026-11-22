import type { ComponentProps, ComponentType } from "react";
import { GG_PROVIDER_ID, OPENAI_PROJECT_PROVIDER_ID } from "@grida/ai-host";
import type { ByokProviderId } from "@/lib/desktop/bridge";
import {
  AlibabaCloudLogo,
  BlackForestLabsLogo,
  ByteDanceLogo,
  ElevenLabsLogo,
  TripoLogo,
  FalLogo,
  GoogleLogo,
  GridaLogo,
  MetaLogo,
  MicrosoftLogo,
  OpenAILogo,
  OpenRouterLogo,
  RecraftLogo,
  SpaceXAILogo,
  TencentLogo,
  VercelLogo,
} from "@grida/react-icons/logos";

type ProviderLogoId = ByokProviderId | typeof GG_PROVIDER_ID;

export const BYOK_PROVIDER_LOGOS: Partial<
  Record<ProviderLogoId, ComponentType<ComponentProps<"svg">>>
> = {
  [OPENAI_PROJECT_PROVIDER_ID]: OpenAILogo,
  [GG_PROVIDER_ID]: GridaLogo,
  openrouter: OpenRouterLogo,
  vercel: VercelLogo,
  fal: FalLogo,
  elevenlabs: ElevenLabsLogo,
  tripo: TripoLogo,
};

const MODEL_VENDOR_LOGOS: Partial<
  Record<string, ComponentType<ComponentProps<"svg">>>
> = {
  alibaba: AlibabaCloudLogo,
  openai: OpenAILogo,
  "recraft-ai": RecraftLogo,
  google: GoogleLogo,
  "black-forest-labs": BlackForestLabsLogo,
  bytedance: ByteDanceLogo,
  meta: MetaLogo,
  elevenlabs: ElevenLabsLogo,
  tripo: TripoLogo,
  microsoft: MicrosoftLogo,
  tencent: TencentLogo,
  xai: SpaceXAILogo,
};

export function ModelVendorLogo({ vendor }: { vendor: string }) {
  const Logo = Object.hasOwn(MODEL_VENDOR_LOGOS, vendor)
    ? MODEL_VENDOR_LOGOS[vendor]
    : undefined;
  if (!Logo) {
    return (
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded border bg-muted text-[10px] font-medium uppercase text-muted-foreground"
      >
        {vendor.slice(0, 1)}
      </span>
    );
  }

  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded border bg-background"
      aria-hidden="true"
    >
      <Logo focusable="false" className="size-5 text-foreground" />
    </span>
  );
}

export function ProviderLogos({
  providerIds,
}: {
  providerIds: readonly ProviderLogoId[];
}) {
  return (
    <div className="flex shrink-0 -space-x-1" aria-hidden="true">
      {providerIds.map((id) => {
        const Logo = BYOK_PROVIDER_LOGOS[id];
        if (!Logo) return null;
        return (
          <span
            key={id}
            className="flex size-5 items-center justify-center rounded border bg-background ring-1 ring-background"
          >
            <Logo focusable="false" className="size-3.5 text-foreground" />
          </span>
        );
      })}
    </div>
  );
}
