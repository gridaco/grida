//! The minimal widget set (`crates/grida_editor/docs/widgets.md`) — the
//! structural `panel` / `row` / `section_header` / `label` / `tree` and
//! the value controls `slider` / `swatch` / `number`. Looks are fixed
//! and hardcoded (dumbness doctrine: no styling system).

pub mod button;
pub mod color_picker;
pub mod label;
pub mod list_section;
pub mod number;
pub mod panel;
pub mod quad;
pub mod row;
pub mod section;
pub mod segmented;
pub mod select;
pub mod slider;
pub mod swatch;
pub mod text;
pub mod toggle;
pub mod tree;

pub use button::Button;
pub use color_picker::ColorPicker;
pub use label::Label;
pub use list_section::{ListEntry, ListSection};
pub use number::Number;
pub use panel::Panel;
pub use quad::Quad;
pub use row::Row;
pub use section::SectionHeader;
pub use segmented::{Segment, Segmented};
pub use select::Select;
pub use slider::Slider;
pub use swatch::{Swatch, SwatchAction};
pub use text::Text;
pub use toggle::{Toggle, ToggleLook};
pub use tree::Tree;
