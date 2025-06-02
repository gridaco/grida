import CanvasKitInit, {
  type Color,
  type CanvasKit,
  type Surface,
  Paint,
} from "canvaskit-wasm";
import type grida from "@grida/schema";
import cg from "@grida/cg";

const imageNode: grida.program.nodes.ImageNode = {
  type: "image",
  id: "1",
  name: "Image",
  active: true,
  locked: false,
  style: {},
  opacity: 1,
  rotation: 0,
  zIndex: 0,
  position: "absolute",
  left: 300,
  top: 300,
  width: 100,
  height: 100,
  fit: "contain",
  src: "/images/abstract-placeholder.jpg",
  cornerRadius: 0,
};

const textNode: grida.program.nodes.TextNode = {
  type: "text",
  id: "1",
  name: "Text",
  active: true,
  locked: false,
  style: {},
  fontFamily: "Arial",
  opacity: 1,
  rotation: 0,
  zIndex: 0,
  position: "absolute",
  width: 200,
  height: 100,
  textAlign: "left",
  textAlignVertical: "top",
  textDecoration: "none",
  fontSize: 16,
  fontWeight: 100,
  text: "Hello, world!",
};

const lineNode: grida.program.nodes.LineNode = {
  type: "line",
  id: "1",
  name: "Line",
  active: true,
  locked: false,
  height: 0,
  top: 50,
  left: 100,
  position: "absolute",
  stroke: { type: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
  strokeWidth: 1,
  strokeCap: "butt",
  width: 200,
  opacity: 1,
  zIndex: 0,
  rotation: 0,
};

const rectNode: grida.program.nodes.RectangleNode = {
  type: "rectangle",
  id: "1",
  name: "Rectangle",
  active: true,
  locked: false,
  position: "absolute",
  left: 100,
  top: 50,
  width: 200,
  height: 100,
  fill: { type: "solid", color: { r: 255, g: 0, b: 0, a: 1 } },
  stroke: { type: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
  strokeWidth: 4,
  cornerRadius: 12,
  opacity: 0.8,
  rotation: 15,
  zIndex: 0,
  strokeCap: "butt",
  effects: [],
};

const ellipseNode: grida.program.nodes.EllipseNode = {
  type: "ellipse",
  id: "1",
  name: "Ellipse",
  active: true,
  locked: false,
  position: "absolute",
  left: 100,
  top: 200,
  width: 100,
  height: 200,
  fill: { type: "solid", color: { r: 0, g: 0, b: 255, a: 1 } },
  stroke: { type: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
  strokeWidth: 4,
  opacity: 0.8,
  rotation: 15,
  zIndex: 0,
  strokeCap: "butt",
  effects: [],
};

export class CanvasKitRenderer {
  private kit: CanvasKit | null = null;
  private get $kit(): CanvasKit {
    return this.kit!;
  }
  private surface: Surface | null = null;
  private canvas: HTMLCanvasElement | null = null;

  private _fillPaint: Paint | null = null;
  private _strokePaint: Paint | null = null;
  private _textPaint: Paint | null = null;

  private get $fillPaint(): Paint {
    if (!this._fillPaint) {
      this._fillPaint = new this.$kit.Paint();
    }
    return this._fillPaint;
  }
  private get $strokePaint(): Paint {
    if (!this._strokePaint) {
      this._strokePaint = new this.$kit.Paint();
    }
    return this._strokePaint;
  }
  private get $textPaint(): Paint {
    if (!this._textPaint) {
      this._textPaint = new this.$kit.Paint();
    }
    return this._textPaint;
  }

  private __roboto_data: ArrayBuffer | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.__init();
  }

  private __init() {
    CanvasKitInit({
      locateFile: (file) =>
        "https://unpkg.com/canvaskit-wasm@latest/bin/" + file,
    }).then((CanvasKit) => {
      this.kit = CanvasKit;
      this.surface = this.kit.MakeWebGLCanvasSurface(this.canvas!);
      this._fillPaint = new this.$kit.Paint();
      this._strokePaint = new this.$kit.Paint();
      this._strokePaint.setStyle(this.$kit.PaintStyle.Stroke);
      const loadFont = fetch(
        "https://storage.googleapis.com/skia-cdn/misc/Roboto-Regular.ttf"
      ).then((response) => response.arrayBuffer());

      loadFont
        .then((roboto) => {
          this.__roboto_data = roboto;
        })
        .finally(() => {
          this.drawDemo();
        });
    });
  }

  private drawDemo() {
    if (!this.kit || !this.surface) return;
    const canvas = this.surface.getCanvas();

    // Clear white
    canvas.clear(this.kit.Color(255, 255, 255, 1));

    // Draw nodes
    this.$draw(rectNode);
    this.$draw(lineNode);
    this.$draw(ellipseNode);
    this.$draw(textNode);
    this.$draw(imageNode);

    // Don't flush here since image rendering is async
    // FIXME: add this after making image rendering async
    // this.surface.flush();
  }

  private $draw(node: grida.program.nodes.Node) {
    switch (node.type) {
      case "rectangle":
        this.drawRectangleNode(node as grida.program.nodes.RectangleNode);
        break;
      case "line":
        this.drawLineNode(node as grida.program.nodes.LineNode);
        break;
      case "ellipse":
        this.drawEllipseNode(node as grida.program.nodes.EllipseNode);
        break;
      case "text":
        this.drawTextNode(node as grida.program.nodes.TextNode);
        break;
      case "image":
        this.drawImageNode(node as grida.program.nodes.ImageNode);
        break;
      default:
        throw new Error("Unsupported node type");
    }
  }

  private $fill(p: cg.Paint | null): Paint {
    this.$fillPaint.setAntiAlias(true);

    if (!p) {
      this.$fillPaint.setStyle(this.$kit.PaintStyle.Fill);
      this.$fillPaint.setColor(this.$kit.Color(0, 0, 0, 0));
      return this.$fillPaint;
    }

    switch (p.type) {
      case "solid":
        this.$fillPaint.setStyle(this.$kit.PaintStyle.Fill);
        this.$fillPaint.setColor(
          this.$kit.Color(p.color.r, p.color.g, p.color.b, p.color.a)
        );
        return this.$fillPaint;
      default:
        throw new Error("Unsupported fill");
    }
  }

  private $stroke(p: cg.Paint | null, width: number): Paint {
    this.$strokePaint.setAntiAlias(true);

    if (!p) {
      this.$strokePaint.setStyle(this.$kit.PaintStyle.Stroke);
      this.$strokePaint.setStrokeWidth(width);
      this.$strokePaint.setColor(this.$kit.Color(0, 0, 0, 0));
      return this.$strokePaint;
    }
    switch (p.type) {
      case "solid":
        this.$strokePaint.setStyle(this.$kit.PaintStyle.Stroke);
        this.$strokePaint.setStrokeWidth(width);
        this.$strokePaint.setColor(
          this.$kit.Color(p.color.r, p.color.g, p.color.b, p.color.a)
        );
        return this.$strokePaint;
      default:
        throw new Error("Unsupported stroke");
    }
  }

  private drawRectangleNode(node: grida.program.nodes.RectangleNode) {
    if (!this.kit) return;
    if (!this.surface) return;
    const { left: x = 0, top: y = 0, width, height } = node;
    const paint = new this.kit.Paint();
    const innerRect = this.kit.LTRBRect(x, y, x + width, y + height);
    const rrect = this.kit.RRectXY(
      innerRect,
      typeof node.cornerRadius === "number" ? node.cornerRadius : 0,
      typeof node.cornerRadius === "number" ? node.cornerRadius : 0
    );

    const canvas = this.surface.getCanvas();
    // Apply rotation & opacity via save() / restore()
    canvas.restore();
    canvas.save();

    // move pivot to rect center, rotate, then restore pivot
    if (node.rotation) {
      const cx = x + width / 2;
      const cy = y + height / 2;
      canvas.translate(cx, cy);
      canvas.rotate(node.rotation, cx, cy);
      canvas.translate(-cx, -cy);
    }

    // Fill
    canvas.drawRRect(rrect, this.$fill(node.fill ?? null));

    // Stroke (if provided)
    canvas.drawRRect(
      rrect,
      this.$stroke(node.stroke ?? null, node.strokeWidth)
    );

    canvas.restore();
  }

  private drawLineNode(node: grida.program.nodes.LineNode) {
    if (!this.kit) return;
    if (!this.surface) return;
    const { left: x = 0, top: y = 0, width } = node;
    const canvas = this.surface.getCanvas();

    // Apply rotation & opacity via save() / restore()
    canvas.restore();
    canvas.save();

    // move pivot to line center, rotate, then restore pivot
    if (node.rotation) {
      const cx = x + width / 2;
      const cy = y;
      canvas.translate(cx, cy);
      canvas.rotate(node.rotation, cx, cy);
      canvas.translate(-cx, -cy);
    }

    // Draw the line
    canvas.drawLine(
      x,
      y,
      x + width,
      y,
      this.$stroke(node.stroke ?? null, node.strokeWidth)
    );

    canvas.restore();
  }

  private drawEllipseNode(node: grida.program.nodes.EllipseNode) {
    if (!this.kit) return;
    if (!this.surface) return;
    const { left: x = 0, top: y = 0, width, height } = node;
    const canvas = this.surface.getCanvas();

    // Apply rotation & opacity via save() / restore()
    canvas.restore();
    canvas.save();

    // move pivot to ellipse center, rotate, then restore pivot
    if (node.rotation) {
      const cx = x + width / 2;
      const cy = y + height / 2;
      canvas.translate(cx, cy);
      canvas.rotate(node.rotation, cx, cy);
      canvas.translate(-cx, -cy);
    }

    // Create an oval path
    const oval = new this.kit.Path();
    oval.addOval(this.kit.LTRBRect(x, y, x + width, y + height));

    // Fill
    canvas.drawPath(oval, this.$fill(node.fill ?? null));

    // Stroke (if provided)
    canvas.drawPath(oval, this.$stroke(node.stroke ?? null, node.strokeWidth));

    // Clean up
    oval.delete();

    canvas.restore();
  }

  private drawTextNode(node: grida.program.nodes.TextNode) {
    if (!this.kit) return;
    if (!this.surface) return;
    const { left: x = 0, top: y = 0, width = 0, height = 0 } = node;
    const canvas = this.surface.getCanvas();

    // Apply rotation & opacity via save() / restore()
    canvas.restore();
    canvas.save();

    // move pivot to text center, rotate, then restore pivot
    if (node.rotation) {
      const cx = x + (width as number) / 2;
      const cy = y + (height as number) / 2;
      canvas.translate(cx, cy);
      canvas.rotate(node.rotation, cx, cy);
      canvas.translate(-cx, -cy);
    }

    const fontMgr = this.kit.FontMgr.FromData(this.__roboto_data!);
    const paraStyle = new this.kit.ParagraphStyle({
      textStyle: {
        color: this.kit.BLACK,
        fontFamilies: ["Roboto"],
        fontSize: 28,
      },
      textAlign: this.kit.TextAlign.Left,
    });
    const text = String(node.text || "");
    const builder = this.kit.ParagraphBuilder.Make(paraStyle, fontMgr!);
    builder.addText(text);
    const paragraph = builder.build();

    // Calculate text position based on alignment
    let textX = x;
    let textY = y;

    if (node.textAlign === "center") {
      textX = x + (width as number) / 2;
    } else if (node.textAlign === "right") {
      textX = x + (width as number);
    }

    if (node.textAlignVertical === "center") {
      textY = y + (height as number) / 2;
    } else if (node.textAlignVertical === "bottom") {
      textY = y + (height as number);
    }

    canvas.drawParagraph(paragraph, 10, 10);
    canvas.restore();
  }

  private __image_cache: Record<string, Uint8Array> = {};

  private async loadImage(src: string): Promise<Uint8Array> {
    if (!this.__image_cache) this.__image_cache = {};
    if (this.__image_cache[src]) return this.__image_cache[src];

    return new Promise((resolve, reject) => {
      fetch(src)
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to fetch image: ${src}`);
          return res.arrayBuffer();
        })
        .then((buffer) => {
          const uint8 = new Uint8Array(buffer);
          this.__image_cache[src] = uint8;
          resolve(uint8);
        })
        .catch(reject);
    });
  }

  private drawImageNode(node: grida.program.nodes.ImageNode) {
    if (!this.kit) return;
    if (!this.surface) return;
    const { left: x = 0, top: y = 0, width = 0, height = 0 } = node;
    const canvas = this.surface.getCanvas();

    // Apply rotation & opacity via save() / restore()
    canvas.restore();
    canvas.save();

    // move pivot to image center, rotate, then restore pivot
    if (node.rotation) {
      const cx = x + (width as number) / 2;
      const cy = y + (height as number) / 2;
      canvas.translate(cx, cy);
      canvas.rotate(node.rotation, cx, cy);
      canvas.translate(-cx, -cy);
    }

    // Load and draw image
    this.loadImage(String(node.src || ""))
      .then((img) => {
        // Create SkImage from ImageData
        const image = this.kit!.MakeImageFromEncoded(img)!;
        if (!image) {
          reportError("Failed to create SkImage from encoded data");
          return;
        }

        // Get image dimensions
        const imgWidth = image.width();
        const imgHeight = image.height();

        // Create destination rect (where to draw)
        const dstRect = this.kit!.LTRBRect(
          x,
          y,
          x + (width as number),
          y + (height as number)
        );

        // Create source rect (what part of image to draw)
        const srcRect = this.kit!.LTRBRect(0, 0, imgWidth, imgHeight);

        // Calculate source and destination rectangles based on fit
        let finalSrcRect = srcRect;
        let finalDstRect = dstRect;

        switch (node.fit) {
          case "contain": {
            // Calculate aspect ratios
            const imgAspect = imgWidth / imgHeight;
            const dstAspect = (width as number) / (height as number);

            if (imgAspect > dstAspect) {
              // Image is wider than destination
              const newHeight = (width as number) / imgAspect;
              const yOffset = ((height as number) - newHeight) / 2;
              finalDstRect = this.kit!.LTRBRect(
                x,
                y + yOffset,
                x + (width as number),
                y + yOffset + newHeight
              );
            } else {
              // Image is taller than destination
              const newWidth = (height as number) * imgAspect;
              const xOffset = ((width as number) - newWidth) / 2;
              finalDstRect = this.kit!.LTRBRect(
                x + xOffset,
                y,
                x + xOffset + newWidth,
                y + (height as number)
              );
            }
            break;
          }
          case "cover": {
            // Calculate aspect ratios
            const imgAspect = imgWidth / imgHeight;
            const dstAspect = (width as number) / (height as number);

            if (imgAspect > dstAspect) {
              // Image is wider than destination
              const newWidth = (height as number) * imgAspect;
              const xOffset = (newWidth - (width as number)) / 2;
              finalSrcRect = this.kit!.LTRBRect(
                xOffset,
                0,
                xOffset + (width as number),
                imgHeight
              );
            } else {
              // Image is taller than destination
              const newHeight = (width as number) / imgAspect;
              const yOffset = (newHeight - (height as number)) / 2;
              finalSrcRect = this.kit!.LTRBRect(
                0,
                yOffset,
                imgWidth,
                yOffset + (height as number)
              );
            }
            break;
          }
          case "none": {
            // Use original image dimensions
            finalDstRect = this.kit!.LTRBRect(
              x,
              y,
              x + imgWidth,
              y + imgHeight
            );
            break;
          }
        }

        // Draw image with corner radius if specified
        if (typeof node.cornerRadius === "number") {
          const rrect = this.kit!.RRectXY(
            finalDstRect,
            node.cornerRadius,
            node.cornerRadius
          );
          canvas.drawImageRect(
            image,
            finalSrcRect,
            rrect,
            this.$fillPaint,
            true
          );
        } else {
          canvas.drawImageRect(
            image,
            finalSrcRect,
            finalDstRect,
            this.$fillPaint,
            true
          );
        }

        // Clean up
        image.delete();

        // Flush the surface after drawing
        this.surface!.flush();
      })
      .catch((error) => {
        reportError("Failed to load image: " + error);
      });

    canvas.restore();
  }
}
