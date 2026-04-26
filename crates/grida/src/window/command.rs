use crate::query::Selector;

#[derive(Debug, Clone)]
pub enum ApplicationCommand {
    None,
    ZoomIn,
    ZoomOut,
    ZoomDelta {
        delta: f32,
    },
    Pan {
        tx: f32,
        ty: f32,
    },
    ToggleDebugMode,
    TryCopyAsPNG,
    SelectAll,
    DeselectAll,
    /// Navigate the selection using a hierarchy selector.
    ///
    /// Resolves the given [`Selector`] against the current selection and scene
    /// graph, then replaces the selection with the result.
    ///
    /// | Selector              | Key binding     | Behaviour                              |
    /// |-----------------------|-----------------|----------------------------------------|
    /// | `Selector::Children`  | Enter           | Select direct children                 |
    /// | `Selector::Parent`    | Shift+Enter     | Select parent                          |
    /// | `Selector::NextSibling` | Tab           | Next sibling (wraps)                   |
    /// | `Selector::PreviousSibling` | Shift+Tab | Previous sibling (wraps)               |
    /// | `Selector::Siblings`  | (Cmd+A helper)  | All siblings (or all nodes if empty)   |
    /// | `Selector::All`       | —               | Every node in the scene                |
    Select(Selector),
    /// Shift+1 — fit the entire scene into the viewport.
    ZoomToFit,
    /// Shift+2 — fit the current selection into the viewport.
    ZoomToSelection,
    /// Shift+0 — reset zoom to 100%.
    ZoomTo100,
    NextScene,
    PrevScene,
}

impl ApplicationCommand {
    /// Whether this command moves the camera (pan, zoom).
    pub fn is_camera_transform(&self) -> bool {
        matches!(
            self,
            Self::ZoomIn
                | Self::ZoomOut
                | Self::ZoomDelta { .. }
                | Self::Pan { .. }
                | Self::ZoomToFit
                | Self::ZoomToSelection
                | Self::ZoomTo100
        )
    }
}
