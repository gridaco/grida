import React from "react";
import HomePage from "../_home";

// grida.co/home
export const metadata = {
  title: "Grida",
  description: "Grida is a Free & Open Canvas",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: false,
  },
};

export default function WWWCanonicalHome() {
  return <HomePage />;
}
