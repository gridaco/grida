import CanvasKitInit, { CanvasKit, Paint, Surface } from "canvaskit-wasm";

const __n = 10000;

interface RotatingRect {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number; // in degrees
  speed: number; // degrees per frame
  color: [number, number, number, number];
}

export class BenchmarkSkiaGLRectangles {
  private kit!: CanvasKit;
  private surface!: Surface;
  private paint!: Paint;
  private strokePaint!: Paint;
  private rafId = 0;

  private lastFpsUpdate = performance.now();
  private frameCount = 0;
  private fps = 0;

  private rects: RotatingRect[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private count: number = __n
  ) {
    this.init();
  }

  private async init() {
    this.kit = await CanvasKitInit({
      locateFile: (file) =>
        `https://unpkg.com/canvaskit-wasm@latest/bin/${file}`,
    });

    this.surface = this.kit.MakeWebGLCanvasSurface(this.canvas)!;

    this.paint = new this.kit.Paint();
    this.paint.setAntiAlias(true);
    this.paint.setStyle(this.kit.PaintStyle.Fill);

    this.strokePaint = new this.kit.Paint();
    this.strokePaint.setAntiAlias(true);
    this.strokePaint.setStyle(this.kit.PaintStyle.Stroke);
    this.strokePaint.setColor(this.kit.Color(0, 0, 0, 0)); // transparent stroke
    this.strokePaint.setStrokeWidth(1);

    this.rects = this.generateRects();
    this.start();
  }

  private generateRects(): RotatingRect[] {
    return Array.from({ length: this.count }, () => ({
      x: Math.random() * 800,
      y: Math.random() * 600,
      w: 20 + Math.random() * 30,
      h: 20 + Math.random() * 30,
      angle: Math.random() * 360,
      speed: 0.5 + Math.random() * 2,
      color: [
        Math.random() * 255,
        Math.random() * 255,
        Math.random() * 255,
        1.0,
      ] as [number, number, number, number],
    }));
  }

  private start() {
    const canvas = this.surface.getCanvas();

    const loop = () => {
      const frameStart = performance.now();

      canvas.clear(this.kit.Color(255, 255, 255, 1));

      for (const r of this.rects) {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;

        canvas.save();
        canvas.rotate((r.angle * Math.PI) / 180, cx, cy);

        this.paint.setColor(this.kit.Color(...r.color));
        const rect = this.kit.LTRBRect(r.x, r.y, r.x + r.w, r.y + r.h);
        canvas.drawRect(rect, this.paint);

        // 🚨 NO-OP overhead stroke (adds extra WASM call) (testing)
        canvas.drawRect(rect, this.strokePaint);

        canvas.restore();

        r.angle = (r.angle + r.speed) % 360;
      }

      this.surface.flush();

      const frameEnd = performance.now();
      const frameTime = frameEnd - frameStart;

      this.frameCount++;
      const now = performance.now();
      if (now - this.lastFpsUpdate >= 1000) {
        this.fps = this.frameCount;
        console.clear();
        console.table({
          FPS: this.fps,
          "Frame Time (ms)": frameTime.toFixed(2),
          Rectangles: this.count,
        });
        this.frameCount = 0;
        this.lastFpsUpdate = now;
      }

      this.rafId = requestAnimationFrame(loop);
    };

    loop();
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    this.paint?.delete?.();
    this.strokePaint?.delete?.();
    this.surface?.delete?.();
  }
}

// export class BenchmarkSkiaGLRectangles {
//   private kit!: CanvasKit;
//   private surface!: Surface;
//   private paint!: Paint;
//   private rafId = 0;

//   private lastFpsUpdate = performance.now();
//   private frameCount = 0;
//   private fps = 0;

//   private rects: RotatingRect[] = [];

//   constructor(
//     private canvas: HTMLCanvasElement,
//     private count: number = __n
//   ) {
//     this.init();
//   }

//   private async init() {
//     this.kit = await CanvasKitInit({
//       locateFile: (file) =>
//         `https://unpkg.com/canvaskit-wasm@latest/bin/${file}`,
//     });

//     this.surface = this.kit.MakeWebGLCanvasSurface(this.canvas)!;
//     this.paint = new this.kit.Paint();
//     this.paint.setAntiAlias(true);
//     this.paint.setStyle(this.kit.PaintStyle.Fill);

//     this.rects = this.generateRects();
//     this.start();
//   }

//   private generateRects(): RotatingRect[] {
//     return Array.from({ length: this.count }, () => ({
//       x: Math.random() * 800,
//       y: Math.random() * 600,
//       w: 20 + Math.random() * 30,
//       h: 20 + Math.random() * 30,
//       angle: Math.random() * 360,
//       speed: 0.5 + Math.random() * 2, // degrees/frame
//       color: [
//         Math.random() * 255,
//         Math.random() * 255,
//         Math.random() * 255,
//         1.0,
//       ] as [number, number, number, number],
//     }));
//   }

//   private start() {
//     const canvas = this.surface.getCanvas();

//     const loop = () => {
//       const frameStart = performance.now();

//       canvas.clear(this.kit.Color(255, 255, 255, 1));

//       for (const r of this.rects) {
//         const cx = r.x + r.w / 2;
//         const cy = r.y + r.h / 2;

//         canvas.save();
//         canvas.rotate((r.angle * Math.PI) / 180, cx, cy);

//         this.paint.setColor(this.kit.Color(...r.color));
//         canvas.drawRect(
//           this.kit.LTRBRect(r.x, r.y, r.x + r.w, r.y + r.h),
//           this.paint
//         );

//         canvas.restore();

//         // update rotation
//         r.angle = (r.angle + r.speed) % 360;
//       }

//       this.surface.flush();

//       const frameEnd = performance.now();
//       const frameTime = frameEnd - frameStart;

//       this.frameCount++;
//       const now = performance.now();
//       if (now - this.lastFpsUpdate >= 1000) {
//         this.fps = this.frameCount;
//         console.clear();
//         console.table({
//           FPS: this.fps,
//           "Frame Time (ms)": frameTime.toFixed(2),
//           Rectangles: this.count,
//         });
//         this.frameCount = 0;
//         this.lastFpsUpdate = now;
//       }

//       this.rafId = requestAnimationFrame(loop);
//     };

//     loop();
//   }

//   dispose() {
//     cancelAnimationFrame(this.rafId);
//     this.paint?.delete?.();
//     this.surface?.delete?.();
//   }
// }

export class BenchmarkSkiaWebGPURectangles {
  private kit!: CanvasKit;
  private surface!: Surface;
  private paint!: Paint;
  private rafId = 0;

  private lastFpsUpdate = performance.now();
  private frameCount = 0;
  private fps = 0;

  private rects: RotatingRect[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private count: number = __n
  ) {
    this.init();
  }

  private async init() {
    this.kit = await CanvasKitInit({
      locateFile: (file) =>
        `https://unpkg.com/canvaskit-wasm@latest/bin/${file}`,
    });

    // 1. Get WebGPU context
    const context = this.canvas.getContext("webgpu") as GPUCanvasContext;

    // 2. Request device + adapter
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter?.requestDevice()!;

    // 3. Configure context
    context.configure({
      device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: "premultiplied",
    });

    const surface = this.kit.MakeGPUCanvasSurface(
      device as any,
      this.kit.ColorSpace.SRGB,
      this.canvas.width,
      this.canvas.height
    );
    if (!surface) throw new Error("WebGPU surface creation failed");

    this.surface = surface;
    this.paint = new this.kit.Paint();
    this.paint.setAntiAlias(true);
    this.paint.setStyle(this.kit.PaintStyle.Fill);

    this.rects = this.generateRects();
    this.start();
  }

  private generateRects(): RotatingRect[] {
    return Array.from({ length: this.count }, () => ({
      x: Math.random() * 800,
      y: Math.random() * 600,
      w: 20 + Math.random() * 30,
      h: 20 + Math.random() * 30,
      angle: Math.random() * 360,
      speed: 0.5 + Math.random() * 2,
      color: [
        Math.random() * 255,
        Math.random() * 255,
        Math.random() * 255,
        1.0,
      ] as [number, number, number, number],
    }));
  }

  private start() {
    const canvas = this.surface.getCanvas();

    const loop = () => {
      const frameStart = performance.now();

      canvas.clear(this.kit.Color(255, 255, 255, 1));

      for (const r of this.rects) {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;

        canvas.save();
        canvas.rotate((r.angle * Math.PI) / 180, cx, cy);

        this.paint.setColor(this.kit.Color(...r.color));
        canvas.drawRect(
          this.kit.LTRBRect(r.x, r.y, r.x + r.w, r.y + r.h),
          this.paint
        );

        canvas.restore();

        r.angle = (r.angle + r.speed) % 360;
      }

      this.surface.flush();

      const frameEnd = performance.now();
      const frameTime = frameEnd - frameStart;

      this.frameCount++;
      const now = performance.now();
      if (now - this.lastFpsUpdate >= 1000) {
        this.fps = this.frameCount;
        console.clear();
        console.table({
          FPS: this.fps,
          "Frame Time (ms)": frameTime.toFixed(2),
          Rectangles: this.count,
        });
        this.frameCount = 0;
        this.lastFpsUpdate = now;
      }

      this.rafId = requestAnimationFrame(loop);
    };

    loop();
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    this.paint?.delete?.();
    this.surface?.delete?.();
  }
}

export class BenchmarkCanvas2DRectangles {
  private ctx!: CanvasRenderingContext2D;
  private rafId = 0;

  private lastFpsUpdate = performance.now();
  private frameCount = 0;
  private fps = 0;

  private rects: RotatingRect[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private count: number = __n
  ) {
    this.ctx = this.canvas.getContext("2d")!;
    this.rects = this.generateRects();
    this.start();
  }
  private generateRects(): RotatingRect[] {
    return Array.from(
      { length: this.count },
      (): RotatingRect => ({
        x: Math.random() * 800,
        y: Math.random() * 600,
        w: 20 + Math.random() * 30,
        h: 20 + Math.random() * 30,
        angle: Math.random() * 360,
        speed: 0.5 + Math.random() * 2,
        color: [
          Math.floor(Math.random() * 255),
          Math.floor(Math.random() * 255),
          Math.floor(Math.random() * 255),
          1,
        ],
      })
    );
  }

  private start() {
    const loop = () => {
      const start = performance.now();

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      for (const r of this.rects) {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;

        this.ctx.save();
        this.ctx.translate(cx, cy);
        this.ctx.rotate((r.angle * Math.PI) / 180);
        this.ctx.translate(-cx, -cy);

        this.ctx.fillStyle = `rgba(${r.color[0]}, ${r.color[1]}, ${r.color[2]}, ${r.color[3]})`;
        this.ctx.fillRect(r.x, r.y, r.w, r.h);

        this.ctx.restore();

        r.angle = (r.angle + r.speed) % 360;
      }

      const end = performance.now();
      const frameTime = end - start;

      this.frameCount++;
      const now = performance.now();
      if (now - this.lastFpsUpdate >= 1000) {
        this.fps = this.frameCount;
        console.clear();
        console.table({
          FPS: this.fps,
          "Frame Time (ms)": frameTime.toFixed(2),
          Rectangles: this.rects.length,
        });
        this.frameCount = 0;
        this.lastFpsUpdate = now;
      }

      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
  }
}

export class BenchmarkWebGLRectangles {
  private gl: WebGLRenderingContext;
  private program!: WebGLProgram;
  private positionLocation!: number;
  private colorLocation!: WebGLUniformLocation;
  private matrixLocation!: WebGLUniformLocation;

  private buffer!: WebGLBuffer;
  private rafId = 0;

  private lastFpsUpdate = performance.now();
  private frameCount = 0;
  private fps = 0;

  private rects: RotatingRect[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private count: number = __n
  ) {
    this.gl = this.canvas.getContext("webgl")!;
    this.rects = this.generateRects();
    this.initGL();
    this.start();
  }

  private generateRects(): RotatingRect[] {
    return Array.from({ length: this.count }, () => ({
      x: Math.random() * 800,
      y: Math.random() * 600,
      w: 20 + Math.random() * 30,
      h: 20 + Math.random() * 30,
      angle: Math.random() * 360,
      speed: 0.5 + Math.random() * 2,
      color: [Math.random(), Math.random(), Math.random(), 1.0] as [
        number,
        number,
        number,
        number,
      ],
    }));
  }

  private initGL() {
    const gl = this.gl;

    const vert = `
      attribute vec2 a_position;
      uniform mat3 u_matrix;
      void main() {
        vec3 pos = u_matrix * vec3(a_position, 1.0);
        gl_Position = vec4(pos.xy, 0, 1);
      }
    `;

    const frag = `
      precision mediump float;
      uniform vec4 u_color;
      void main() {
        gl_FragColor = u_color;
      }
    `;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vert);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, frag);
    gl.compileShader(fs);

    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.useProgram(this.program);

    this.positionLocation = gl.getAttribLocation(this.program, "a_position");
    this.colorLocation = gl.getUniformLocation(this.program, "u_color")!;
    this.matrixLocation = gl.getUniformLocation(this.program, "u_matrix")!;

    // Rect vertex buffer (2 triangles for 1 unit rect)
    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      gl.STATIC_DRAW
    );
  }

  private start() {
    const gl = this.gl;
    const loop = () => {
      const start = performance.now();
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.enableVertexAttribArray(this.positionLocation);
      gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

      for (const r of this.rects) {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        const rad = (r.angle * Math.PI) / 180;

        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const sx = r.w;
        const sy = r.h;

        // 3x3 transform matrix (translation + rotation + scale)
        const tx = r.x;
        const ty = r.y;
        const mat = [
          (cos * sx) / 400,
          (sin * sy) / 300,
          0,
          (-sin * sx) / 400,
          (cos * sy) / 300,
          0,
          (tx + r.w / 2 - 400) / 400,
          (ty + r.h / 2 - 300) / 300,
          1,
        ];

        gl.uniformMatrix3fv(this.matrixLocation, false, new Float32Array(mat));
        gl.uniform4fv(this.colorLocation, r.color);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        r.angle = (r.angle + r.speed) % 360;
      }

      const end = performance.now();
      const frameTime = end - start;

      this.frameCount++;
      const now = performance.now();
      if (now - this.lastFpsUpdate >= 1000) {
        this.fps = this.frameCount;
        console.clear();
        console.table({
          FPS: this.fps,
          "Frame Time (ms)": frameTime.toFixed(2),
          Rectangles: this.rects.length,
        });
        this.frameCount = 0;
        this.lastFpsUpdate = now;
      }

      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
  }
}
