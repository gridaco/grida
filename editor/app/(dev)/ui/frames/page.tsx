"use client";

import React from "react";
import { ArchiveIcon, ForwardIcon, ReplyIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Safari, SafariToolbar } from "@/components/frames/safari";
import {
  EmailFrame,
  EmailFrameSubject,
  EmailFrameSender,
  EmailFrameBody,
} from "@/components/frames/email-frame";
import {
  MacOSDesktop,
  MacOSMenuBar,
  MacOSDock,
  MacOSWindow,
} from "@/components/frames/macos-desktop";
import { Resources } from "@/resources";

export default function FramesPage() {
  return (
    <main className="container max-w-screen-lg mx-auto py-10">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Frames</h1>
          <p className="text-gray-600">
            Browser frames and device mockups for content presentation and
            showcases.
          </p>
        </div>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Safari Browser Frame</h2>
            <p className="text-sm text-gray-600">
              macOS Safari-style browser frame with toolbar
            </p>
          </div>
          <div className="p-6 bg-gray-50 rounded-lg">
            <Safari className="w-full max-w-4xl mx-auto aspect-[16/10]">
              <SafariToolbar url="https://grida.co" />
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
                <div className="text-center space-y-4 p-8">
                  <h3 className="text-4xl font-bold text-gray-900">
                    Welcome to Grida
                  </h3>
                  <p className="text-lg text-gray-600">
                    Design, code, and publish in one place
                  </p>
                </div>
              </div>
            </Safari>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">With Custom Content</h2>
            <p className="text-sm text-gray-600">
              Frame your UI screenshots and designs
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Safari className="w-full aspect-video">
                <SafariToolbar url="app.example.com" />
                <div className="w-full h-full bg-white p-8">
                  <div className="space-y-4">
                    <div className="h-12 bg-gray-200 rounded animate-pulse" />
                    <div className="h-32 bg-gray-100 rounded" />
                    <div className="grid grid-cols-3 gap-4">
                      <div className="h-24 bg-gray-200 rounded" />
                      <div className="h-24 bg-gray-200 rounded" />
                      <div className="h-24 bg-gray-200 rounded" />
                    </div>
                  </div>
                </div>
              </Safari>
              <p className="text-xs text-gray-500 text-center">
                Dashboard mockup
              </p>
            </div>
            <div className="space-y-2">
              <Safari className="w-full aspect-video">
                <SafariToolbar url="docs.example.com" />
                <div className="w-full h-full bg-gradient-to-br from-green-50 to-teal-50 p-8">
                  <div className="space-y-3">
                    <div className="h-8 bg-white/50 rounded w-3/4" />
                    <div className="h-4 bg-white/30 rounded" />
                    <div className="h-4 bg-white/30 rounded w-5/6" />
                    <div className="h-4 bg-white/30 rounded w-4/6" />
                  </div>
                </div>
              </Safari>
              <p className="text-xs text-gray-500 text-center">
                Documentation page
              </p>
            </div>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">macOS Desktop Frame</h2>
            <p className="text-sm text-gray-600">
              Composable macOS primitives — desktop wallpaper, menu bar, window
              chrome, and dock. Each piece is layout-agnostic; the callsite
              decides positioning.
            </p>
          </div>
          <div className="rounded-2xl bg-zinc-100 p-2 ring-1 ring-zinc-200/70">
            <MacOSDesktop className="relative flex aspect-[16/10] w-full flex-col overflow-hidden rounded-lg">
              <MacOSMenuBar
                appName="Finder"
                className="absolute inset-x-0 top-0 z-10"
              />
              <div className="flex flex-1 items-center justify-center px-6 pt-10 pb-24">
                <MacOSWindow
                  title="softmarshmallow"
                  className="w-full max-w-[640px]"
                >
                  <div className="grid h-[260px] place-items-center bg-gradient-to-br from-white to-zinc-50 p-8">
                    <div className="space-y-2 text-center">
                      <h3 className="text-lg font-semibold text-zinc-800">
                        Drop content here
                      </h3>
                      <p className="text-sm text-zinc-500">
                        MacOSWindow is just chrome — fill the body with
                        anything.
                      </p>
                    </div>
                  </div>
                </MacOSWindow>
              </div>
              <MacOSDock
                apps={[
                  {
                    name: "Finder",
                    src: Resources.assets.macos.icons.finder,
                  },
                  {
                    name: "Safari",
                    src: Resources.assets.macos.icons.safari,
                  },
                  { name: "Notes", src: Resources.assets.macos.icons.notes },
                  {
                    name: "Messages",
                    src: Resources.assets.macos.icons.messages,
                  },
                  { name: "Music", src: Resources.assets.macos.icons.music },
                  { name: "Xcode", src: Resources.assets.macos.icons.xcode },
                  { name: "VS Code", src: Resources.assets.macos.icons.vscode },
                  { name: "Figma", src: Resources.assets.macos.icons.figma },
                  { name: "Notion", src: Resources.assets.macos.icons.notion },
                  { name: "Grida", src: Resources.assets.macos.icons.grida },
                  {
                    name: "Trash",
                    src: Resources.assets.macos.icons.trashEmpty,
                  },
                ]}
                className="pointer-events-auto absolute inset-x-0 bottom-4 z-10 mx-auto w-fit"
              />
            </MacOSDesktop>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">
              macOS Window (standalone)
            </h2>
            <p className="text-sm text-gray-600">
              Just the window chrome — traffic lights and an optional title
              strip
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <MacOSWindow title="Untitled.txt">
              <div className="h-48 bg-white p-4 font-mono text-sm text-zinc-700">
                Hello, world.
              </div>
            </MacOSWindow>
            <MacOSWindow>
              <div className="h-48 bg-gradient-to-br from-indigo-50 to-pink-50" />
            </MacOSWindow>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Features</h2>
            <p className="text-sm text-gray-600">
              Professional presentation for your designs
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">Browser Chrome</h3>
              <p className="text-sm text-gray-600">
                Authentic Safari-style toolbar with URL bar, buttons, and
                controls
              </p>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">Responsive</h3>
              <p className="text-sm text-gray-600">
                Scales beautifully at any size while maintaining proportions
              </p>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">Customizable</h3>
              <p className="text-sm text-gray-600">
                Add any content inside - images, videos, or interactive
                components
              </p>
            </div>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Use Cases</h2>
            <p className="text-sm text-gray-600">
              Perfect for various presentation needs
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-gray-50 rounded-lg space-y-2">
              <h3 className="font-semibold">Marketing Materials</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Landing page screenshots</li>
                <li>• Product demos and previews</li>
                <li>• Feature showcases</li>
                <li>• Social media graphics</li>
              </ul>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg space-y-2">
              <h3 className="font-semibold">Documentation</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Tutorial screenshots</li>
                <li>• UI/UX case studies</li>
                <li>• Design system showcases</li>
                <li>• Portfolio presentations</li>
              </ul>
            </div>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Available Frames</h2>
            <p className="text-sm text-gray-600">
              Different frame styles for various contexts
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2">Email Frame (composable)</h3>
              <p className="text-sm text-gray-600 mb-4">
                Composable email preview: EmailFrame, Subject, Sender, Body.
                Used inside Mail App Frame and standalone.
              </p>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    With actions
                  </p>
                  <EmailFrame>
                    <EmailFrameSubject
                      actions={
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                          >
                            <ReplyIcon className="h-3.5 w-3.5" />
                            <span className="sr-only">Reply</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                          >
                            <ForwardIcon className="h-3.5 w-3.5" />
                            <span className="sr-only">Forward</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                          >
                            <ArchiveIcon className="h-3.5 w-3.5" />
                            <span className="sr-only">Archive</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </>
                      }
                    >
                      Your invoice for January 2026
                    </EmailFrameSubject>
                    <EmailFrameSender
                      name="Sarah Chen"
                      email="sarah@acme.co"
                      to="me"
                      date="Jan 31, 2026"
                    />
                    <EmailFrameBody>
                      <p>Hi there,</p>
                      <p className="mt-3">
                        Please find attached your invoice for January 2026. The
                        total amount due is $2,400.00 and payment is due by
                        February 15, 2026.
                      </p>
                      <p className="mt-3">
                        If you have any questions about this invoice, feel free
                        to reply to this email or reach out to our billing team.
                      </p>
                      <p className="mt-3">
                        Best regards,
                        <br />
                        Sarah Chen
                      </p>
                    </EmailFrameBody>
                  </EmailFrame>
                </div>
                <Separator />
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Minimal
                  </p>
                  <EmailFrame>
                    <EmailFrameSender
                      name="GitHub"
                      email="noreply@github.com"
                      date="2h ago"
                    />
                    <EmailFrameBody>
                      <p className="text-muted-foreground">
                        [acme/dashboard] Pull request #142 was merged by
                        @sarah-chen.
                      </p>
                    </EmailFrameBody>
                  </EmailFrame>
                </div>
              </div>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2">macOS Desktop</h3>
              <p className="text-sm text-gray-600 mb-4">
                Composable macOS primitives: desktop, menu bar, window, dock
              </p>
              <div className="rounded-lg bg-zinc-100 p-1 ring-1 ring-zinc-200/70">
                <MacOSDesktop className="relative flex aspect-[16/10] w-full max-w-2xl flex-col overflow-hidden rounded-md">
                  <MacOSMenuBar
                    appName="Finder"
                    className="absolute inset-x-0 top-0 z-10"
                  />
                  <div className="flex flex-1 items-center justify-center pt-8 pb-16">
                    <MacOSWindow title="Window" className="w-3/4">
                      <div className="h-32 bg-white" />
                    </MacOSWindow>
                  </div>
                  <MacOSDock
                    apps={[
                      {
                        name: "Finder",
                        src: Resources.assets.macos.icons.finder,
                      },
                      {
                        name: "Safari",
                        src: Resources.assets.macos.icons.safari,
                      },
                      {
                        name: "Notes",
                        src: Resources.assets.macos.icons.notes,
                      },
                      {
                        name: "Music",
                        src: Resources.assets.macos.icons.music,
                      },
                    ]}
                    iconClassName="size-8"
                    className="pointer-events-auto absolute inset-x-0 bottom-2 z-10 mx-auto w-fit"
                  />
                </MacOSDesktop>
              </div>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2">Safari</h3>
              <p className="text-sm text-gray-600 mb-4">
                macOS Safari browser frame with realistic chrome
              </p>
              <Safari className="w-full max-w-2xl aspect-[16/9]">
                <SafariToolbar url="grida.co" />
                <div className="w-full h-full bg-gradient-to-br from-indigo-50 to-pink-50" />
              </Safari>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2">Mail (email preview)</h3>
              <p className="text-sm text-gray-600 mb-4">
                Email frame for previewing email templates
              </p>
              <div className="h-96 overflow-hidden rounded-lg border">
                <EmailFrame className="h-full flex flex-col">
                  <EmailFrameSubject>Your verification code</EmailFrameSubject>
                  <EmailFrameSender
                    name="Acme Support"
                    email="no-reply@acme.co"
                    date="Just now"
                  />
                  <EmailFrameBody className="prose prose-stone dark:prose-invert max-w-none">
                    <h2>Your verification code</h2>
                    <p>
                      Hi Alice, use the following code to verify your identity:
                    </p>
                    <p
                      style={{
                        fontSize: "2rem",
                        fontWeight: "bold",
                        letterSpacing: "0.25em",
                      }}
                    >
                      123456
                    </p>
                    <p>This code expires in 10 minutes.</p>
                    <hr />
                    <p>
                      If you did not request this, you can safely ignore this
                      email.
                    </p>
                  </EmailFrameBody>
                </EmailFrame>
              </div>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2">
                Mail (long content, scrollable)
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Email body scrolls when content exceeds the frame height
              </p>
              <div className="h-96 overflow-hidden rounded-lg border">
                <EmailFrame className="h-full flex flex-col">
                  <EmailFrameSubject>
                    Thanks for your submission
                  </EmailFrameSubject>
                  <EmailFrameSender
                    name="Grida Forms"
                    email="no-reply@accounts.grida.co"
                    date="Just now"
                  />
                  <EmailFrameBody className="prose prose-stone dark:prose-invert max-w-none">
                    <h2>Thanks for registering!</h2>
                    <p>
                      We received your submission for the Annual Conference.
                    </p>
                    <p>Your registration number: #042</p>
                    <h3>What happens next?</h3>
                    <ul>
                      <li>
                        You will receive a confirmation email within 24 hours
                      </li>
                      <li>Our team will review your application</li>
                      <li>If approved, you will get your ticket via email</li>
                    </ul>
                    <h3>Event details</h3>
                    <p>
                      Date: March 15, 2026
                      <br />
                      Location: Convention Center, Hall A<br />
                      Time: 9:00 AM - 5:00 PM
                    </p>
                    <h3>Important notes</h3>
                    <p>
                      Please bring a valid ID and your ticket (digital or
                      printed) to the event. Doors open at 8:30 AM for
                      registration.
                    </p>
                    <p>
                      If you have any dietary requirements, please let us know
                      at least 48 hours before the event.
                    </p>
                    <p>We look forward to seeing you there!</p>
                    <hr />
                    <p style={{ fontSize: "0.75rem", color: "#666" }}>
                      This is an automated message. If you did not submit this
                      form, please contact support@example.com.
                    </p>
                  </EmailFrameBody>
                </EmailFrame>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
