import styled from "@emotion/styled";
import React, { useEffect, useRef } from "react";

// let canvas: HTMLCanvasElement;
let c: CanvasRenderingContext2D;
const mouse: { x: number; y: number } = { x: null, y: null };

const Color = {
  vector: ["#0029FF", "#00FFFF", "#FF4ED8"],
  getRandom: () => {
    return Color.vector[Math.floor(Math.random() * Color.vector.length)];
  },
};

class Circle {
  r;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly maxRadius: number,
    private r_min = randomNumber(maxRadius * 0.9, 20),
    private x = randomNumber(canvas.width, r_min),
    private y = randomNumber(canvas.height, r_min),
    private dx = randomNumber(1, -2, [0]),
    private dy = randomNumber(1, -1, [0]),
    private color = Color.getRandom(),
  ) {
    this.draw();
    this.r = r_min;
  }

  side() {
    return {
      right: this.x + this.r,
      left: this.x - this.r,
      bottom: this.y + this.r,
      top: this.y - this.r,
    };
  }

  draw() {
    c.beginPath();
    c.arc(this.x, this.y, this.r, 0, Math.PI * 2, false);
    c.fillStyle = this.color;
    c.fill();
  }

  run() {
    // detect collision
    if (this.side().right > this.canvas.width || this.side().left < 0)
      this.dx *= -1;
    if (this.side().bottom > this.canvas.height || this.side().top < 0)
      this.dy *= -1;

    // increase size
    if (
      // @ts-ignore
      (mouse.x != mouse.y) != 0 &&
      this.side().left - mouse.x < 50 &&
      mouse.x - this.side().right < 50 &&
      this.side().top - mouse.y < 50 &&
      mouse.y - this.side().bottom < 50 &&
      this.r < this.maxRadius
    )
      this.r += 3;
    else if (this.r > this.r_min) this.r -= 1;

    // change position
    this.x += this.dx;
    this.y += this.dy;

    this.draw();
  }
}

let circles: Circle[] = [];

function init(canvas: HTMLCanvasElement) {
  const circleCount = window.innerWidth / 9;
  const maxRadius = window.innerWidth / 6;

  // setting up canvas
  c = canvas.getContext("2d");
  resetCanvas();
  animation(canvas);

  // adding circles
  for (let i = circleCount; i > 0; i--) {
    circles.push(new Circle(canvas, maxRadius));
  }
}

function animation(canvas: HTMLCanvasElement) {
  // clear canvas
  c.clearRect(0, 0, canvas.width, canvas.height);

  // animation
  circles.forEach(circle => circle.run());

  // callback
  requestAnimationFrame(() => {
    animation(canvas);
  });
}

// ## utility functions
function resetCanvas() {
  c.canvas.width = window.innerWidth;
  c.canvas.height = window.innerHeight;
}

function randomNumber(max = 1, min = 0, forbidden: number[] = []): number {
  let res;

  do {
    res = Math.floor(min + Math.random() * (max - min));
  } while (forbidden.some(num => num == res));

  return res;
}

// ## event handlers

export default function AnimatedBlurGradientBg() {
  const canvas = useRef(null);

  useEffect(() => {
    // window.addEventListener("load", this.init());
    init(canvas.current);
  }, [canvas]);

  useEffect(() => {
    window.addEventListener("resize", resetCanvas);
    return () => {
      window.removeEventListener("resize", resetCanvas);
    };
  }, []);

  return (
    <BlurryContainer>
      <canvas ref={canvas} />
    </BlurryContainer>
  );
}

const BlurryContainer = styled.div`
  filter: blur(128px) saturate(1.2);
  pointer-events: none;
`;
