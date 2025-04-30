import React from "react";
import { type Metadata } from "next";
import ImagePlayground from "./_page";

export const metadata: Metadata = {
  title: "Image Playground",
  description: "Playground for generating images",
};

export default function ImagePlaygroundPage() {
  return <ImagePlayground />;
}
