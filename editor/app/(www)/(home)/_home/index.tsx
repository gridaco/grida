import Header from "@/www/header";
import Footer from "@/www/footer";
import VerticalTabs from "@/www/vertical-tabs";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { downloads } from "../../(downloads)/downloads/downloads";
import { PrimaryDownloadButton } from "../../(downloads)/downloads/download-button";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CheckIcon,
  FolderOpenIcon,
  KeyRoundIcon,
  ShieldCheckIcon,
  TerminalIcon,
} from "lucide-react";
import { sitemap } from "@/www/data/sitemap";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@app/ui/components/tabs";
import {
  BlenderLogo,
  UnrealEngineLogo,
  GodotLogo,
  UnityLogo,
  GoogleLogo,
  OpenAILogo,
  BlackForestLabsLogo,
  ByteDanceLogo,
  ClaudeLogo,
  GridaLogo,
  OllamaLogo,
  OpenRouterLogo,
  VercelLogo,
} from "@grida/react-icons/logos";

export default async function HomePage() {
  const headersList = await headers();
  const os = downloads.getDesktopOS(headersList.get("user-agent") ?? "");
  const links = os ? await downloads.getLinksForPage(os) : null;
  const downloadButtonProps = {
    os,
    defaultUrl: links?.default?.url ?? null,
    macX64Url: links?.mac_dmg_x64 ?? null,
    fallbackUrl: sitemap.items.downloads.href,
    fallbackLabel: "Download for desktop",
    showShortcut: false,
  };
  const workflows = [
    {
      id: "campaigns",
      category: "content",
      label: "Campaigns",
      title: "Campaign variations",
      image: "/www/grida-fx-content-campaigns-placeholder.png",
      alt: "Grida FX concept showing coordinated campaign artwork and the workflow behind it",
      caption: "Carry one visual direction across a campaign.",
    },
    {
      id: "products",
      category: "content",
      label: "Product imagery",
      title: "Product scenes",
      image: "/www/grida-fx-content-products-placeholder.png",
      alt: "Grida FX concept showing one product in three scenes with a connected image workflow",
      caption:
        "Explore different scenes, lighting, and compositions for the same product.",
    },
    {
      id: "video",
      category: "content",
      label: "Video",
      title: "Storyboard to shots",
      image: "/www/grida-fx-content-video-placeholder.png",
      alt: "Grida FX concept showing a coastal road storyboard developed into three cinematic frames",
      caption: "Develop a storyboard into a sequence of shots.",
    },
    {
      id: "sprites",
      category: "game",
      label: "Sprite sheets",
      title: "Character to sprite sheet",
      image: "/www/grida-fx-sprites-placeholder.png",
      alt: "Grida FX sprite sheet workflow preview",
    },
    {
      id: "materials",
      category: "game",
      label: "Materials",
      title: "Reference to material",
      image: "/www/grida-fx-materials-placeholder.png",
      alt: "Grida FX texture and material workflow preview",
    },
    {
      id: "assets",
      category: "game",
      label: "3D assets",
      title: "Reference to 3D asset",
      image: "/www/grida-fx-assets-placeholder.png",
      alt: "Grida FX 3D asset workflow preview",
    },
  ];

  return (
    <main className="min-h-screen [&_img]:select-none [&_img]:[-webkit-user-drag:none] [&_svg]:select-none [&_svg]:[-webkit-user-drag:none]">
      <Header />
      <section className="container mx-auto flex flex-col items-center px-4 pt-40 pb-16 text-center md:pt-48 lg:px-24">
        <h1 className="max-w-6xl text-balance text-[3.5rem] leading-[1.05] font-bold tracking-tight md:text-7xl lg:text-8xl">
          A canvas for everything
          <span className="block">you want to create.</span>
        </h1>
        <PrimaryDownloadButton
          {...downloadButtonProps}
          className="mt-16 h-12 rounded-full px-6 text-base has-[>svg]:px-6"
        />
      </section>
      <div className="mx-auto max-w-6xl px-4 pb-24 md:px-8">
        {/* Replace this concept image with a real desktop screenshot later. */}
        <Image
          draggable={false}
          src="/www/grida-desktop-ui-placeholder.png"
          alt="Grida Desktop concept preview with a design canvas, project files, and AI assistant"
          width={1586}
          height={992}
          sizes="(max-width: 1152px) 100vw, 1088px"
          className="h-auto w-full rounded-2xl md:rounded-3xl"
        />
      </div>
      <section
        aria-labelledby="work-heading"
        className="mx-auto max-w-6xl px-4 pb-32 md:px-8 md:pb-48"
      >
        <div className="mb-10 flex max-w-2xl flex-col gap-6">
          <h2
            id="work-heading"
            className="text-6xl font-semibold tracking-tight md:text-7xl lg:text-8xl"
          >
            Work
          </h2>
          <p className="text-lg leading-relaxed text-muted-foreground md:text-xl">
            Present your ideas, collect responses, and organize your data.
          </p>
        </div>
        <VerticalTabs
          defaultValue="slides"
          label="Work tools"
          items={[
            {
              value: "slides",
              title: "Slides",
              description:
                "Design slides for your next meeting, pitch, or project.",
              action: (
                <Link
                  href={sitemap.items.slides.href}
                  className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full bg-muted px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:self-auto"
                >
                  Explore slides
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </Link>
              ),
            },
            {
              value: "forms",
              title: "Forms",
              description:
                "Build forms to collect feedback, inquiries, and applications.",
              action: (
                <Link
                  href={sitemap.items.forms.href}
                  className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full bg-muted px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:self-auto"
                >
                  Explore Grida Forms
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </Link>
              ),
            },
            {
              value: "database",
              title: "Database",
              description:
                "Organize, filter, and explore your data in a visual workspace.",
              action: (
                <Link
                  href={sitemap.items.database.href}
                  className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full bg-muted px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:self-auto"
                >
                  Explore Grida Database
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </Link>
              ),
            },
          ]}
        >
          <TabsContent value="slides">
            <Image
              draggable={false}
              src="/www/grida-work-placeholder.png"
              alt="Slide canvas concept with editable slides"
              width={1536}
              height={1024}
              sizes="(max-width: 768px) 100vw, 700px"
              className="h-auto w-full rounded-2xl md:rounded-3xl"
            />
          </TabsContent>
          <TabsContent value="forms">
            <div
              role="img"
              aria-label="Example project inquiry form with name, email, and project details fields"
              className="flex min-h-[440px] select-none items-center justify-center rounded-2xl bg-muted/40 px-6 py-10 md:aspect-[3/2] md:rounded-3xl md:px-12 md:py-16"
            >
              <div aria-hidden="true" className="w-full max-w-md">
                <GridaLogo className="mb-6 size-6 md:mb-8 md:size-8" />
                <p className="text-2xl font-semibold tracking-tight md:text-4xl">
                  Let’s work together.
                </p>
                <p className="mt-3 text-sm text-muted-foreground md:text-base">
                  Tell us about your project.
                </p>
                <div className="mt-8 grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-medium md:text-sm">Name</p>
                    <div className="rounded-xl bg-background px-4 py-3 text-xs text-muted-foreground md:text-sm">
                      Your name
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium md:text-sm">Email</p>
                    <div className="rounded-xl bg-background px-4 py-3 text-xs text-muted-foreground md:text-sm">
                      you@example.com
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="mb-2 text-xs font-medium md:text-sm">
                      Project details
                    </p>
                    <div className="min-h-24 rounded-xl bg-background px-4 py-3 text-xs text-muted-foreground md:min-h-32 md:text-sm">
                      What are you working on?
                    </div>
                  </div>
                </div>
                <span className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-xs font-medium text-primary-foreground md:text-sm">
                  Send inquiry
                </span>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="database">
            <Image
              draggable={false}
              src="/www/.database/1.png"
              alt="Grida Database interface filtering records and visualizing data as a chart"
              width={1320}
              height={792}
              sizes="(max-width: 768px) 100vw, 700px"
              className="h-auto w-full rounded-2xl md:rounded-3xl"
            />
          </TabsContent>
        </VerticalTabs>
      </section>
      <section
        aria-labelledby="design-heading"
        className="mx-auto max-w-6xl px-4 pb-32 md:px-8 md:pb-48"
      >
        <div className="mb-10 flex max-w-2xl flex-col gap-6">
          <h2
            id="design-heading"
            className="text-6xl font-semibold tracking-tight md:text-7xl lg:text-8xl"
          >
            Design
          </h2>
          <p className="text-lg leading-relaxed text-muted-foreground md:text-xl">
            Collect references, explore layouts, and develop your ideas on an
            open canvas.
          </p>
        </div>
        <Image
          draggable={false}
          src="/www/grida-design-placeholder.png"
          alt="Design canvas concept with a moodboard and vector artwork"
          width={1536}
          height={1024}
          sizes="(max-width: 1152px) 100vw, 1088px"
          className="h-auto w-full rounded-2xl md:rounded-3xl"
        />
      </section>
      <section
        aria-labelledby="content-heading"
        className="mx-auto max-w-6xl px-4 pb-32 md:px-8 md:pb-48"
      >
        <div className="mb-10 flex max-w-2xl flex-col gap-6">
          <h2
            id="content-heading"
            className="text-6xl font-semibold tracking-tight md:text-7xl lg:text-8xl"
          >
            Content
          </h2>
          <div>
            <p className="text-lg leading-relaxed text-muted-foreground md:text-xl">
              Create campaign visuals, product imagery, and video with Grida FX.
            </p>
            {/* Enable the /fx link when its marketing page is ready. */}
            <button
              type="button"
              disabled
              className="mt-4 inline-flex items-center justify-center rounded-full bg-muted px-5 py-2.5 text-sm font-medium"
            >
              Explore Grida FX
            </button>
          </div>
        </div>
        <Tabs defaultValue="campaigns" className="gap-4">
          <TabsList
            aria-label="Content examples"
            className="gap-1 rounded-none bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto sm:gap-2"
          >
            {workflows
              .filter((workflow) => workflow.category === "content")
              .map((workflow) => (
                <TabsTrigger
                  key={workflow.id}
                  value={workflow.id}
                  className="h-auto flex-none rounded-full border-0 bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none sm:px-5 sm:text-sm"
                >
                  {workflow.label}
                </TabsTrigger>
              ))}
          </TabsList>
          {workflows
            .filter((workflow) => workflow.category === "content")
            .map((workflow) => (
              <TabsContent key={workflow.id} value={workflow.id}>
                <figure>
                  <div className="relative aspect-[3/2] overflow-hidden rounded-2xl bg-muted md:rounded-3xl">
                    <Image
                      draggable={false}
                      src={workflow.image}
                      alt={workflow.alt}
                      fill
                      sizes="(max-width: 1152px) 100vw, 1088px"
                      className="object-contain"
                    />
                  </div>
                  <figcaption className="mt-5 text-center text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {workflow.caption}
                  </figcaption>
                </figure>
              </TabsContent>
            ))}
        </Tabs>
      </section>
      <section
        aria-labelledby="game-heading"
        data-theme="dark"
        className="dark mb-32 bg-background py-24 text-foreground [color-scheme:dark] md:mb-48 md:py-32"
      >
        {/* Local theme boundary; scroll-driven theme changes can target this section. */}
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mb-10 flex max-w-2xl flex-col gap-6">
            <h2
              id="game-heading"
              className="text-6xl font-semibold tracking-tight md:text-7xl lg:text-8xl"
            >
              Game
            </h2>
            <div>
              <p className="text-lg leading-relaxed text-muted-foreground md:text-xl">
                Create sprite sheets, materials, and 3D assets with Grida FX.
              </p>
              {/* Enable the /fx link when its marketing page is ready. */}
              <button
                type="button"
                disabled
                className="mt-4 inline-flex items-center justify-center rounded-full bg-muted px-5 py-2.5 text-sm font-medium"
              >
                Explore Grida FX
              </button>
            </div>
          </div>
          <Tabs defaultValue="sprites" className="gap-4">
            <div className="flex justify-start">
              <TabsList
                aria-label="Game examples"
                className="gap-1 rounded-none bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto sm:gap-2"
              >
                <TabsTrigger
                  value="sprites"
                  className="h-auto flex-none rounded-full border-0 bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none sm:px-5 sm:text-sm"
                >
                  Sprite sheets
                </TabsTrigger>
                <TabsTrigger
                  value="materials"
                  className="h-auto flex-none rounded-full border-0 bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none sm:px-5 sm:text-sm"
                >
                  Materials
                </TabsTrigger>
                <TabsTrigger
                  value="assets"
                  className="h-auto flex-none rounded-full border-0 bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none sm:px-5 sm:text-sm"
                >
                  3D assets
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="sprites">
              <figure>
                <div className="relative aspect-[3/2] overflow-hidden rounded-2xl bg-muted md:rounded-3xl">
                  <Image
                    draggable={false}
                    src="/www/grida-fx-sprites-placeholder.png"
                    alt="Grida FX concept workflow connecting a character reference, generation, background removal, and a sprite sheet"
                    fill
                    sizes="(max-width: 1152px) 100vw, 1088px"
                    className="object-contain"
                  />
                </div>
                <figcaption className="mt-5 text-center text-sm leading-relaxed text-muted-foreground sm:text-base">
                  Generate character sprites and arrange them into a sprite
                  sheet.
                </figcaption>
              </figure>
            </TabsContent>
            <TabsContent value="materials">
              <figure>
                <div className="relative aspect-[3/2] overflow-hidden rounded-2xl bg-muted md:rounded-3xl">
                  <Image
                    draggable={false}
                    src="/www/grida-fx-materials-placeholder.png"
                    alt="Grida FX concept workflow connecting a stone reference to color, normal, and roughness maps and a material preview"
                    fill
                    sizes="(max-width: 1152px) 100vw, 1088px"
                    className="object-contain"
                  />
                </div>
                <figcaption className="mt-5 text-center text-sm leading-relaxed text-muted-foreground sm:text-base">
                  Create texture maps from a reference and preview the material.
                </figcaption>
              </figure>
            </TabsContent>
            <TabsContent value="assets">
              <figure>
                <div className="relative aspect-[3/2] overflow-hidden rounded-2xl bg-muted md:rounded-3xl">
                  <Image
                    draggable={false}
                    src="/www/grida-fx-assets-placeholder.png"
                    alt="Grida FX concept workflow connecting a cottage reference to mesh generation, texturing, and a 3D asset output"
                    fill
                    sizes="(max-width: 1152px) 100vw, 1088px"
                    className="object-contain"
                  />
                </div>
                <figcaption className="mt-5 text-center text-sm leading-relaxed text-muted-foreground sm:text-base">
                  Develop a reference into a textured 3D asset.
                </figcaption>
              </figure>
            </TabsContent>
          </Tabs>
          <div className="mt-12 flex flex-col items-center justify-center gap-6 sm:flex-row sm:gap-10">
            <p className="text-sm text-muted-foreground">Works with</p>
            <div className="flex items-center gap-8 text-foreground md:gap-12 [&_path]:transition-colors [&_svg]:opacity-50 [&_svg]:transition-opacity [&_svg:hover]:opacity-100 [&_svg:not(:hover)_path:not([fill='#fff']):not([fill='#ffffff'])]:fill-current dark:[&_svg:not(:hover)_path[fill='#fff']]:fill-background dark:[&_svg:not(:hover)_path[fill='#ffffff']]:fill-background">
              <BlenderLogo className="size-7" role="img" aria-label="Blender" />
              <UnrealEngineLogo
                className="size-7"
                role="img"
                aria-label="Unreal Engine"
              />
              <GodotLogo className="size-7" role="img" aria-label="Godot" />
              <UnityLogo className="size-7" role="img" aria-label="Unity" />
            </div>
          </div>
        </div>
      </section>
      <section
        aria-labelledby="workflows-heading"
        className="mx-auto max-w-6xl px-4 pb-32 md:px-8 md:pb-48"
      >
        <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h2
              id="workflows-heading"
              className="text-5xl font-semibold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl"
            >
              Workflows
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground md:text-xl">
              Connect references, models, and outputs with Grida FX. Explore
              node-based workflows for content and games.
            </p>
          </div>
          {/* Enable this button when the workflow library route is ready. */}
          <button
            type="button"
            disabled
            className="inline-flex shrink-0 items-center justify-center self-start rounded-full bg-muted px-5 py-2.5 text-sm font-medium md:self-auto"
          >
            Browse all workflows
          </button>
        </div>
        <Tabs defaultValue="all" className="gap-6">
          <TabsList
            aria-label="Workflow categories"
            className="gap-1 rounded-none bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto sm:gap-2"
          >
            {[
              { value: "all", label: "All" },
              { value: "content", label: "Content" },
              { value: "game", label: "Game" },
            ].map((category) => (
              <TabsTrigger
                key={category.value}
                value={category.value}
                className="h-auto flex-none rounded-full border-0 bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none sm:px-5 sm:text-sm"
              >
                {category.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {["all", "content", "game"].map((category) => (
            <TabsContent key={category} value={category}>
              <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                {workflows
                  .filter(
                    (workflow) =>
                      category === "all" || workflow.category === category
                  )
                  .map((workflow) => (
                    <figure key={workflow.id}>
                      <Image
                        draggable={false}
                        src={workflow.image}
                        alt={workflow.alt}
                        width={1536}
                        height={1024}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 347px"
                        className="h-auto w-full rounded-2xl md:rounded-3xl"
                      />
                      <figcaption className="mt-4">
                        <p className="mb-1 text-xs text-muted-foreground">
                          {workflow.category === "content" ? "Content" : "Game"}
                        </p>
                        <h3 className="text-lg font-medium">
                          {workflow.title}
                        </h3>
                      </figcaption>
                    </figure>
                  ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>
      <section
        aria-labelledby="ownership-heading"
        className="mx-auto max-w-6xl px-4 pb-32 md:px-8 md:pb-48"
      >
        <h2
          id="ownership-heading"
          className="mb-10 max-w-4xl text-balance text-[2.5rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl"
        >
          You own your workflow.
        </h2>
        <Tabs defaultValue="local" className="gap-8 md:gap-12">
          <TabsList
            aria-label="Workflow ownership options"
            className="grid w-full grid-cols-2 gap-1 rounded-none bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto sm:inline-flex sm:w-fit sm:gap-2"
          >
            {[
              { value: "local", label: "Local workspace" },
              { value: "agent", label: "Your agent" },
              { value: "byok", label: "BYOK" },
              { value: "chatgpt", label: "ChatGPT" },
            ].map((option) => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                className="h-auto flex-none rounded-full border-0 bg-muted/50 px-2.5 py-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none sm:px-5 sm:text-sm"
              >
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="local">
            <div className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
              <div className="max-w-md">
                <h3 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                  Keep your work local.
                </h3>
                <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                  Keep your files in folders on your computer. Choose where your
                  work lives and which tools you use with it.
                </p>
              </div>
              <div className="flex aspect-[6/5] select-none flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#f4f3ef] p-5 text-neutral-800 md:rounded-3xl md:p-8">
                <svg
                  role="img"
                  aria-label="A local workspace folder containing design files, references, and assets"
                  viewBox="0 0 480 340"
                  className="w-full"
                >
                  <path
                    d="M74 116a18 18 0 0 1 18-18h92l28 26h176a18 18 0 0 1 18 18v145H74Z"
                    fill="#b8c5d9"
                  />
                  <g transform="rotate(-12 168 152)">
                    <rect
                      x="109"
                      y="44"
                      width="126"
                      height="197"
                      rx="12"
                      fill="#fff"
                    />
                    <path
                      d="M129 69h51m-51 10h78"
                      stroke="#c4c7cb"
                      strokeWidth="5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M148 114v59h51"
                      fill="none"
                      stroke="#b5bcc7"
                      strokeWidth="3"
                    />
                    <rect
                      x="132"
                      y="103"
                      width="33"
                      height="29"
                      rx="7"
                      fill="#d9e7de"
                    />
                    <rect
                      x="182"
                      y="158"
                      width="33"
                      height="29"
                      rx="7"
                      fill="#e5ddf0"
                    />
                    <circle cx="148" cy="195" r="13" fill="#ead9c6" />
                  </g>
                  <g transform="rotate(10 300 152)">
                    <rect
                      x="247"
                      y="45"
                      width="124"
                      height="195"
                      rx="12"
                      fill="#fff"
                    />
                    <rect
                      x="260"
                      y="58"
                      width="98"
                      height="130"
                      rx="6"
                      fill="#e1e8ef"
                    />
                    <circle cx="325" cy="91" r="16" fill="#efc989" />
                    <path
                      d="m260 153 31-32 23 24 18-17 26 25v35h-98Z"
                      fill="#8da895"
                    />
                    <path
                      d="M263 205h61m-61 10h80"
                      stroke="#c4c7cb"
                      strokeWidth="5"
                      strokeLinecap="round"
                    />
                  </g>
                  <path
                    d="M74 150h332a14 14 0 0 1 14 16l-15 128a17 17 0 0 1-17 15H92a17 17 0 0 1-17-15L60 166a14 14 0 0 1 14-16Z"
                    fill="#ced8e6"
                  />
                  <path d="M108 190h28l9 9h25v29h-62Z" fill="#8497b2" />
                  <text
                    x="108"
                    y="271"
                    fill="#45546a"
                    fontSize="21"
                    fontWeight="500"
                  >
                    my-workspace
                  </text>
                </svg>
                <p
                  aria-hidden="true"
                  className="text-center font-mono text-[11px] text-neutral-500 sm:text-xs"
                >
                  references / assets / exports
                </p>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="agent">
            <div className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
              <div className="max-w-md">
                <h3 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                  Keep the agent you already use.
                </h3>
                <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                  Use Grida CLI from Claude Code, Codex, or your own scripts to
                  generate assets and save them into your project.
                </p>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                  Work in your terminal, then bring the results onto your
                  canvas.
                </p>
                <Link
                  href="/docs/cli"
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-muted px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Explore the CLI
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </Link>
              </div>
              <div
                role="img"
                aria-label="Claude Code or Codex uses Grida CLI to generate assets into your local workspace"
                className="flex aspect-[6/5] select-none flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#f4f3ef] p-6 text-neutral-800 md:rounded-3xl md:p-8"
              >
                <div
                  aria-hidden="true"
                  className="flex w-full max-w-64 justify-around gap-4"
                >
                  <div className="flex flex-col items-center gap-3">
                    <ClaudeLogo className="size-9 sm:size-11" />
                    <span className="text-xs font-medium sm:text-sm">
                      Claude Code
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <OpenAILogo className="size-9 sm:size-11" />
                    <span className="text-xs font-medium sm:text-sm">
                      Codex
                    </span>
                  </div>
                </div>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 256 56"
                  className="h-10 w-full max-w-64 text-neutral-300 sm:h-14"
                >
                  <path
                    d="M64 0v12q0 8 8 8h112q8 0 8-8V0M128 20v32m-5-5 5 5 5-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
                <div
                  aria-hidden="true"
                  className="flex items-center gap-2 rounded-full bg-neutral-800 px-5 py-3 text-sm font-medium text-white sm:px-7 sm:py-4"
                >
                  <TerminalIcon className="size-4" />
                  Grida CLI
                </div>
                <ArrowDownIcon
                  aria-hidden="true"
                  className="my-3 size-5 text-neutral-400 sm:my-5"
                />
                <div
                  aria-hidden="true"
                  className="flex items-center gap-3 text-sm font-medium"
                >
                  <FolderOpenIcon className="size-6 text-neutral-500" />
                  Your workspace
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="byok">
            <div className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
              <div className="max-w-md">
                <h3 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                  Bring your own keys.
                </h3>
                <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                  Connect your provider accounts with your own API keys. Choose
                  your models and use your existing provider billing.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <Link
                    href="/docs/cli/providers"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-muted px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Set up BYOK
                    <ArrowRightIcon aria-hidden="true" className="size-4" />
                  </Link>
                </div>
              </div>
              <div
                role="img"
                aria-label="Your own API keys connect to your OpenRouter or Vercel AI Gateway account, where you manage models and billing"
                className="flex aspect-[6/5] select-none flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#f4f3ef] p-6 text-neutral-800 md:rounded-3xl md:p-8"
              >
                <div
                  aria-hidden="true"
                  className="flex flex-col items-center gap-3"
                >
                  <KeyRoundIcon
                    className="size-9 sm:size-12"
                    strokeWidth={1.5}
                  />
                  <span className="text-xs font-medium sm:text-sm">
                    Your API keys
                  </span>
                </div>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 256 56"
                  className="my-2 h-10 w-full max-w-64 text-neutral-300 sm:my-4 sm:h-14"
                >
                  <path
                    d="M128 0v12q0 8-8 8H72q-8 0-8 8v24m-5-5 5 5 5-5M128 20h56q8 0 8 8v24m-5-5 5 5 5-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
                <div
                  aria-hidden="true"
                  className="flex w-full max-w-64 justify-around gap-4"
                >
                  <div className="flex flex-col items-center gap-3">
                    <OpenRouterLogo className="size-8 opacity-70 sm:size-10" />
                    <span className="text-xs font-medium sm:text-sm">
                      OpenRouter
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <VercelLogo className="size-8 opacity-70 sm:size-10" />
                    <span className="text-xs font-medium sm:text-sm">
                      AI Gateway
                    </span>
                  </div>
                </div>
                <p
                  aria-hidden="true"
                  className="mt-6 text-center text-[11px] text-neutral-500 sm:mt-8 sm:text-xs"
                >
                  Your models · Your provider billing
                </p>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="chatgpt">
            <div className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
              <div className="max-w-md">
                <p className="mb-3 text-xs font-medium text-muted-foreground">
                  Experimental connection
                </p>
                <h3 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                  Bring your ChatGPT subscription.
                </h3>
                <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                  Connect your ChatGPT account to use supported text models in
                  Grida with your existing plan. No API key needed.
                </p>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                  Your plan’s model access and usage limits apply. Image, video,
                  and audio generation use separate providers.
                </p>
                <Link
                  href="/docs/editor/desktop/chatgpt-subscription"
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-muted px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  How to connect
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </Link>
              </div>
              <div
                role="img"
                aria-label="Connect a ChatGPT subscription to use supported text models in Grida"
                className="flex aspect-[6/5] select-none flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#f4f3ef] p-6 text-neutral-800 md:rounded-3xl md:p-8"
              >
                <div
                  aria-hidden="true"
                  className="flex w-full max-w-80 items-center justify-between gap-4 px-2 sm:px-5"
                >
                  <div className="flex flex-col items-center gap-4">
                    <OpenAILogo className="size-12 sm:size-16" />
                    <span className="text-xs font-medium sm:text-sm">
                      ChatGPT
                    </span>
                  </div>
                  <div className="flex flex-1 items-center gap-2 pb-8 text-neutral-400">
                    <span className="h-px flex-1 bg-current" />
                    <CheckIcon className="size-5" />
                    <span className="h-px flex-1 bg-current" />
                  </div>
                  <div className="flex flex-col items-center gap-4">
                    <GridaLogo className="size-12 sm:size-16" />
                    <span className="text-xs font-medium sm:text-sm">
                      Grida
                    </span>
                  </div>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-8 space-y-2 text-center sm:mt-12"
                >
                  <p className="text-lg font-medium sm:text-xl">
                    Your existing subscription
                  </p>
                  <p className="text-xs text-neutral-500 sm:text-sm">
                    Supported text models in Grida
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <section aria-labelledby="privacy-heading" className="mt-20 md:mt-28">
          <h3
            id="privacy-heading"
            className="mb-8 text-balance text-3xl font-semibold tracking-tight md:text-5xl"
          >
            Privacy on your terms.
          </h3>
          <Tabs defaultValue="local" className="gap-8 md:gap-12">
            <TabsList
              aria-label="Data privacy options"
              className="gap-1 rounded-none bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto sm:gap-2"
            >
              {[
                { value: "local", label: "Local models" },
                { value: "zdr", label: "Zero data retention" },
              ].map((option) => (
                <TabsTrigger
                  key={option.value}
                  value={option.value}
                  className="h-auto flex-none rounded-full border-0 bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none sm:px-5 sm:text-sm"
                >
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="local">
              <div className="grid items-center gap-10 md:grid-cols-[1fr_auto]">
                <div className="max-w-xl">
                  <h4 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
                    Run text models locally.
                  </h4>
                  <p className="mt-5 text-lg leading-relaxed text-muted-foreground md:text-xl">
                    Connect Ollama to run supported text models on your
                    computer. Prompts and model responses stay on your machine.
                  </p>
                  <Link
                    href="/docs/editor/desktop/local-models"
                    className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-muted px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Set up Ollama
                    <ArrowRightIcon aria-hidden="true" className="size-4" />
                  </Link>
                </div>
                <OllamaLogo
                  role="img"
                  aria-label="Ollama"
                  className="size-32 justify-self-center text-foreground opacity-50 md:size-52 lg:size-64"
                />
              </div>
            </TabsContent>
            <TabsContent value="zdr">
              <div className="grid items-center gap-10 md:grid-cols-[1fr_auto]">
                <div className="max-w-xl">
                  <h4 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
                    Choose zero data retention.
                  </h4>
                  <p className="mt-5 text-lg leading-relaxed text-muted-foreground md:text-xl">
                    Use cloud models with zero data retention (ZDR) enabled in a
                    supported provider account. Retention policies apply to
                    eligible model requests.
                  </p>
                  <a
                    href="https://openrouter.ai/docs/guides/features/zdr"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-muted px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Learn about ZDR
                    <ArrowRightIcon aria-hidden="true" className="size-4" />
                  </a>
                </div>
                <ShieldCheckIcon
                  aria-hidden="true"
                  strokeWidth={0.75}
                  className="size-32 justify-self-center text-foreground/20 md:size-52 lg:size-64"
                />
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </section>
      <section
        aria-labelledby="models-heading"
        className="mx-auto max-w-6xl px-4 pb-32 md:px-8 md:pb-48"
      >
        <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <h2
            id="models-heading"
            className="text-6xl font-semibold tracking-tight md:text-7xl lg:text-8xl"
          >
            Models
          </h2>
          <Link
            href="/ai/models"
            className="inline-flex items-center justify-center self-start rounded-full bg-muted px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:self-auto"
          >
            Browse all models
          </Link>
        </div>
        <div className="grid auto-rows-[180px] grid-cols-2 gap-4 md:auto-rows-[240px] md:grid-cols-4 md:gap-6">
          <figure className="relative col-span-2 row-span-2 overflow-hidden rounded-2xl bg-muted md:rounded-3xl">
            <Image
              draggable={false}
              src="/www/grida-model-video-landscape-placeholder.png"
              alt="Cinematic desert landscape with a runner crossing sand dunes"
              fill
              sizes="(max-width: 768px) 100vw, 532px"
              className="object-cover"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/80 via-black/35 to-transparent"
            />
            <figcaption className="absolute right-6 bottom-6 left-6 text-white">
              <p className="mb-1 text-xs font-medium">Video</p>
              <h3 className="flex items-center gap-2 text-xl font-semibold">
                <span aria-hidden="true" className="inline-flex shrink-0">
                  <GoogleLogo className="size-5 [&_path:not([fill='none'])]:fill-current" />
                </span>
                Veo 3.1
              </h3>
            </figcaption>
          </figure>
          <figure className="relative col-span-2 overflow-hidden rounded-2xl bg-muted md:rounded-3xl">
            <Image
              draggable={false}
              src="/www/grida-model-image-still-life-placeholder.png"
              alt="Editorial still life of oranges and a cobalt glass vase"
              fill
              sizes="(max-width: 768px) 100vw, 532px"
              className="object-cover"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/80 via-black/35 to-transparent"
            />
            <figcaption className="absolute right-6 bottom-6 left-6 text-white">
              <p className="mb-1 text-xs font-medium">Image</p>
              <h3 className="flex items-center gap-2 text-xl font-semibold">
                <span aria-hidden="true" className="inline-flex shrink-0">
                  <OpenAILogo className="size-5" />
                </span>
                GPT Image 2.5 Flare
              </h3>
            </figcaption>
          </figure>
          <figure className="relative overflow-hidden rounded-2xl bg-muted md:rounded-3xl">
            <Image
              draggable={false}
              src="/www/grida-model-image-sculpture-placeholder.png"
              alt="Reflective chrome ribbon sculpture against a blue backdrop"
              fill
              sizes="(max-width: 768px) 50vw, 254px"
              className="object-cover"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/80 via-black/35 to-transparent"
            />
            <figcaption className="absolute right-4 bottom-4 left-4 text-white md:right-6 md:bottom-6 md:left-6">
              <p className="mb-1 text-xs font-medium">Image</p>
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <span aria-hidden="true" className="inline-flex shrink-0">
                  <BlackForestLabsLogo className="size-5" />
                </span>
                Flux 2 Pro
              </h3>
            </figcaption>
          </figure>
          <figure className="relative overflow-hidden rounded-2xl bg-muted md:rounded-3xl">
            <Image
              draggable={false}
              src="/www/grida-model-video-city-placeholder.png"
              alt="Cinematic night scene of a cyclist on a rainy neon-lit street"
              fill
              sizes="(max-width: 768px) 50vw, 254px"
              className="object-cover"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/80 via-black/35 to-transparent"
            />
            <figcaption className="absolute right-4 bottom-4 left-4 text-white md:right-6 md:bottom-6 md:left-6">
              <p className="mb-1 text-xs font-medium">Video</p>
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <span aria-hidden="true" className="inline-flex shrink-0">
                  <ByteDanceLogo className="size-5" />
                </span>
                Seedance 2.0
              </h3>
            </figcaption>
          </figure>
        </div>
      </section>
      <section
        aria-labelledby="get-started-heading"
        className="mx-auto max-w-6xl px-4 pt-8 pb-32 text-center md:px-8 md:pt-16 md:pb-48"
      >
        <h2
          id="get-started-heading"
          className="text-balance text-6xl font-semibold tracking-tight md:text-7xl lg:text-8xl"
        >
          Start creating.
        </h2>
        <div className="mt-12 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
          <PrimaryDownloadButton
            {...downloadButtonProps}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <Link
            href="/docs/cli"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-muted px-6 text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <TerminalIcon aria-hidden="true" className="size-4" />
            Install CLI
          </Link>
          <Link
            href={sitemap.items.docs.href}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-muted px-6 text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <BookOpenIcon aria-hidden="true" className="size-4" />
            Documentation
          </Link>
        </div>
      </section>
      <Footer className="border-0" />
    </main>
  );
}
