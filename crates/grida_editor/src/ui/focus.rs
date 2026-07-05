//! Focus — a single focused widget, deterministic tab order, keyboard
//! routing to the focused widget only (`UI-3`).
//!
//! Tab order is the build order of focusable widgets (the registry
//! order the [`UiLayer`] collects during a rebuild). This module holds
//! only the focused identity; routing lives in the layer.
//!
//! [`UiLayer`]: crate::ui::UiLayer

use crate::ui::widget::WidgetId;

/// The single keyboard focus (`UI-3`).
#[derive(Debug, Default)]
pub struct Focus {
    focused: Option<WidgetId>,
}

impl Focus {
    pub fn new() -> Self {
        Self::default()
    }

    /// The focused widget, if any.
    pub fn focused(&self) -> Option<&WidgetId> {
        self.focused.as_ref()
    }

    /// Focus a widget.
    pub fn set(&mut self, id: WidgetId) {
        self.focused = Some(id);
    }

    /// Clear focus.
    pub fn clear(&mut self) {
        self.focused = None;
    }

    /// Keep focus only if the focused id is still in `order` (called
    /// after rebuilds; identity-keyed survival is `UI-2`).
    pub fn retain(&mut self, order: &[WidgetId]) {
        if let Some(f) = &self.focused
            && !order.contains(f)
        {
            self.focused = None;
        }
    }

    /// Move focus to the next focusable id (wrapping). With no current
    /// focus, focuses the first.
    pub fn next(&mut self, order: &[WidgetId]) {
        self.step(order, 1);
    }

    /// Move focus to the previous focusable id (wrapping). With no
    /// current focus, focuses the last.
    pub fn prev(&mut self, order: &[WidgetId]) {
        self.step(order, -1);
    }

    fn step(&mut self, order: &[WidgetId], dir: isize) {
        if order.is_empty() {
            self.focused = None;
            return;
        }
        let next = match self
            .focused
            .as_ref()
            .and_then(|f| order.iter().position(|o| o == f))
        {
            Some(i) => {
                let len = order.len() as isize;
                ((i as isize + dir).rem_euclid(len)) as usize
            }
            None => {
                if dir >= 0 {
                    0
                } else {
                    order.len() - 1
                }
            }
        };
        self.focused = Some(order[next].clone());
    }
}
