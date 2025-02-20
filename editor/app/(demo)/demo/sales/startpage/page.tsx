import { Card, CardHeader } from "@/components/ui/card";
import Link from "next/link";

const demos = ["000", "001", "002", "003", "004", "005"];

export default function CampaignStartPageDevIndex() {
  return (
    <main className="container mx-auto px-4">
      <div className="py-10 flex flex-col gap-2">
        {demos.map((d) => {
          return (
            <Link key={d} href={"/demo/sales/startpage/" + d}>
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
