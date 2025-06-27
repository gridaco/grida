#[derive(Debug)]
pub enum WindowCommand {
    ZoomIn,
    ZoomOut,
    ZoomDelta { delta: f32 },
    Pan { tx: f32, ty: f32 },
    Resize { width: u32, height: u32 },
    None,
}
