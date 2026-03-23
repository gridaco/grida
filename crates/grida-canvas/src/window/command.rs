#[derive(Debug, Clone)]
pub enum ApplicationCommand {
    None,
    ZoomIn,
    ZoomOut,
    ZoomDelta { delta: f32 },
    Pan { tx: f32, ty: f32 },
    ToggleDebugMode,
    TryCopyAsPNG,
    SelectAll,
    DeselectAll,
    NextScene,
    PrevScene,
}

impl ApplicationCommand {
    /// Whether this command moves the camera (pan, zoom).
    pub fn is_camera_transform(&self) -> bool {
        matches!(
            self,
            Self::ZoomIn | Self::ZoomOut | Self::ZoomDelta { .. } | Self::Pan { .. }
        )
    }
}
