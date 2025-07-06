#[derive(Debug)]
pub enum ApplicationCommand {
    None,
    ZoomIn,
    ZoomOut,
    ZoomDelta { delta: f32 },
    Pan { tx: f32, ty: f32 },
    ToggleDebugMode,
}
