import { Card } from "@/components/ui/card";
import Playground from "@/scaffolds/playground";
import dynamic from "next/dynamic";

const Prompt = dynamic(() => import("@/app/(site)/ai/prompt"), {
  ssr: false,
});

export default function Demo() {
  return (
    <section>
      <Card className="mx-auto max-w-screen-xl aspect-video overflow-hidden">
        <iframe width="100%" height="100%" src="/playground" />
      </Card>
      <div className="mt-10">
        <Prompt />
      </div>
    </section>
  );
}
