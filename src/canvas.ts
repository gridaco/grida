// import { CanvasKit, SkCanvas, } from "canvaskit-wasm/bin"
// import CanvasKitInit from "canvaskit-wasm/bin/canvaskit";
export async function draw(canvas: HTMLCanvasElement) {
    const CanvasKitInit = require('canvaskit-wasm/bin/canvaskit.js');
    CanvasKitInit({
        locateFile: (file: string) => {
            console.log(__dirname)
            return "canvaskit-wasm/canvaskit.wasm"
            // return __dirname + '/bin/' + file
        },
    }).then((CanvasKit: any) => {
        // Code goes here using CanvasKit
        const surface = CanvasKit.MakeCanvasSurface(canvas);

        const paint = new CanvasKit.SkPaint();
        paint.setColor(CanvasKit.Color(0.9, 0, 0, 1.0));
        paint.setStyle(CanvasKit.PaintStyle.Stroke);
        paint.setAntiAlias(true);
        const rr = CanvasKit.RRectXY(CanvasKit.LTRBRect(10, 60, 210, 260), 25, 15);

        // function draw(canvas: SkCanvas) {
        //     canvas.clear(CanvasKit.WHITE);
        //     canvas.drawRRect(rr, paint);
        // }

        surface.getCanvas().clear(CanvasKit.WHITE);
        surface.getCanvas().drawPaint(paint)
    });
    // const CanvasKit = await CanvasKitInit();

}
