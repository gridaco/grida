import CanvasKitInit, {
  type Color,
  type CanvasKit,
  type Surface,
  Paint,
} from "canvaskit-wasm";
import type grida from "@grida/schema";
import cg from "@grida/cg";

export class CanvasKitRenderer {
  private kit: CanvasKit | null = null;
  private get $kit(): CanvasKit {
    return this.kit!;
  }
  private surface: Surface | null = null;
  private canvas: HTMLCanvasElement | null = null;

  private nodeMap: Record<string, grida.program.nodes.Node> = {};
  private rootId: string | null = null;

  private _imageMap: Record<string, ReturnType<CanvasKit["MakeImageFromEncoded"]> | null> = {};
  private _imageLoading: Record<string, Promise<void> | undefined> = {};
  private _renderScheduled = false;

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
          this.requestRender();
        });
    });
  }

  public setDocument(
    nodes: Record<string, grida.program.nodes.Node>,
    rootId: string,
  ) {
    this.nodeMap = nodes;
    this.rootId = rootId;
    this.requestRender();
  }

  private requestRender() {
    if (this._renderScheduled) return;
    this._renderScheduled = true;
    requestAnimationFrame(() => {
      this._renderScheduled = false;
      this.render();
    });
  }

  private render() {
    if (!this.kit || !this.surface) return;
    const canvas = this.surface.getCanvas();
    canvas.save();
    canvas.clear(this.kit.Color(255, 255, 255, 1));
    if (this.rootId) {
      const root = this.nodeMap[this.rootId];
      if (root) {
        this.$draw(root);
      }
    }
    canvas.restore();
    this.surface.flush();
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
      case "container":
        this.drawContainerNode(node as grida.program.nodes.ContainerNode);
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
    if (!this.kit || !this.surface) return;
    const { left: x = 0, top: y = 0, width, height } = node;
    const innerRect = this.kit.LTRBRect(0, 0, width, height);
    const rrect = this.kit.RRectXY(
      innerRect,
      typeof node.cornerRadius === "number" ? node.cornerRadius : 0,
      typeof node.cornerRadius === "number" ? node.cornerRadius : 0
    );

    const canvas = this.surface.getCanvas();
    canvas.save();
    canvas.translate(x, y);

    // move pivot to rect center for rotation
    if (node.rotation) {
      const cx = width / 2;
      const cy = height / 2;
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
    if (!this.kit || !this.surface) return;
    const { left: x = 0, top: y = 0, width } = node;
    const canvas = this.surface.getCanvas();

    canvas.save();
    canvas.translate(x, y);

    if (node.rotation) {
      const cx = width / 2;
      const cy = 0;
      canvas.translate(cx, cy);
      canvas.rotate(node.rotation, cx, cy);
      canvas.translate(-cx, -cy);
    }

    canvas.drawLine(0, 0, width, 0, this.$stroke(node.stroke ?? null, node.strokeWidth));

    canvas.restore();
  }

  private drawEllipseNode(node: grida.program.nodes.EllipseNode) {
    if (!this.kit || !this.surface) return;
    const { left: x = 0, top: y = 0, width, height } = node;
    const canvas = this.surface.getCanvas();

    canvas.save();
    canvas.translate(x, y);

    if (node.rotation) {
      const cx = width / 2;
      const cy = height / 2;
      canvas.translate(cx, cy);
      canvas.rotate(node.rotation, cx, cy);
      canvas.translate(-cx, -cy);
    }

    const oval = new this.kit.Path();
    oval.addOval(this.kit.LTRBRect(0, 0, width, height));

    // Fill
    canvas.drawPath(oval, this.$fill(node.fill ?? null));

    // Stroke (if provided)
    canvas.drawPath(oval, this.$stroke(node.stroke ?? null, node.strokeWidth));

    // Clean up
    oval.delete();

    canvas.restore();
  }

  private drawTextNode(node: grida.program.nodes.TextNode) {
    if (!this.kit || !this.surface) return;
    const { left: x = 0, top: y = 0, width = 0, height = 0 } = node;
    const w = Number(width);
    const h = Number(height);
    const canvas = this.surface.getCanvas();

    canvas.save();
    canvas.translate(x, y);

    if (node.rotation) {
      const cx = w / 2;
      const cy = h / 2;
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
    let textX = 0;
    let textY = 0;

    if (node.textAlign === "center") {
      textX = w / 2;
    } else if (node.textAlign === "right") {
      textX = w;
    }

    if (node.textAlignVertical === "center") {
      textY = h / 2;
    } else if (node.textAlignVertical === "bottom") {
      textY = h;
    }

    canvas.drawParagraph(paragraph, textX, textY);
    canvas.restore();
  }

  private async loadImage(src: string): Promise<void> {
    if (this._imageMap[src]) return;
    if (this._imageLoading[src]) return this._imageLoading[src];

    this._imageLoading[src] = fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch image: ${src}`);
        return res.arrayBuffer();
      })
      .then((buffer) => {
        const uint8 = new Uint8Array(buffer);
        const img = this.$kit.MakeImageFromEncoded(uint8);
        if (img) {
          this._imageMap[src] = img;
        }
      })
      .finally(() => {
        delete this._imageLoading[src];
        this.requestRender();
      });

    return this._imageLoading[src];
  }

  private drawImageNode(node: grida.program.nodes.ImageNode) {
    if (!this.kit || !this.surface) return;
    const { left: x = 0, top: y = 0, width = 0, height = 0 } = node;
    const w = Number(width);
    const h = Number(height);
    const canvas = this.surface.getCanvas();

    canvas.save();
    canvas.translate(x, y);

    if (node.rotation) {
      const cx = w / 2;
      const cy = h / 2;
      canvas.translate(cx, cy);
      canvas.rotate(node.rotation, cx, cy);
      canvas.translate(-cx, -cy);
    }

    const src = String(node.src || "");
    const image = this._imageMap[src];
    if (!image) {
      this.loadImage(src);
      canvas.restore();
      return;
    }

    const imgWidth = image.width();
    const imgHeight = image.height();

        // Create destination rect (where to draw)
        const dstRect = this.kit!.LTRBRect(0, 0, w, h);

        // Create source rect (what part of image to draw)
        const srcRect = this.kit!.LTRBRect(0, 0, imgWidth, imgHeight);

        // Calculate source and destination rectangles based on fit
        let finalSrcRect = srcRect;
        let finalDstRect = dstRect;

        switch (node.fit) {
          case "contain": {
            // Calculate aspect ratios
            const imgAspect = imgWidth / imgHeight;
            const dstAspect = w / h;

            if (imgAspect > dstAspect) {
              // Image is wider than destination
              const newHeight = w / imgAspect;
              const yOffset = (h - newHeight) / 2;
              finalDstRect = this.kit!.LTRBRect(
                0,
                yOffset,
                w,
                yOffset + newHeight
              );
            } else {
              // Image is taller than destination
              const newWidth = h * imgAspect;
              const xOffset = (w - newWidth) / 2;
              finalDstRect = this.kit!.LTRBRect(
                xOffset,
                0,
                xOffset + newWidth,
                h
              );
            }
            break;
          }
          case "cover": {
            // Calculate aspect ratios
            const imgAspect = imgWidth / imgHeight;
            const dstAspect = w / h;

            if (imgAspect > dstAspect) {
              // Image is wider than destination
              const newWidth = h * imgAspect;
              const xOffset = (newWidth - w) / 2;
              finalSrcRect = this.kit!.LTRBRect(
                xOffset,
                0,
                xOffset + w,
                imgHeight
              );
            } else {
              // Image is taller than destination
              const newHeight = w / imgAspect;
              const yOffset = (newHeight - h) / 2;
              finalSrcRect = this.kit!.LTRBRect(
                0,
                yOffset,
                imgWidth,
                yOffset + h
              );
            }
            break;
          }
          case "none": {
            // Use original image dimensions
            finalDstRect = this.kit!.LTRBRect(0, 0, imgWidth, imgHeight);
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

    this.surface.flush();
    canvas.restore();
  }

  private drawContainerNode(node: grida.program.nodes.ContainerNode) {
    if (!this.kit || !this.surface) return;
    const { left: x = 0, top: y = 0, width = 0, height = 0 } = node;
    const w = Number(width);
    const h = Number(height);
    const canvas = this.surface.getCanvas();

    canvas.save();
    canvas.translate(x, y);

    if (node.rotation) {
      const cx = w / 2;
      const cy = h / 2;
      canvas.translate(cx, cy);
      canvas.rotate(node.rotation, cx, cy);
      canvas.translate(-cx, -cy);
    }

    const rect = this.kit.LTRBRect(0, 0, w, h);
    const rrect = this.kit.RRectXY(
      rect,
      typeof node.cornerRadius === "number" ? node.cornerRadius : 0,
      typeof node.cornerRadius === "number" ? node.cornerRadius : 0,
    );

    if (node.fill) {
      canvas.drawRRect(rrect, this.$fill(node.fill));
    }

    if (node.style?.overflow === "clip") {
      canvas.clipRRect(rrect, this.$kit.ClipOp.Intersect, true);
    }

    for (const childId of node.children || []) {
      const child = this.nodeMap[childId];
      if (child) {
        this.$draw(child);
      }
    }

    canvas.restore();
  }
}
