"use client";

import type { ReactNode } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@app/ui/components/tabs";
import styles from "../page.module.css";

export interface ShowcaseItem {
  value: string;
  label: string;
  body: ReactNode;
  footer: string[];
}

export default function Showcase({ items }: { items: ShowcaseItem[] }) {
  return (
    <Tabs defaultValue={items[0]?.value} className={styles.showcase}>
      <TabsList aria-label="Gateway examples" className={styles.tabs}>
        {items.map(({ value, label }) => (
          <TabsTrigger key={value} value={value}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map(({ value, body, footer }) => (
        // mounted for every tab so all panels are server-rendered (crawlable);
        // inactive ones are only hidden
        <TabsContent
          key={value}
          value={value}
          forceMount
          className="data-[state=inactive]:hidden"
        >
          {body}
          <div className={styles.diagramFooter}>
            {footer.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
