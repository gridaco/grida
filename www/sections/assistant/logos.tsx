import React from "react";
import Image from "next/image";
import styled from "@emotion/styled";
import { ArrowRightIcon } from "@radix-ui/react-icons";
import Link from "next/link";

const logos = [
  {
    src: "/assets/logos/grey/google@2x.png",
    alt: "Google logo",
    width: 95,
    secondary: false,
  },
  {
    src: "/assets/logos/grey/netflix@2x.png",
    alt: "Netflix logo",
    width: 116,
    secondary: false,
  },
  {
    src: "/assets/logos/grey/typeform@2x.png",
    alt: "Typeform logo",
    width: 125,
    secondary: false,
  },
  {
    src: "/assets/logos/grey/tencent@2x.png",
    alt: "Tencent logo",
    width: 132,
    secondary: true,
  },
  {
    src: "/assets/logos/grey/samsung@2x.png",
    alt: "Samsung logo",
    width: 171,
    secondary: false,
  },
  {
    src: "/assets/logos/grey/mckinsey@2x.png",
    alt: "McKinsey logo",
    width: 107,
    secondary: true,
  },
  {
    src: "/assets/logos/grey/duckduckgo@2x.png",
    alt: "DuckDuckGo logo",
    width: 129,
    secondary: true,
  },
  {
    src: "/assets/logos/grey/nyu@2x.png",
    alt: "NYU logo",
    width: 118,
    secondary: false,
  },
  {
    src: "/assets/logos/grey/wix@2x.png",
    alt: "Wix logo",
    width: 50,
    secondary: true,
  },
  {
    src: "/assets/logos/grey/euler@2x.png",
    alt: "Euler logo",
    width: 100,
    secondary: true,
  },
] as const;

export function LogosSection() {
  return (
    <Layout>
      <LogosContainer>
        {logos.map(({ src, alt, width, secondary }) => (
          <div key={src} className={"logo" + (secondary ? " secondary" : "")}>
            <Image
              loading="eager"
              src={src}
              alt={alt}
              height={40}
              width={width}
            />
          </div>
        ))}
      </LogosContainer>
      <div className="cta">
        <Link href="/contact/sales">
          <button>
            Contact Sales
            <ArrowRightIcon />
          </button>
        </Link>
      </div>
    </Layout>
  );
}

const Layout = styled.div`
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  max-width: 1200px;

  .cta {
    display: flex;
    flex-direction: row;
    gap: 16px;
    font-size: 16px;
    margin-top: 32px;
    button {
      cursor: pointer;
      opacity: 0.8;
      padding: 16px 32px;
      border-radius: 8px;
      border: none;
      background: rgba(0, 0, 0, 0.01);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;

      &:hover {
        background: rgba(0, 0, 0, 0.05);
        scale: 1.05;
        opacity: 1;
      }

      &:active {
        background: rgba(0, 0, 0, 0.1);
        scale: 1;
        opacity: 1;
      }

      transition: all 0.15s ease-in-out;
    }
  }
`;

const LogosContainer = styled.div`
  max-width: 1040px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  padding: 32px 120px;
  width: 100%;
  gap: 40px;

  .logo {
    user-select: none;
    opacity: 0.8;
    @media screen and (max-width: 400px) {
      scale: 0.8;
    }

    &:hover {
      opacity: 1;
      scale: 1.02;
    }

    transition: all 0.1s ease-in-out;
  }

  .secondary {
    @media screen and (max-width: 600px) {
      display: none !important;
    }
  }
`;
