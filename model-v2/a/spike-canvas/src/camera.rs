//! The camera is HOST state, never document state — panning and zooming
//! write nothing (the model's read/write split made visible). View =
//! T(tx,ty) · S(zoom); world = view⁻¹(screen).

use anchor_lab::math::Affine;

#[derive(Debug, Clone, Copy)]
pub struct Camera {
    pub zoom: f32,
    pub tx: f32,
    pub ty: f32,
}

impl Camera {
    pub fn new() -> Camera {
        Camera {
            zoom: 1.0,
            tx: 0.0,
            ty: 0.0,
        }
    }

    pub fn view(&self) -> Affine {
        Affine {
            a: self.zoom,
            b: 0.0,
            c: 0.0,
            d: self.zoom,
            e: self.tx,
            f: self.ty,
        }
    }

    pub fn screen_to_world(&self, p: (f32, f32)) -> (f32, f32) {
        ((p.0 - self.tx) / self.zoom, (p.1 - self.ty) / self.zoom)
    }

    pub fn pan(&mut self, dx: f32, dy: f32) {
        self.tx += dx;
        self.ty += dy;
    }

    /// Zoom about a SCREEN point: the world point under the cursor stays
    /// under the cursor.
    pub fn zoom_about(&mut self, cursor: (f32, f32), factor: f32) {
        let z = (self.zoom * factor).clamp(0.05, 32.0);
        let k = z / self.zoom;
        self.tx = cursor.0 - k * (cursor.0 - self.tx);
        self.ty = cursor.1 - k * (cursor.1 - self.ty);
        self.zoom = z;
    }

    /// Fit a world rect into a viewport with a margin.
    pub fn fit(&mut self, world: (f32, f32, f32, f32), viewport: (f32, f32), margin: f32) {
        let (x, y, w, h) = world;
        let zx = (viewport.0 - 2.0 * margin) / w;
        let zy = (viewport.1 - 2.0 * margin) / h;
        self.zoom = zx.min(zy).clamp(0.05, 32.0);
        self.tx = (viewport.0 - w * self.zoom) / 2.0 - x * self.zoom;
        self.ty = (viewport.1 - h * self.zoom) / 2.0 - y * self.zoom;
    }
}
