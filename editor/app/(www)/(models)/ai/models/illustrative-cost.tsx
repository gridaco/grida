import { ArrowUpRight } from "lucide-react";
import type { PublicIllustrativeCost } from "@/lib/gg/public-models/catalogue";
import { formatIllustrativeAmount } from "@/lib/gg/public-models/pricing";

export function IllustrativeCost({
  example,
  showProvenance = false,
}: {
  example: PublicIllustrativeCost;
  showProvenance?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="break-all font-mono text-sm font-medium tabular-nums text-foreground">
        {formatIllustrativeAmount(example.amount)}
      </p>
      <p className="text-xs leading-5">{example.scenario}</p>
      <p className="text-xs leading-5 text-muted-foreground">
        {example.coverage}
      </p>
      <p className="text-[11px] text-muted-foreground">
        Operation: <code className="break-all">{example.operation_id}</code>
      </p>
      {showProvenance ? (
        <details className="border-t pt-2 text-xs text-muted-foreground">
          <summary className="w-fit cursor-pointer hover:text-foreground">
            About this illustration
          </summary>
          <p className="mt-2 leading-5">{example.provenance.description}</p>
          <p className="mt-2">
            Maintained manually · Reviewed{" "}
            <time dateTime={example.provenance.reviewed_on}>
              {example.provenance.reviewed_on}
            </time>
          </p>
          {example.provenance.source_urls?.length ? (
            <ul className="mt-2 space-y-1" aria-label="Illustration sources">
              {example.provenance.source_urls.map((url, index) => (
                <li key={`${url}/${index}`}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground"
                  >
                    Source {index + 1}
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}
