//! The UI layer — "ui-as-engine-nodes" (`crates/grida_editor/docs/ui.md`).
//!
//! Widgets are engine scene subtrees: the [`UiLayer`] owns a plain
//! [`grida::node::schema::Scene`] built from `Container` / `TextSpan` /
//! `Rectangle` nodes, laid out by the **engine's** layout
//! ([`grida::layout::engine::LayoutEngine`]) and measured through the
//! engine's geometry pass ([`grida::cache::scene::SceneCache`]). The
//! layer adds only what the engine lacks: widget identity, retained
//! state, focus, scrolling, and the preview/commit binding
//! (`UI-1`..`UI-7`).
//!
//! ## Rendering-path decision (design question 1)
//!
//! Candidates considered for drawing the UI over canvas content on one
//! surface:
//!
//! (a) a second full `Renderer` flushed after the content flush —
//!     rejected: `Renderer::flush` owns frame planning, camera change
//!     tracking and image caches; pointing two of them at one backend
//!     surface entangles their frame loops and clear/background
//!     behavior.
//! (b) **chosen** — build a grida `Scene` for the UI and paint it via
//!     the painter/`LayerList` path directly on the same canvas after
//!     the content flush, exactly where the overlay/devtools chrome
//!     draws (`UnknownTargetApplication::draw_and_flush_devtools_overlay`
//!     draws on `state.surface_mut().canvas()` after `renderer.flush()`).
//!     The layer keeps its own `SceneCache` (layout → geometry →
//!     effect tree → layers, the same sequence as
//!     `Renderer::load_scene`) and the shell paints it with
//!     `Painter::new_with_scene_cache(...).draw_layer_list(...)` — the
//!     identical paint path canvas content uses (`UI-1`), on the same
//!     window surface. Only public `grida` APIs are used; no engine
//!     changes were needed.
//!
//! Headless assertability: tests never need pixels — they assert on
//! the UI scene's node tree and the engine-computed geometry (the
//! scene-state plane of `crates/grida_editor/docs/harness.md`). Rendering glue
//! lives in the shell (feature `shell`); everything in this module is
//! feature-free.
//!
//! ## Input arbitration (design question 2)
//!
//! The shell routes pointer events **UI-first** (`SURF-1`
//! panel→chrome→content): [`UiLayer::pointer`] hit-tests widget bounds
//! from the engine's layout results in screen space and reports
//! `consumed`; unconsumed events fall through to the canvas
//! application. While a widget holds pointer capture (slider drag),
//! all pointer events route to it. Keyboard goes to the focused widget
//! first (`UI-3`), after the shell's command routing (primary-key
//! shortcuts) has priority. Wheel events over a UI region scroll the
//! topmost scroll container under the pointer; elsewhere they pan the
//! camera as before (`UI-6`).
//!
//! ## Scope, honestly
//!
//! This is a dev-only widget layer, not a general-purpose UI toolkit,
//! and not on a path to becoming one without a ground-up redesign of
//! both this layer and the engine's layout/overlay/input core. See
//! [`README.md`](./README.md) for the honest characterization and the
//! size of that gap.
//!
//! ## Rebuild, don't react
//!
//! On relevant change the affected widget subtree is rebuilt and
//! swapped ([`UiLayer::mount`] for a region, `rebuild_widget` for one
//! widget). Retained state ([`WidgetState`]) is keyed by [`WidgetId`]
//! and survives every rebuild (`UI-2`). There is no diffing and no
//! subscription graph; rebuild granularity is owned by the caller
//! (see [`properties`], which rebuilds per-widget on value change —
//! `PROP-7`).

pub mod bind;
pub mod field;
pub mod focus;
pub mod hierarchy;
pub mod menu;
pub mod popover;
pub mod properties;
pub mod scroll;
pub mod toolbar;
pub mod widget;
pub mod widgets;

use std::collections::HashMap;

use grida::cache::scene::SceneCache;
use grida::layout::engine::LayoutEngine;
use grida::layout::tree::TextMeasureProvider;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{NodeId, Scene, Size};
use grida::overlay::{Modifiers, SurfaceEvent};
use grida::resources::ByteStore;
use grida::runtime::font_repository::FontRepository;
use grida::runtime::image_repository::ImageRepository;
use grida::runtime::scene::collect_scene_font_families;
use grida::text_edit::session::KeyName;
use math2::rect::Rectangle;

use crate::ui::bind::Emission;
use crate::ui::focus::Focus;
use crate::ui::widget::{
    BuildCtx, RegistryEntry, UiResponse, Widget, WidgetEvent, WidgetId, WidgetState,
};

/// Result of feeding one input event to the UI layer.
#[derive(Debug, Default)]
pub struct UiInputResult {
    /// The event was consumed by the UI; it must not reach the canvas
    /// (`UI-5`).
    pub consumed: bool,
    /// Binding emissions to apply through [`bind::apply`].
    pub emissions: Vec<Emission>,
}

/// The UI layer: one UI scene, retained widget state, focus, and
/// input routing. See the module docs for the contracts it implements.
pub struct UiLayer {
    scene: Scene,
    cache: SceneCache,
    layout: LayoutEngine,
    fonts: FontRepository,
    images: ImageRepository,
    viewport: Size,
    states: HashMap<WidgetId, WidgetState>,
    widgets: Vec<Box<dyn Widget>>,
    registry: Vec<RegistryEntry>,
    focus: Focus,
    capture: Option<WidgetId>,
}

impl UiLayer {
    /// Create an empty layer for a logical-px viewport.
    pub fn new(viewport: Size) -> Self {
        let store = std::sync::Arc::new(std::sync::Mutex::new(ByteStore::new()));
        Self {
            scene: Scene {
                name: "ui".to_string(),
                graph: SceneGraph::new(),
                background_color: None,
            },
            cache: SceneCache::new(),
            layout: LayoutEngine::new(),
            fonts: FontRepository::new(store.clone()),
            images: ImageRepository::new(store),
            viewport,
            states: HashMap::new(),
            widgets: Vec::new(),
            registry: Vec::new(),
            focus: Focus::new(),
            capture: None,
        }
    }

    // -- queries (scene-state assertion plane) --------------------------------

    /// The UI scene (plain engine nodes, `UI-1`).
    pub fn scene(&self) -> &Scene {
        &self.scene
    }

    /// The engine caches (geometry for bounds assertions; layers for
    /// the shell's paint pass).
    pub fn cache(&self) -> &SceneCache {
        &self.cache
    }

    /// Fonts used for text measurement and painting.
    pub fn fonts(&self) -> &FontRepository {
        &self.fonts
    }

    /// Mutable fonts access (the shell registers embedded fonts).
    pub fn fonts_mut(&mut self) -> &mut FontRepository {
        &mut self.fonts
    }

    /// Image repository for the paint pass.
    pub fn images(&self) -> &ImageRepository {
        &self.images
    }

    /// The logical viewport.
    pub fn viewport(&self) -> Size {
        self.viewport
    }

    /// No widgets mounted.
    pub fn is_empty(&self) -> bool {
        self.registry.is_empty()
    }

    /// The focused widget (`UI-3`).
    pub fn focused(&self) -> Option<&WidgetId> {
        self.focus.focused()
    }

    /// The pointer-capturing widget, if any.
    pub fn captured(&self) -> Option<&WidgetId> {
        self.capture.as_ref()
    }

    /// Retained state for a widget id (`UI-2`).
    pub fn state(&self, id: &WidgetId) -> Option<&WidgetState> {
        self.states.get(id)
    }

    /// Mutable retained state for a widget id. Panels use this to drain
    /// widget output queues (the tree's outbox) and to write layer-owned
    /// state the panel legitimately drives (reveal expansion,
    /// scroll-into-view — `HIER-4`). Rebuild after writing so the built
    /// scene reflects the new state.
    pub fn state_mut(&mut self, id: &WidgetId) -> Option<&mut WidgetState> {
        self.states.get_mut(id)
    }

    /// Insert (or overwrite) retained state for a widget id, ahead of a
    /// mount — the reveal path seeds expansion before the first build.
    pub fn set_state(&mut self, id: WidgetId, state: WidgetState) {
        self.states.insert(id, state);
    }

    /// Root node of a widget's subtree (identity assertions, `PROP-7`).
    pub fn widget_root(&self, id: &WidgetId) -> Option<NodeId> {
        self.registry.iter().find(|e| e.id == *id).map(|e| e.node)
    }

    /// A widget's world rect from the engine's computed layout.
    pub fn widget_bounds(&self, id: &WidgetId) -> Option<Rectangle> {
        let entry = self.registry.iter().find(|e| e.id == *id)?;
        self.cache.geometry.get_world_bounds(&entry.node)
    }

    /// Whether a screen point is over any UI region (used for
    /// arbitration and `UI-5`: input over UI never reaches the canvas).
    pub fn contains(&self, point: [f32; 2]) -> bool {
        self.registry.iter().any(|e| self.entry_hit(e, point))
    }

    // -- mounting / rebuilds ----------------------------------------------------

    /// Resize the logical viewport and reflow.
    pub fn set_viewport(&mut self, viewport: Size) {
        self.viewport = viewport;
        self.rebuild_all();
    }

    /// Mount a widget tree (full rebuild of the layer's scene).
    /// Retained state, focus, and capture survive by identity (`UI-2`).
    /// Mount an empty vec to unmount everything.
    pub fn mount(&mut self, widgets: Vec<Box<dyn Widget>>) {
        self.widgets = widgets;
        self.rebuild_all();
    }

    /// Rebuild everything from the current widget configs ("rebuild,
    /// don't react").
    fn rebuild_all(&mut self) {
        seed_states(&self.widgets, &mut self.states);
        let mut graph = SceneGraph::new();
        let registry = {
            let mut ctx = BuildCtx::new(&mut graph, &self.states);
            for widget in &self.widgets {
                widget.build(&mut ctx, Parent::Root);
            }
            ctx.registry
        };
        self.scene.graph = graph;
        self.registry = registry;
        let order = self.focus_order();
        self.focus.retain(&order);
        if let Some(cap) = &self.capture
            && !self.registry.iter().any(|e| e.id == *cap)
        {
            self.capture = None;
        }
        self.reflow();
    }

    /// Replace one widget's config and rebuild only its subtree in
    /// place — the `PROP-7` granularity path. Falls back to a full
    /// rebuild for container widgets or root-level widgets. Returns
    /// `false` when the id is unknown.
    pub fn rebuild_widget(&mut self, id: &WidgetId, widget: Box<dyn Widget>) -> bool {
        if try_replace_in_tree(&mut self.widgets, id, widget).is_err() {
            return false;
        }
        let Some(entry_idx) = self.registry.iter().position(|e| e.id == *id) else {
            self.rebuild_all();
            return true;
        };
        let old_node = self.registry[entry_idx].node;
        let clip = self.registry[entry_idx].clip;

        // Containers (they register children too) and root-level
        // widgets take the wholesale path — correct over clever.
        let widget_ref = find_in_tree(&self.widgets, id).expect("just replaced");
        let parent = self.scene.graph.get_parent(&old_node);
        if !widget_ref.children().is_empty() || parent.is_none() {
            self.rebuild_all();
            return true;
        }
        let parent = parent.expect("checked above");
        let index = self
            .scene
            .graph
            .get_children(&parent)
            .and_then(|c| c.iter().position(|c| *c == old_node))
            .expect("invariant: registry node is its parent's child");

        self.scene
            .graph
            .remove_subtree(old_node)
            .expect("invariant: registry node exists");

        let new_entries = {
            let mut ctx = BuildCtx::new(&mut self.scene.graph, &self.states);
            if let Some(clip) = clip {
                ctx.push_clip(clip);
            }
            widget_ref.build(&mut ctx, Parent::NodeId(parent));
            ctx.registry
        };
        // A leaf widget registers exactly itself.
        debug_assert_eq!(new_entries.len(), 1);
        let new_node = new_entries[0].node;
        self.scene
            .graph
            .remove_child(&parent, &new_node)
            .and_then(|_| self.scene.graph.add_child_at(&parent, new_node, index))
            .expect("invariant: repositioning a just-appended child cannot fail");
        self.registry.splice(entry_idx..=entry_idx, new_entries);
        self.reflow();
        true
    }

    /// Recompute layout → geometry → effects → layers with the engine
    /// — the same sequence as `Renderer::load_scene`, minus a renderer.
    fn reflow(&mut self) {
        self.fonts
            .set_requested_families(collect_scene_font_families(&self.scene));
        {
            let mut paragraph_cache = self.cache.paragraph.borrow_mut();
            self.layout.compute(
                &self.scene,
                self.viewport,
                Some(TextMeasureProvider {
                    paragraph_cache: &mut paragraph_cache,
                    fonts: &self.fonts,
                }),
            );
        }
        self.cache.update_geometry_with_layout(
            &self.scene,
            &self.fonts,
            self.layout.result(),
            self.viewport,
        );
        self.cache.update_effect_tree(&self.scene);
        self.cache.update_layers(&self.scene);
    }

    // -- input routing ------------------------------------------------------------

    /// Feed a pointer event (the canvas's normalized vocabulary,
    /// `UI-7`); coordinates are taken from `screen_point`, in the same
    /// logical space the UI scene is built in.
    pub fn pointer(&mut self, event: &SurfaceEvent) -> UiInputResult {
        match event {
            SurfaceEvent::PointerDown {
                screen_point,
                modifiers,
                ..
            } => self.pointer_down(*screen_point, *modifiers),
            SurfaceEvent::PointerMove { screen_point, .. } => self.pointer_move(*screen_point),
            SurfaceEvent::PointerUp {
                screen_point,
                modifiers,
                ..
            } => self.pointer_up(*screen_point, *modifiers),
            _ => UiInputResult::default(),
        }
    }

    fn pointer_down(&mut self, point: [f32; 2], modifiers: Modifiers) -> UiInputResult {
        if let Some(result) = self.route_to_capture(WidgetEvent::PointerDown { point, modifiers }) {
            return result;
        }
        let over_ui = self.contains(point);
        let Some(entry_idx) = self.hit_interactive(point) else {
            // Panel background swallows the click (UI-5); a click
            // anywhere that is not a focusable control blurs focus.
            self.focus.clear();
            return UiInputResult {
                consumed: over_ui,
                emissions: Vec::new(),
            };
        };
        let entry = self.registry[entry_idx].clone();
        if entry.focusable {
            self.focus.set(entry.id.clone());
        } else if self.focus.focused() != Some(&entry.id) {
            self.focus.clear();
        }
        let response = self.dispatch(&entry.id, WidgetEvent::PointerDown { point, modifiers });
        // Anything over a UI region is consumed regardless of the
        // widget's own interest (UI-5).
        UiInputResult {
            consumed: true,
            emissions: response.emissions,
        }
    }

    fn pointer_move(&mut self, point: [f32; 2]) -> UiInputResult {
        if let Some(result) = self.route_to_capture(WidgetEvent::PointerMove { point }) {
            return result;
        }
        UiInputResult {
            consumed: self.contains(point),
            emissions: Vec::new(),
        }
    }

    fn pointer_up(&mut self, point: [f32; 2], modifiers: Modifiers) -> UiInputResult {
        if let Some(result) = self.route_to_capture(WidgetEvent::PointerUp { point, modifiers }) {
            return result;
        }
        UiInputResult {
            consumed: self.contains(point),
            emissions: Vec::new(),
        }
    }

    /// Feed a key event. Routed to the focused widget only (`UI-3`);
    /// Tab / Shift+Tab traverse the build-order tab ring.
    pub fn key(&mut self, key: &KeyName, modifiers: &Modifiers) -> UiInputResult {
        if self.registry.is_empty() {
            return UiInputResult::default();
        }
        if matches!(key, KeyName::Tab) {
            let order = self.focus_order();
            if order.is_empty() {
                return UiInputResult::default();
            }
            if modifiers.shift {
                self.focus.prev(&order);
            } else {
                self.focus.next(&order);
            }
            return UiInputResult {
                consumed: true,
                emissions: Vec::new(),
            };
        }
        let Some(focused) = self.focus.focused().cloned() else {
            return UiInputResult::default();
        };
        let response = self.dispatch(
            &focused,
            WidgetEvent::Key {
                key: key.clone(),
                modifiers: *modifiers,
            },
        );
        UiInputResult {
            consumed: response.consumed,
            emissions: response.emissions,
        }
    }

    /// Feed a wheel/scroll event. Routed to the topmost scroll
    /// viewport under the pointer (`UI-6`); returns `true` when the UI
    /// consumed it (over any UI region), so the shell only pans the
    /// camera when it returns `false`.
    pub fn wheel(&mut self, point: [f32; 2], dy: f32) -> bool {
        let target = self
            .registry
            .iter()
            .rev()
            .find(|e| e.scroll && self.entry_hit(e, point))
            .map(|e| (e.id.clone(), e.node));
        let Some((id, viewport_node)) = target else {
            return self.contains(point);
        };
        let max = self.scroll_max(viewport_node);
        if let Some(WidgetState::Scroll(s)) = self.states.get_mut(&id) {
            s.offset = (s.offset + dy).clamp(0.0, max);
        }
        self.rebuild_all();
        true
    }

    /// Clear keyboard focus (the shell calls this when the pointer
    /// goes down on the canvas).
    pub fn blur(&mut self) {
        self.focus.clear();
    }

    /// Grant a mounted widget the pointer capture explicitly — the
    /// popover grab: a modal overlay (the context menu) must receive
    /// every pointer event, including presses *outside* its bounds,
    /// so outside-press dismissal is the widget's own rule and
    /// nothing leaks to the canvas (`UI-5` stays whole). Ordinary
    /// capture is event-earned ([`UiResponse::capture`]); this is the
    /// mount-time form for overlays that open without a pointer
    /// event. No-op when the id is not mounted.
    pub fn set_capture(&mut self, id: WidgetId) {
        if self.registry.iter().any(|e| e.id == id) {
            self.capture = Some(id);
        }
    }

    // -- internals ----------------------------------------------------------------

    /// Max scroll offset = content height − viewport height (≥ 0).
    fn scroll_max(&self, viewport_node: NodeId) -> f32 {
        let viewport_h = self
            .cache
            .geometry
            .get_world_bounds(&viewport_node)
            .map(|b| b.height)
            .unwrap_or(0.0);
        let content_h = self
            .scene
            .graph
            .get_children(&viewport_node)
            .and_then(|c| c.first())
            .and_then(|content| self.cache.geometry.get_world_bounds(content))
            .map(|b| b.height)
            .unwrap_or(0.0);
        (content_h - viewport_h).max(0.0)
    }

    /// While captured, all pointer events go to the capturing widget.
    fn route_to_capture(&mut self, event: WidgetEvent) -> Option<UiInputResult> {
        let id = self.capture.clone()?;
        let response = self.dispatch(&id, event);
        Some(UiInputResult {
            consumed: true,
            emissions: response.emissions,
        })
    }

    /// Topmost interactive registry entry containing `point`,
    /// respecting scroll clips (`UI-6`).
    fn hit_interactive(&self, point: [f32; 2]) -> Option<usize> {
        (0..self.registry.len())
            .rev()
            .find(|&i| self.registry[i].interactive && self.entry_hit(&self.registry[i], point))
    }

    /// Point-in-entry test: inside the widget's world bounds AND
    /// inside its nearest scroll viewport's bounds (`UI-6`: a widget
    /// scrolled out of its container's clip is not hittable).
    fn entry_hit(&self, entry: &RegistryEntry, point: [f32; 2]) -> bool {
        let Some(bounds) = self.cache.geometry.get_world_bounds(&entry.node) else {
            return false;
        };
        if !bounds.contains_point(point) {
            return false;
        }
        if let Some(clip) = entry.clip {
            let Some(clip_bounds) = self.cache.geometry.get_world_bounds(&clip) else {
                return false;
            };
            if !clip_bounds.contains_point(point) {
                return false;
            }
        }
        true
    }

    /// Dispatch an event to a widget by id, against its retained state
    /// and engine-computed bounds; applies capture/release.
    fn dispatch(&mut self, id: &WidgetId, event: WidgetEvent) -> UiResponse {
        let Some(entry) = self.registry.iter().find(|e| e.id == *id) else {
            return UiResponse::ignored();
        };
        let bounds = self
            .cache
            .geometry
            .get_world_bounds(&entry.node)
            .unwrap_or(Rectangle {
                x: 0.0,
                y: 0.0,
                width: 0.0,
                height: 0.0,
            });
        let Some(widget) = find_in_tree(&self.widgets, id) else {
            return UiResponse::ignored();
        };
        let mut state = self
            .states
            .get(id)
            .cloned()
            .unwrap_or_else(|| widget.default_state());
        let response = widget.handle(&mut state, &event, bounds);
        self.states.insert(id.clone(), state);
        if response.capture {
            self.capture = Some(id.clone());
        }
        if response.release {
            self.capture = None;
        }
        // A widget whose interaction changed its own rendered structure
        // (a select opening/closing its list) asks the layer to rebuild
        // it, so the new subtree is built and laid out before the next
        // event hit-tests against it. Full rebuild — correct over
        // clever; retained state survives by identity (UI-2).
        if response.rebuild {
            self.rebuild_all();
        }
        response
    }

    /// Tab order: build order of focusable widgets (`UI-3`).
    fn focus_order(&self) -> Vec<WidgetId> {
        self.registry
            .iter()
            .filter(|e| e.focusable)
            .map(|e| e.id.clone())
            .collect()
    }
}

/// Insert default states for every widget id not yet seen (`UI-2`:
/// same identity ⇒ same state across rebuilds; new identity ⇒ fresh
/// default).
fn seed_states(widgets: &[Box<dyn Widget>], states: &mut HashMap<WidgetId, WidgetState>) {
    for widget in widgets {
        states
            .entry(widget.id().clone())
            .or_insert_with(|| widget.default_state());
        seed_states(widget.children(), states);
    }
}

/// Find a widget by id anywhere in the tree.
fn find_in_tree<'a>(widgets: &'a [Box<dyn Widget>], id: &WidgetId) -> Option<&'a dyn Widget> {
    for widget in widgets {
        if widget.id() == id {
            return Some(widget.as_ref());
        }
        if let Some(found) = find_in_tree(widget.children(), id) {
            return Some(found);
        }
    }
    None
}

/// Replace a widget config by id anywhere in the tree. Returns the
/// replacement back when the id was not found.
fn try_replace_in_tree(
    widgets: &mut Vec<Box<dyn Widget>>,
    id: &WidgetId,
    replacement: Box<dyn Widget>,
) -> Result<(), Box<dyn Widget>> {
    let mut replacement = replacement;
    for widget in widgets.iter_mut() {
        if widget.id() == id {
            *widget = replacement;
            return Ok(());
        }
        if let Some(children) = widget.children_mut() {
            match try_replace_in_tree(children, id, replacement) {
                Ok(()) => return Ok(()),
                Err(back) => replacement = back,
            }
        }
    }
    Err(replacement)
}
