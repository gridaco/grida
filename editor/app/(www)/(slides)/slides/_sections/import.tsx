import { SectionHeader, SectionHeaderBadge } from "@/www/ui/section";
import { Section } from "@/www/ui/section";
import { Badge } from "@/components/ui/badge";
import { FigmaIcon, FileCode2Icon } from "lucide-react";
import { BentoCard, BentoCardContent, BentoGrid } from "@/www/ui/bento-grid";

export default function Import() {
  return (
    <Section container className="py-20 md:py-28">
      <SectionHeader
        badge={<SectionHeaderBadge>Import</SectionHeaderBadge>}
        title="Import your slides."
        excerpt="Bring existing decks into a vector-native workflow without starting over."
      />
      <BentoGrid className="mt-10 md:mt-14 grid-cols-1 md:grid-cols-5 auto-rows-[20rem] md:auto-rows-[24rem]">
        <BentoCard
          name="Figma Slides"
          className="md:col-span-3"
          background={<DeckImportArtwork />}
          backgroundOrder={1}
        >
          <BentoCardContent
            name="Figma Slides"
            Icon={FigmaIcon}
            description="Drop your .deck file and continue with editable layers and slide objects on the same canvas."
            className="group-hover:-translate-y-0"
          />
          <div className="pointer-events-none absolute bottom-6 left-6">
            <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              .deck
            </code>
          </div>
        </BentoCard>

        <BentoCard
          name="HTML"
          className="md:col-span-2"
          background={<HtmlImportArtwork />}
          backgroundOrder={1}
        >
          <BentoCardContent
            name="HTML"
            Icon={FileCode2Icon}
            description="Paste HTML and transform it into editable slide content with real layout objects."
            className="group-hover:-translate-y-0"
          />
          <div className="pointer-events-none absolute bottom-6 left-6">
            <Badge
              variant="secondary"
              className="text-[10px] font-medium rounded-full"
            >
              Coming soon
            </Badge>
          </div>
        </BentoCard>
      </BentoGrid>
    </Section>
  );
}

function DeckImportArtwork() {
  return (
    <div className="h-44 md:h-56 border-b bg-gradient-to-br from-muted/40 to-background p-5 md:p-7">
      <div className="h-full flex items-center justify-center gap-4 md:gap-6">
        <div className="w-20 h-24 md:w-24 md:h-28 rounded-lg border bg-background shadow-sm flex items-center justify-center relative">
          <div className="absolute top-0 right-0 w-4 h-4 bg-muted border-l border-b rounded-bl-md" />
          <span className="text-[10px] font-mono text-muted-foreground">
            .deck
          </span>
        </div>
        <div className="w-8 md:w-10 h-px bg-foreground/20" />
        <div className="w-40 md:w-52 aspect-video rounded-lg border bg-background shadow-sm p-3">
          <div className="w-3/4 h-1 rounded-sm bg-foreground/15" />
          <div className="w-1/2 h-1 rounded-sm bg-foreground/10 mt-1.5" />
          <div className="w-full h-14 rounded-sm bg-foreground/[0.04] mt-2.5" />
        </div>
      </div>
    </div>
  );
}

function HtmlImportArtwork() {
  return (
    <div className="h-44 md:h-56 border-b bg-gradient-to-br from-muted/40 to-background p-5 md:p-7 flex items-center justify-center">
      <div className="w-full max-w-[300px] flex items-center gap-3 md:gap-4">
        <div className="rounded-lg border bg-background px-3 py-2 font-mono text-[10px] text-muted-foreground/70 leading-relaxed">
          <div>&lt;h1&gt;Q3&lt;/h1&gt;</div>
        </div>
        <div className="w-8 md:w-10 h-px bg-foreground/20 shrink-0" />
        <div className="flex-1 aspect-video rounded-lg border bg-background shadow-sm p-2.5">
          <div className="w-3/4 h-1 rounded-sm bg-foreground/15" />
          <div className="w-1/2 h-1 rounded-sm bg-foreground/10 mt-1.5" />
          <div className="w-full h-10 rounded-sm bg-foreground/[0.04] mt-2.5" />
        </div>
      </div>
    </div>
  );
}
