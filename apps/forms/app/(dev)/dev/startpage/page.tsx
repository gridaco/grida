import { Card, CardHeader } from "@/components/ui/card";
import Link from "next/link";

const demos = ["000", "001"];

export default function CampaignStartPageDevIndex() {
  return (
    <main className="container mx-auto px-4">
      <div className="py-10 flex flex-col gap-2">
        {demos.map((d) => {
          return (
            <Link key={d} href={"/dev/startpage/" + d}>
              <Card>
                <CardHeader>Demo - {d}</CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
