/// <reference types="@webgpu/types" />

import { Transform2D, TransparencyGridOptions } from "./types";
import { parseColor, quantize } from "./utils";

const shader = `
  struct Uniforms {
    stepX: f32,
    stepY: f32,
    dpr: f32,
    _pad0: f32,        // padding to 16 bytes
    tx: f32,
    ty: f32,
    sx: f32,
    sy: f32,
    color: vec4<f32>,
  };
  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  @vertex
  fn vs_main(@builtin(vertex_index) VertexIndex: u32) -> @builtin(position) vec4<f32> {
    // Fullscreen triangle
    var pos = array<vec2<f32>, 3>(
      vec2<f32>(-1.0, -1.0),
      vec2<f32>(3.0, -1.0),
      vec2<f32>(-1.0, 3.0)
    );
    return vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  }

  @fragment
  fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let pixel = fragCoord.xy / uniforms.dpr;
    let ux = (pixel.x - uniforms.tx) / uniforms.sx;
    let uy = (pixel.y - uniforms.ty) / uniforms.sy;
    let cell = floor(vec2<f32>(ux, uy) / vec2<f32>(uniforms.stepX, uniforms.stepY));
    let f = fract((cell.x + cell.y) * 0.5);
    if (f < 0.5) {
      // output premultiplied color
      let c = uniforms.color;
      return vec4<f32>(c.rgb * c.a, c.a);
    }
    // transparent for empty cells
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }
`;

/**
 * The TransparencyGridCanvas class renders a checkered transparency grid on an HTML canvas.
 *
 * Visual Behaviour:
 * - Renders a chessboard-like pattern where filled cells alternate with empty cells.
 *   For example:
 *     1 0 1 0 1
 *     0 1 0 1 0
 *     1 0 1 0 1
 *
 * - The grid is used to indicate transparency in graphics editors.
 * - Each cell's visual size is maintained at roughly 20px regardless of zoom, achieved by
 *   quantizing the cell size based on the current scaling factors and device pixel ratio.
 * - A transformation matrix (scale and translation) is applied so that as the user pans or zooms,
 *   the grid adapts its position and cell size to remain visually consistent.
 * - The checkered pattern is produced by iterating over grid indices and filling cells
 *   where the sum of the indices is even.
 *
 * Usage:
 * - Instantiate with a canvas element and options containing a transformation matrix and an optional color.
 * - Use setSize to set the canvas dimensions.
 * - Update the transformation with updateTransform as needed.
 * - Call draw to render the grid.
 */
export class TransparencyGrid_WGPU {
  private dpr: number;
  private transform: Transform2D;
  private color: [number, number, number, number];
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private uniformData: Float32Array = new Float32Array(12); // stepX, stepY, dpr, _pad0, tx, ty, sx, sy, r, g, b, a
  private adapterPromise: Promise<GPUAdapter | null>;
  private devicePromise: Promise<GPUDevice | null>;
  private initialized: boolean = false;
  width = 0;
  height = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    { transform, color = "rgba(150, 150, 150, 0.15)" }: TransparencyGridOptions
  ) {
    this.dpr = window.devicePixelRatio || 1;
    this.transform = transform;
    this.color = parseColor(color) ?? [0.6, 0.6, 0.6, 0.15];
    // Start async initialization
    this.adapterPromise = navigator.gpu.requestAdapter();
    this.devicePromise = this.adapterPromise.then((adapter) =>
      adapter ? adapter.requestDevice() : null
    );
    this.initWebGPU();
  }

  private async initWebGPU() {
    const adapter = await this.adapterPromise;
    if (!adapter) return;
    const device = await this.devicePromise;
    if (!device) return;
    this.device = device;
    this.context = this.canvas.getContext(
      "webgpu"
    ) as unknown as GPUCanvasContext;
    if (!this.context) return;
    // Default format
    const format = navigator.gpu.getPreferredCanvasFormat
      ? navigator.gpu.getPreferredCanvasFormat()
      : "bgra8unorm";
    this.context.configure({
      device,
      format,
      alphaMode: "premultiplied",
    });
    // Shaders
    const shaderModule = device.createShaderModule({
      code: shader,
    });
    this.pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [{ format }],
      },
      primitive: {
        topology: "triangle-list",
      },
    });
    this.uniformBuffer = device.createBuffer({
      size: 12 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
    this.initialized = true;
    // Initial uniform upload
    this.updateUniforms();
    // Render grid once initialization is complete
    this.draw();
  }

  setSize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (this.context && this.device) {
      const format = navigator.gpu.getPreferredCanvasFormat
        ? navigator.gpu.getPreferredCanvasFormat()
        : "bgra8unorm";
      this.context.configure({
        device: this.device,
        format,
        alphaMode: "premultiplied",
      });
    }
    // Uniform buffer size is fixed, so no need to resize.
    this.updateUniforms();
  }

  updateTransform(transform: Transform2D) {
    this.transform = transform;
    this.updateUniforms();
  }

  private updateUniforms() {
    // Must be called after any change of transform, color, or size/dpr.
    const [[sx, , tx], [, sy, ty]] = this.transform;
    const targetVisualSize = 20;
    const stepX = quantize(targetVisualSize / (sx * this.dpr));
    const stepY = quantize(targetVisualSize / (sy * this.dpr));
    const [r, g, b, a] = this.color;
    this.uniformData[0] = stepX;
    this.uniformData[1] = stepY;
    this.uniformData[2] = this.dpr;
    this.uniformData[3] = 0; // padding
    this.uniformData[4] = tx;
    this.uniformData[5] = ty;
    this.uniformData[6] = sx;
    this.uniformData[7] = sy;
    this.uniformData[8] = r;
    this.uniformData[9] = g;
    this.uniformData[10] = b;
    this.uniformData[11] = a;
    if (this.device && this.uniformBuffer) {
      this.device.queue.writeBuffer(
        this.uniformBuffer,
        0,
        this.uniformData.buffer,
        this.uniformData.byteOffset,
        this.uniformData.byteLength
      );
    }
  }

  async draw() {
    if (!this.initialized) {
      // Try to initialize if not yet done
      await this.initWebGPU();
      if (!this.initialized) return;
    }
    if (!this.device || !this.context || !this.pipeline || !this.bindGroup)
      return;
    const device = this.device;
    const context = this.context;
    // Ensure uniforms are up to date
    this.updateUniforms();
    const encoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 1, g: 1, b: 1, a: 0 },
          loadOp: "clear" as GPULoadOp,
          storeOp: "store" as GPUStoreOp,
        },
      ],
    });
    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.draw(3, 1, 0, 0); // Fullscreen triangle
    renderPass.end();
    device.queue.submit([encoder.finish()]);
  }
}
