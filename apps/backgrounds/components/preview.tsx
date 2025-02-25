"use client";

import { useRef, useState } from "react";
import Image from "next/image";

export function Preview({ preview }: { preview: [string] | [string, string] }) {
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (videoRef.current) {
      videoRef.current.play();
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0; // Reset video to start
    }
  };

  return (
    <div
      className="relative overflow-hidden"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Image
        src={preview[0]}
        alt="Thumbnail"
        width={300}
        height={300}
        className={`object-cover w-full h-64 ${isHovered && preview[1] ? "hidden" : "block"}`}
      />
      {preview[1] && (
        <video
          ref={videoRef}
          src={preview[1]}
          className={`object-cover w-full h-64 ${isHovered ? "block" : "hidden"}`}
          muted
          loop
          playsInline
          autoPlay
          controls={false}
        />
      )}
    </div>
  );
}
