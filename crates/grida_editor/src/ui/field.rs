//! `Field<T>` — the value a bound control receives to render
//! (`WID-6`, [widgets-inventory.md](../../../crates/grida_editor/docs/widgets-inventory.md)
//! doctrine 2): a concrete `Value`, `Mixed` (the selection
//! disagrees), or `Empty` (the auto / unset state, distinct from a
//! zero value).
//!
//! The panel resolves which of the three from the selection; the
//! widget renders it and never queries the document. A `Mixed` field
//! renders a distinct indicator and, on first edit, broadcasts the
//! entered value to every bound target in one commit (`WID-6`).
//! `Empty` is the spec's `auto` — a blank distinct from zero — and a
//! control renders it as a placeholder, committing an absolute value
//! only once the user supplies one.
//!
//! `Field` is a *display* value (what a widget shows), the dual of
//! [`crate::ui::bind::BindingValue`] (what a widget emits). New
//! widgets take `Field<T>` configs; the pre-field widgets
//! (`Number`, `Slider`, `Swatch`) migrate lazily as each is next
//! touched — there is no big-bang pass.

/// A bound value in one of three display states (`WID-6`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Field<T> {
    /// A concrete, agreed value.
    Value(T),
    /// The bound targets disagree — render the mixed indicator; the
    /// first edit broadcasts one value to all targets.
    Mixed,
    /// The auto / unset state — a blank distinct from zero.
    Empty,
}

impl<T> Field<T> {
    /// This field carries a concrete value.
    pub fn is_value(&self) -> bool {
        matches!(self, Field::Value(_))
    }

    /// This field is the mixed indicator.
    pub fn is_mixed(&self) -> bool {
        matches!(self, Field::Mixed)
    }

    /// This field is the empty / auto state.
    pub fn is_empty(&self) -> bool {
        matches!(self, Field::Empty)
    }

    /// The concrete value by reference, if any.
    pub fn get(&self) -> Option<&T> {
        match self {
            Field::Value(v) => Some(v),
            _ => None,
        }
    }
}

impl<T: Copy> Field<T> {
    /// The concrete value, if this is [`Field::Value`].
    pub fn value(self) -> Option<T> {
        match self {
            Field::Value(v) => Some(v),
            _ => None,
        }
    }

    /// The concrete value, or `fallback` for mixed / empty — the
    /// value a widget uses to seed an edit that starts from a mixed
    /// or blank state.
    pub fn value_or(self, fallback: T) -> T {
        self.value().unwrap_or(fallback)
    }
}

impl<T> From<T> for Field<T> {
    fn from(v: T) -> Self {
        Field::Value(v)
    }
}
