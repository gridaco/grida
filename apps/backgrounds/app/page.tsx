import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col min-h-dvh">
      <header className="px-4 lg:px-6 h-14 flex items-center">
        <Link
          href="#"
          className="flex items-center justify-center"
          prefetch={false}
        >
          <MountainIcon className="size-6" />
          <span className="sr-only">Backgrounds by Grida</span>
        </Link>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          <Link
            href="#"
            className="text-sm font-medium hover:underline underline-offset-4"
            prefetch={false}
          >
            Githib
          </Link>
          <Link
            href="#"
            className="text-sm font-medium hover:underline underline-offset-4"
            prefetch={false}
          >
            Credits
          </Link>
          <Link
            href="#"
            className="text-sm font-medium hover:underline underline-offset-4"
            prefetch={false}
          >
            Request
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32">
          <div className="container mx-auto space-y-12 px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                  Explore Our Dynamic Backgrounds
                </h2>
                <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Browse through our curated collection of visually stunning
                  backgrounds, perfect for enhancing your website or
                  application.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              <div className="relative overflow-hidden transition-transform duration-300 ease-in-out rounded-lg shadow-lg group hover:shadow-xl hover:-translate-y-2">
                <Link
                  href="#"
                  className="absolute inset-0 z-10"
                  prefetch={false}
                >
                  <span className="sr-only">Preview</span>
                </Link>
                <img
                  src="/placeholder.svg"
                  alt="Background 1"
                  width={300}
                  height={300}
                  className="object-cover w-full h-64"
                />
                <div className="p-4 bg-background">
                  <h3 className="text-xl font-bold">Fluid Gradient</h3>
                  <p className="text-sm text-muted-foreground">
                    Smooth color transitions
                  </p>
                </div>
              </div>
              <div className="relative overflow-hidden transition-transform duration-300 ease-in-out rounded-lg shadow-lg group hover:shadow-xl hover:-translate-y-2">
                <Link
                  href="#"
                  className="absolute inset-0 z-10"
                  prefetch={false}
                >
                  <span className="sr-only">Preview</span>
                </Link>
                <img
                  src="/placeholder.svg"
                  alt="Background 2"
                  width={300}
                  height={300}
                  className="object-cover w-full h-64"
                />
                <div className="p-4 bg-background">
                  <h3 className="text-xl font-bold">Animated Particles</h3>
                  <p className="text-sm text-muted-foreground">
                    Captivating particle effects
                  </p>
                </div>
              </div>
              <div className="relative overflow-hidden transition-transform duration-300 ease-in-out rounded-lg shadow-lg group hover:shadow-xl hover:-translate-y-2">
                <Link
                  href="#"
                  className="absolute inset-0 z-10"
                  prefetch={false}
                >
                  <span className="sr-only">Preview</span>
                </Link>
                <img
                  src="/placeholder.svg"
                  alt="Background 3"
                  width={300}
                  height={300}
                  className="object-cover w-full h-64"
                />
                <div className="p-4 bg-background">
                  <h3 className="text-xl font-bold">Glowing Orbs</h3>
                  <p className="text-sm text-muted-foreground">
                    Mesmerizing spherical patterns
                  </p>
                </div>
              </div>
              <div className="relative overflow-hidden transition-transform duration-300 ease-in-out rounded-lg shadow-lg group hover:shadow-xl hover:-translate-y-2">
                <Link
                  href="#"
                  className="absolute inset-0 z-10"
                  prefetch={false}
                >
                  <span className="sr-only">Preview</span>
                </Link>
                <img
                  src="/placeholder.svg"
                  alt="Background 4"
                  width={300}
                  height={300}
                  className="object-cover w-full h-64"
                />
                <div className="p-4 bg-background">
                  <h3 className="text-xl font-bold">Cosmic Swirls</h3>
                  <p className="text-sm text-muted-foreground">
                    Captivating cosmic patterns
                  </p>
                </div>
              </div>
              <div className="relative overflow-hidden transition-transform duration-300 ease-in-out rounded-lg shadow-lg group hover:shadow-xl hover:-translate-y-2">
                <Link
                  href="#"
                  className="absolute inset-0 z-10"
                  prefetch={false}
                >
                  <span className="sr-only">Preview</span>
                </Link>
                <img
                  src="/placeholder.svg"
                  alt="Background 5"
                  width={300}
                  height={300}
                  className="object-cover w-full h-64"
                />
                <div className="p-4 bg-background">
                  <h3 className="text-xl font-bold">Neon Waves</h3>
                  <p className="text-sm text-muted-foreground">
                    Vibrant and dynamic waves
                  </p>
                </div>
              </div>
              <div className="relative overflow-hidden transition-transform duration-300 ease-in-out rounded-lg shadow-lg group hover:shadow-xl hover:-translate-y-2">
                <Link
                  href="#"
                  className="absolute inset-0 z-10"
                  prefetch={false}
                >
                  <span className="sr-only">Preview</span>
                </Link>
                <img
                  src="/placeholder.svg"
                  alt="Background 6"
                  width={300}
                  height={300}
                  className="object-cover w-full h-64"
                />
                <div className="p-4 bg-background">
                  <h3 className="text-xl font-bold">Geometric Patterns</h3>
                  <p className="text-sm text-muted-foreground">
                    Intricate and visually striking
                  </p>
                </div>
              </div>
              <div className="relative overflow-hidden transition-transform duration-300 ease-in-out rounded-lg shadow-lg group hover:shadow-xl hover:-translate-y-2">
                <Link
                  href="#"
                  className="absolute inset-0 z-10"
                  prefetch={false}
                >
                  <span className="sr-only">Preview</span>
                </Link>
                <img
                  src="/placeholder.svg"
                  alt="Background 7"
                  width={300}
                  height={300}
                  className="object-cover w-full h-64"
                />
                <div className="p-4 bg-background">
                  <h3 className="text-xl font-bold">Liquid Distortion</h3>
                  <p className="text-sm text-muted-foreground">
                    Mesmerizing fluid effects
                  </p>
                </div>
              </div>
              <div className="relative overflow-hidden transition-transform duration-300 ease-in-out rounded-lg shadow-lg group hover:shadow-xl hover:-translate-y-2">
                <Link
                  href="#"
                  className="absolute inset-0 z-10"
                  prefetch={false}
                >
                  <span className="sr-only">Preview</span>
                </Link>
                <img
                  src="/placeholder.svg"
                  alt="Background 8"
                  width={300}
                  height={300}
                  className="object-cover w-full h-64"
                />
                <div className="p-4 bg-background">
                  <h3 className="text-xl font-bold">Prismatic Rays</h3>
                  <p className="text-sm text-muted-foreground">
                    Refractive light patterns
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Grida. All rights reserved.
        </p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link
            href="#"
            className="text-xs hover:underline underline-offset-4"
            prefetch={false}
          >
            Terms of Service
          </Link>
          <Link
            href="#"
            className="text-xs hover:underline underline-offset-4"
            prefetch={false}
          >
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  );
}

function MountainIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
    </svg>
  );
}
