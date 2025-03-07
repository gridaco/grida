import React from "react";
import Footer from "@/www/footer";
import Header from "@/www/header";
import { Button } from "@/components/ui/button";
import { Apple } from "@/components/logos/apple";
import { Windows } from "@/components/logos/windows";
import { DownloadIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { sitemap } from "@/www/data/sitemap";
import type { Metadata } from "next";
import { AppleIcon } from "lucide-react";
import { motion } from "framer-motion";

export const metadata: Metadata = {
  title: "Downloads",
  description: "Download Grida",
};

export default function DownloadsPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      {/* <motion.div
        initial={{ opacity: 0, y: 50 }}
        viewport={{ once: true }}
        whileInView={{ opacity: 1, y: 20 }}
        transition={{ duration: 5, ease: "easeOut" }}
        className="absolute -z-10 inset-0 flex items-center justify-center"
      >
        <HeroBackground />
      </motion.div> */}
      <div className="h-60" />
      <main className="flex-grow flex items-center">
        <section className="container max-w-2xl mx-auto py-20 text-center border rounded-lg">
          <h1 className="text-6xl font-bold mb-6">
            Download Grida Desktop app
          </h1>
          <p className="text-base text-muted-foreground mb-12">
            Optimized for macOS. Download now and start creating effortlessly.
          </p>
          <div className="flex justify-center space-x-4">
            <Link href={sitemap.links.releases_latest}>
              <Button size="lg">
                <Apple className="mr-2 h-4 w-4" /> Download for macOS
              </Button>
            </Link>
            {/* <Link href={sitemap.links.releases_latest}>
              <Button size="lg">
                <DownloadIcon className="mr-2 h-4 w-4" /> Download for Windows
              </Button>
            </Link> */}
            {/* <Link href={sitemap.links.releases_latest}>
              <Button size="lg" >
                <DownloadIcon className="mr-2 h-4 w-4" /> Download for Linux
              </Button>
            </Link> */}
          </div>
          <div className="mt-2"></div>
        </section>
      </main>
      <div className="h-32" />
      <div className="container w-full items-center">
        <h1 className="text-center text-3xl font-semibold mb-6">
          Get Grida for Windows & more
        </h1>
        <p className="text-center text-base text-muted-foreground mb-12">
          A faster, more focused experience awaits.
        </p>
        <DownloadButtons />
      </div>
      <div className="h-96" />
      <Footer />
    </main>
  );
}

function DownloadButtons() {
  return (
    <div className="container flex flex-wrap justify-center gap-3 mx-auto">
      {/* macOS Universal */}
      <Link href={sitemap.links.releases_latest}>
        <Button size="lg">
          <Apple className="mr-2 h-4 w-4" /> Download for macOS (Universal)
        </Button>
      </Link>

      {/* macOS Apple Silicon */}
      <Link href={sitemap.links.releases_latest}>
        <Button size="lg">
          <Apple className="mr-2 h-4 w-4" /> Download for macOS (Apple Silicon)
        </Button>
      </Link>

      {/* macOS Intel */}
      <Link href={sitemap.links.releases_latest}>
        <Button size="lg">
          <Apple className="mr-2 h-4 w-4" /> Download for macOS (Intel-based
          Macs)
        </Button>
      </Link>

      {/* Windows x64 */}
      <Link href={sitemap.links.releases_latest}>
        <Button size="lg">
          <Windows className="mr-2 h-3 w-3" /> Download for Windows (x64)
        </Button>
      </Link>

      {/* Windows ARM */}
      <Link href={sitemap.links.releases_latest}>
        <Button size="lg">
          <Windows className="mr-2 h-3 w-3" /> Download for Windows (Arm /
          Arm64)
        </Button>
      </Link>

      {/* Windows Debian */}
      <Link href={sitemap.links.releases_latest}>
        <Button size="lg">
          <Windows className="mr-2 h-3 w-3" /> Download for Linux (Debian /
          Ubuntu)
        </Button>
      </Link>

      {/* Windows Red Hat */}
      <Link href={sitemap.links.releases_latest}>
        <Button size="lg">
          <Windows className="mr-2 h-3 w-3" /> Download for Linux (Red Hat /
          Fedora / SUSE)
        </Button>
      </Link>
    </div>
  );
}

// export function HeroBackground() {
//   const path =
//     "M6.1912 307.719C-28.0369 229.284 87.9827 154.311 150.271 126.63C322.143 -54.4597 724.031 9.92764 929.546 16.1469C1135.06 22.3661 990.981 163.214 1119.7 329.304C1248.42 495.394 1006.34 581 960.263 669.898C914.187 758.797 589.093 602.218 494.015 669.898C398.937 737.578 168.555 623.803 171.847 470.517C175.138 317.231 48.9763 405.764 6.1912 307.719Z";
//   return (
//     <div className="absolute -top-40">
//       <svg
//         width={"1157"}
//         height="698"
//         viewBox="0 0 1157 698"
//         fill="none"
//         xmlns="http://www.w3.org/2000/svg"
//         className="overflow-visible [--gradient:url(#light)] dark:[--gradient:url(#dark)]"
//       >
//         <filter id="blur" x="-50%" y="-50%" width="300%" height="300%">
//           <feGaussianBlur in="SourceGraphic" stdDeviation="200" />
//         </filter>
//         <defs>
//           <radialGradient
//             id="light"
//             cx="0"
//             cy="0"
//             r="1"
//             gradientUnits="userSpaceOnUse"
//             gradientTransform="translate(579 236) rotate(85) scale(522 865)"
//           >
//             <stop stopColor="#CDBAFF" />
//             <stop stopColor="#A06EFF" stopOpacity="1" />
//             <stop offset="0.36" stopColor="#8298FF" stopOpacity="1" />{" "}
//             <stop offset="0.61" stopColor="#60CFFF" stopOpacity="0.9" />{" "}
//             <stop offset="1" stopColor="#9EF3E8" stopOpacity="0.8" />{" "}
//           </radialGradient>
//           <radialGradient
//             id="dark"
//             cx="0"
//             cy="0"
//             r="1"
//             gradientUnits="userSpaceOnUse"
//             gradientTransform="translate(579 236) rotate(85) scale(522 865)"
//           >
//             <stop stopColor="#4F3791" />
//             <stop offset="0.36" stopColor="#425397" />
//             <stop offset="0.61" stopColor="#3383A0" />
//             <stop offset="1" stopColor="#34D7C4" />
//           </radialGradient>
//         </defs>
//         <path d={path} fill="var(--gradient)" filter="url(#blur)" />
//       </svg>
//     </div>
//   );
// }
