"use client";

import Header from "@/www/header";
import FooterWithCTA from "@/www/footer-with-cta";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Calendar, Mail, MessageSquare } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { SlackIcon } from "lucide-react";
import { EnvelopeClosedIcon } from "@radix-ui/react-icons";

export default function ContactPage() {
  return (
    <main>
      <Header />
      <div className="h-40" />
      <section>
        <Contact />
      </section>
      <div className="h-96" />
      <FooterWithCTA />
    </main>
  );
}

function Contact() {
  return (
    <section className="container w-full items-center">
      <div className="flex flex-col pt-12 items-center gap-7">
        <h2 className="text-4xl font-semibold text-center">Contact Us</h2>
        <p className="opacity-50 text-center max-w-md">
          Have questions? DM me on Slack or email me.
          <br /> I&apos;m here to help!
        </p>
      </div>
      <div className="h-16" />
      <div className="grid w-auto max-w-2xl gap-6 grid-cols-1 md:grid-cols-2 mx-auto">
        <div className="md:col-span-2">
          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="flex flex-col items-center justify-center">
              <AnimatedAvatar />
              <div className="h-6" />
              <p className="text-center">
                👋 Hi! I&apos;m the CEO of Grida.
                <br />
                Have questions? DM me on{" "}
                <Link
                  href="https://grida.co/join-slack"
                  target="_blank"
                  className="hover:underline"
                >
                  <SlackIcon className="inline align-middle w-3.5 h-3.5 me-1" />
                  Slack
                </Link>{" "}
                or email me at{" "}
                <Link
                  href="mailto:universe@grida.co"
                  className="hover:underline"
                >
                  <EnvelopeClosedIcon className="inline align-middle w-3.5 h-3.5 me-1" />
                  universe@grida.co
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <SlackIcon className="size-8 mb-4" />
            <CardTitle>Join Slack</CardTitle>
            <CardDescription>Connect with our community</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                window.open("https://grida.co/join-slack", "_blank")
              }
            >
              Join Workspace
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <Calendar className="size-8 mb-4" />
            <CardTitle>Book a Meeting</CardTitle>
            <CardDescription>Schedule time with our team</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                window.open(
                  "https://cal.com/universe-from-grida/15min",
                  "_blank"
                )
              }
            >
              View Calendar
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function AnimatedAvatar() {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <>
      <Head>
        <link
          rel="preload"
          href="/images/customer-support-ceo-wink.png"
          as="image"
        />
        <link
          rel="preload"
          href="/images/customer-support-ceo.png"
          as="image"
        />
      </Head>
      <Image
        priority
        src={
          isHovered
            ? "/images/customer-support-ceo-wink.png"
            : "/images/customer-support-ceo.png"
        }
        width={400}
        height={400}
        alt="customer-support-hi"
        className="w-36 h-36 rounded-lg object-cover border shadow"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
    </>
  );
}
