import { CanvasKit, SkCanvas } from "canvaskit-wasm"
import CanvasKitInit from "canvaskit-wasm/bin/canvaskit";

async function main() {

    const CanvasKit: CanvasKit = await CanvasKitInit().ready();

    const el = document.getElementById('main');
    const surface = CanvasKit.MakeCanvasSurface(el);


    const paint = new CanvasKit.SkPaint();
    paint.setColor(CanvasKit.Color(0.9, 0, 0, 1.0));
    paint.setStyle(CanvasKit.PaintStyle.Stroke);
    paint.setAntiAlias(true);
    const rr = CanvasKit.RRectXY(CanvasKit.LTRBRect(10, 60, 210, 260), 25, 15);

    function draw(canvas: SkCanvas) {
        canvas.clear(CanvasKit.WHITE);
        canvas.drawRRect(rr, paint);
    }

    surface.drawOnce(draw);
}

main();