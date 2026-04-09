use crate::cg::color::CGColor;
use crate::cg::types::{Paint, TextAlignVertical};
use crate::devtools::{fps_overlay, ruler_overlay, stats_overlay, stroke_overlay, surface_overlay};
use crate::dummy;
use crate::export::{export_node_as, ExportAs, Exported};
use crate::io::io_grida::{self, JSONFlattenResult};
use crate::io::io_grida_patch::{self, TransactionApplyReport};
use crate::node::schema::*;
use crate::query::Hierarchy;
use crate::resources::{FontMessage, ImageMessage};
use crate::runtime::camera::Camera2D;
use crate::runtime::changes::ChangeFlags;
use crate::runtime::frame_loop::{FrameLoop, FrameQuality};
use crate::runtime::scene::{Backend, FrameFlushResult, Renderer};
use crate::sys::clock;
use crate::sys::timer::TimerMgr;
use crate::text;
use crate::text_edit::layout::ManagedTextLayout;
use crate::text_edit::TextLayoutEngine;
use crate::vectornetwork::VectorNetwork;
use crate::window::command::ApplicationCommand;

/// A no-op hierarchy for when no scene graph is loaded.
struct NoHierarchy;
impl Hierarchy for NoHierarchy {
    fn parent(&self, _id: &crate::node::schema::NodeId) -> Option<crate::node::schema::NodeId> {
        None
    }
}
#[cfg(not(target_arch = "wasm32"))]
use futures::channel::mpsc;
use math2::{rect, rect::Rectangle, transform::AffineTransform, vector2::Vector2};
use serde_json::Value;
use skia_safe::{Matrix, Surface};
use std::sync::Arc;

/// Target for bounding box queries.
pub enum BoundsTarget<'a> {
    /// A specific node by its user-facing ID.
    Node(&'a str),
    /// The active scene — returns the union of all scene root children's bounds.
    Scene,
}

impl<'a> BoundsTarget<'a> {
    /// Parse from a string, recognizing `"<scene>"` as the scene target.
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &'a str) -> Self {
        if s == "<scene>" {
            Self::Scene
        } else {
            Self::Node(s)
        }
    }
}

pub trait ApplicationApi {
    fn tick(&mut self, time: f64);
    fn resize(&mut self, width: u32, height: u32);
    fn redraw_requested(&mut self);

    /// Handle a [`ApplicationCommand`]. Returns `true` if the caller should exit.
    fn command(&mut self, cmd: ApplicationCommand) -> bool;
    //
    fn set_debug(&mut self, debug: bool);
    fn toggle_debug(&mut self);
    fn set_verbose(&mut self, verbose: bool);

    fn set_main_camera_transform(&mut self, transform: AffineTransform);

    /// returns the top-most node id at the point, if any.
    fn get_node_id_from_point(&mut self, point: Vector2) -> Option<String>;
    /// returns all node ids at the point, if any. ordered from top to bottom.
    fn get_node_ids_from_point(&mut self, point: Vector2) -> Vec<String>;
    /// returns all node ids intersecting with the envelope in canvas space.
    fn get_node_ids_from_envelope(&mut self, envelope: Rectangle) -> Vec<String>;
    fn get_node_absolute_bounding_box(&mut self, target: BoundsTarget) -> Option<Rectangle>;
    /// Return the structural node ID ancestry path from root to `id`, inclusive.
    ///
    /// The returned vector contains user-facing string IDs ordered as
    /// `[root, ..., parent, id]`. Returns `None` if the node does not exist in
    /// the scene.
    fn get_node_id_path(&self, id: &str) -> Option<Vec<String>>;
    fn export_node_as(&mut self, id: &str, format: ExportAs) -> Option<Exported>;
    fn to_vector_network(&mut self, id: &str) -> Option<JSONFlattenResult>;

    /// Enable or disable per-node layer compositing cache.
    fn runtime_renderer_set_layer_compositing(&mut self, enable: bool);

    /// Configure Pixel Preview scale.
    ///
    /// - 0: Disabled
    /// - 1: 1x
    /// - 2: 2x
    fn runtime_renderer_set_pixel_preview_scale(&mut self, scale: u8);

    /// Configure Pixel Preview strategy (stability policy).
    ///
    /// When `stable` is true, the renderer will use a deterministic mapping intended
    /// for design tooling (reduces shimmer across pan+zoom).
    fn runtime_renderer_set_pixel_preview_stable(&mut self, stable: bool);

    /// Configure render policy via flags.
    ///
    /// This is the primary host/WASM boundary for toggling renderer behavior
    /// without introducing feature-specific APIs.
    fn runtime_renderer_set_render_policy_flags(
        &mut self,
        flags: crate::runtime::render_policy::RenderPolicyFlags,
    );

    /// Skip layout computation during scene loading.
    ///
    /// When enabled, `load_scene` derives layout from schema positions/sizes
    /// instead of running the Taffy flexbox engine. Set **before** loading a scene.
    fn runtime_renderer_set_skip_layout(&mut self, skip: bool);

    /// Enable or disable rendering of tile overlays.
    fn devtools_rendering_set_show_tiles(&mut self, debug: bool);
    fn devtools_rendering_set_show_fps_meter(&mut self, show: bool);
    fn devtools_rendering_set_show_stats(&mut self, show: bool);
    fn devtools_rendering_set_show_hit_testing(&mut self, show: bool);
    fn devtools_rendering_set_show_ruler(&mut self, show: bool);

    fn highlight_strokes(
        &mut self,
        ids: Vec<String>,
        style: Option<crate::devtools::stroke_overlay::StrokeOverlayStyle>,
    );

    /// Load a scene from a `.grida1` JSON string using the `io_grida` parser.
    fn load_scene_grida1(&mut self, json: &str);

    /// Load a scene from `.grida` FlatBuffers binary bytes.
    fn load_scene_grida(&mut self, bytes: &[u8]);

    /// Switch to a previously loaded scene by its string ID.
    /// Only works after `load_scene_grida` has decoded a multi-scene document.
    fn switch_scene(&mut self, scene_id: &str);

    /// Return the IDs of all scenes decoded by the last `load_scene_grida` call.
    fn loaded_scene_ids(&self) -> Vec<String>;

    /// Apply a batch of scene transactions represented as JSON Patch operations.
    fn apply_document_transactions(
        &mut self,
        transactions: Vec<Vec<Value>>,
    ) -> Vec<TransactionApplyReport> {
        let _ = transactions;
        Vec::new()
    }

    // static demo scenes
    /// Load a simple demo scene with a few colored rectangles.
    fn load_dummy_scene(&mut self);
    /// Load a heavy scene useful for performance benchmarking.
    fn load_benchmark_scene(&mut self, cols: u32, rows: u32);
}

/// Host events
pub enum HostEvent {
    /// tick the clock for the application
    /// the Tick Hz should aim higher than the target FPS
    Tick,

    /// request a redraw
    RedrawRequest,

    /// notify image loaded
    ImageLoaded(ImageMessage),

    /// notify font loaded
    FontLoaded(FontMessage),

    /// load a new scene on the renderer
    LoadScene(Scene),
}

/// Host-agnostic callback for emitting [`HostEvent`]s back into the
/// platform-specific event loop.
pub type HostEventCallback = Arc<dyn Fn(HostEvent) + Send + Sync + 'static>;

#[derive(Default)]
pub struct Clipboard {
    pub(crate) data: Option<Vec<u8>>,
}

impl Clipboard {
    pub(crate) fn set_data(&mut self, data: Vec<u8>) {
        self.data = Some(data);
    }
}

/// Shared application logic independent of the final target.
pub struct UnknownTargetApplication {
    pub(crate) debug: bool,
    pub(crate) verbose: bool,
    pub(crate) clock: clock::EventLoopClock,
    pub(crate) timer: TimerMgr,
    pub(crate) clipboard: Clipboard,
    pub(crate) request_redraw: crate::runtime::scene::RequestRedrawCallback,
    pub(crate) renderer: Renderer,
    pub(crate) state: super::state::AnySurfaceState,
    pub(crate) input: super::input::InputState,
    pub(crate) document_json: Option<Value>,

    #[cfg(not(target_arch = "wasm32"))]
    pub(crate) image_rx: mpsc::UnboundedReceiver<ImageMessage>,
    #[cfg(not(target_arch = "wasm32"))]
    pub(crate) font_rx: mpsc::UnboundedReceiver<FontMessage>,
    pub(crate) last_frame_time: std::time::Instant,
    pub(crate) last_stats: Option<String>,

    pub(crate) highlight_strokes: Vec<crate::node::schema::NodeId>,
    pub(crate) highlight_stroke_style: Option<crate::devtools::stroke_overlay::StrokeOverlayStyle>,
    pub(crate) devtools_rendering_show_fps: bool,
    pub(crate) devtools_rendering_show_tiles: bool,
    pub(crate) devtools_rendering_show_stats: bool,

    pub(crate) devtools_rendering_show_ruler: bool,
    /// Unified frame lifecycle controller.
    frame_loop: FrameLoop,

    /// Bidirectional mapping between user string IDs and internal u64 IDs
    /// Maintained across scene loads to enable API calls with string IDs
    id_mapping: std::collections::HashMap<UserNodeId, NodeId>,
    id_mapping_reverse: std::collections::HashMap<NodeId, UserNodeId>,

    /// All decoded scenes from the last `load_scene_grida` call, keyed by string ID.
    /// Used by `switch_scene` to swap scenes without re-encoding/decoding the document.
    loaded_scenes: Vec<(String, crate::node::schema::Scene)>,

    /// When `false`, any platform-managed tick loop (e.g. Emscripten RAF) should stop.
    running: bool,
    /// When `true`, this application is driven by a platform-managed tick loop
    /// and should be freed by that loop after `running` becomes `false`.
    auto_tick: bool,

    /// Active text editing session and its layout engine, if any.
    ///
    /// The session and layout are stored together so the overlay renderer
    /// can access both during `draw_and_flush_devtools_overlay`.
    pub text_edit: Option<crate::text_edit_session::ActiveTextEdit>,

    /// Text editing decorations (caret + selection) for the overlay pass.
    /// `None` when no text editing session is active.
    text_edit_decorations:
        Option<crate::devtools::text_edit_decoration_overlay::TextEditingDecorations>,

    /// Canvas surface interaction state (hover, selection, gesture, cursor).
    pub(crate) surface: crate::surface::SurfaceState,

    /// Surface overlay rendering configuration.
    pub surface_overlay_config: crate::devtools::surface_overlay::SurfaceOverlayConfig,

    /// Overlay UI hit regions, rebuilt each frame during drawing.
    pub(crate) ui_hit_regions: crate::surface::ui::HitRegions,
}

impl ApplicationApi for UnknownTargetApplication {
    /// tick the application clock and timer.
    /// this can be called as many times as needed, from different sources (e.g. isolated timer thread, or raf, as the platform requires)
    fn tick(&mut self, time: f64) {
        self.clock.tick(time);
        self.timer.tick(self.clock.now());

        // Drive the text-edit clock from the host's wall time.
        // `time` is milliseconds (from performance.now()); the text-edit
        // Instant uses microseconds.  On native builds this is a no-op
        // (native Instant uses std::time::Instant directly).
        #[cfg(target_arch = "wasm32")]
        crate::text_edit::time::Instant::set_micros((time * 1000.0) as u64);
    }

    /// Update backing resources after a window resize.
    ///
    /// Only recreates the GPU surface and updates viewport/camera state.
    /// Cache invalidation is deferred to [`apply_changes`] at the start
    /// of the next frame — this avoids the expensive full-cache nuke
    /// that made resize drag janky (45ms/cycle → within 16ms budget).
    fn resize(&mut self, width: u32, height: u32) {
        self.state.resize(width as i32, height as i32);
        self.renderer.backend = self.state.backend();

        // Update viewport context (source of truth)
        self.renderer
            .update_viewport_size(width as f32, height as f32);

        // Update camera to match viewport
        self.renderer.camera.set_size(crate::node::schema::Size {
            width: width as f32,
            height: height as f32,
        });

        // Declare *what* changed; apply_changes() in frame() will handle
        // the correct invalidation (viewport caches only, no full nuke).
        self.renderer.mark_changed(ChangeFlags::VIEWPORT_SIZE);
        self.queue();
    }

    fn redraw_requested(&mut self) {
        self.redraw();
    }

    fn command(&mut self, cmd: ApplicationCommand) -> bool {
        // Invalidate hover on camera transforms — avoid hit-testing while
        // panning/zooming so the renderer can focus on fast redraws.
        // Hover is re-evaluated on the next PointerMove.
        if cmd.is_camera_transform() {
            self.surface.invalidate_hover();
        }

        match cmd {
            ApplicationCommand::ZoomIn => {
                let current_zoom = self.renderer.camera.get_zoom();
                self.renderer.camera.set_zoom(current_zoom * 1.2);
                self.queue();
                return true;
            }
            ApplicationCommand::ZoomOut => {
                let current_zoom = self.renderer.camera.get_zoom();
                self.renderer.camera.set_zoom(current_zoom / 1.2);
                self.queue();
                return true;
            }
            ApplicationCommand::ZoomDelta { delta } => {
                let current_zoom = self.renderer.camera.get_zoom();
                let zoom_factor = 1.0 + delta;
                if zoom_factor.is_finite() && zoom_factor > 0.0 {
                    self.renderer
                        .camera
                        .set_zoom_at(current_zoom * zoom_factor, self.input.cursor);
                }
                self.queue();
                return true;
            }
            ApplicationCommand::Pan { tx, ty } => {
                let zoom = self.renderer.camera.get_zoom();
                self.renderer
                    .camera
                    .translate(tx * (1.0 / zoom), ty * (1.0 / zoom));
                self.queue();
                return true;
            }
            ApplicationCommand::ToggleDebugMode => {
                self.toggle_debug();
                self.queue();
                return true;
            }
            ApplicationCommand::TryCopyAsPNG => {
                // Export the first selected node as PNG.
                if let Some(&internal_id) = self.surface.selection.as_slice().first() {
                    if let Some(user_id) = self.internal_id_to_user(internal_id) {
                        let exported = self.export_node_as(&user_id, ExportAs::png());
                        if let Some(exported) = exported {
                            self.clipboard.set_data(exported.data().to_vec());
                            return true;
                        }
                    }
                }
            }
            ApplicationCommand::SelectAll => {
                let all_ids: Vec<_> = self
                    .renderer
                    .get_cache()
                    .layers
                    .layers
                    .iter()
                    .map(|e| e.id)
                    .collect();
                self.surface.select_all(all_ids);
                if let Some(scene) = self.renderer.scene.as_ref() {
                    self.surface.prune_selection(&scene.graph);
                }
                self.queue();
                return true;
            }
            ApplicationCommand::DeselectAll => {
                if !self.surface.selection.is_empty() {
                    self.surface.selection.clear();
                    self.queue();
                    return true;
                }
            }
            ApplicationCommand::Select(selector) => {
                if let Some(scene) = self.renderer.scene.as_ref() {
                    let selection = self.surface.selection.as_slice();
                    let result = crate::query::query_select(&scene.graph, selection, selector);

                    if !result.is_empty() {
                        self.surface.selection.set(result);
                        self.queue();
                        return true;
                    }
                    // Children on a leaf node: try entering text edit mode.
                    if matches!(selector, crate::query::Selector::Children) && selection.len() == 1
                    {
                        let id = selection[0];
                        self.try_enter_text_edit(id);
                        self.queue();
                        return true;
                    }
                }
            }
            ApplicationCommand::ZoomToFit => {
                self.renderer.fit_camera_to_scene();
                self.queue();
                return true;
            }
            ApplicationCommand::ZoomToSelection => {
                let ids: Vec<_> = self.surface.selection.iter().copied().collect();
                if !ids.is_empty() {
                    self.renderer.fit_camera_to_nodes(&ids);
                    self.queue();
                    return true;
                }
            }
            ApplicationCommand::ZoomTo100 => {
                self.renderer.camera.set_zoom(1.0);
                self.queue();
                return true;
            }
            ApplicationCommand::None
            | ApplicationCommand::NextScene
            | ApplicationCommand::PrevScene => {}
        }

        false
    }

    fn set_debug(&mut self, debug: bool) {
        self.debug = debug;

        self.devtools_rendering_show_fps = self.debug;
        self.devtools_rendering_show_tiles = self.debug;
        self.devtools_rendering_show_stats = self.debug;

        self.devtools_rendering_show_ruler = self.debug;
    }

    fn toggle_debug(&mut self) {
        self.set_debug(!self.debug);
    }

    fn set_verbose(&mut self, verbose: bool) {
        self.verbose = verbose;
    }

    fn set_main_camera_transform(&mut self, transform: AffineTransform) {
        self.renderer.camera.set_transform(transform);
        self.queue();
    }

    fn get_node_ids_from_point(&mut self, point: Vector2) -> Vec<String> {
        let tester = self.get_hit_tester();
        let internal_ids = tester.hits(point);
        self.internal_ids_to_user(internal_ids)
    }

    fn get_node_id_from_point(&mut self, point: Vector2) -> Option<String> {
        let tester = self.get_hit_tester();
        tester
            .hit_first(point)
            .and_then(|id| self.internal_id_to_user(id))
    }

    fn get_node_ids_from_envelope(&mut self, envelope: Rectangle) -> Vec<String> {
        let tester = self.get_hit_tester();
        let internal_ids = tester.intersects(&envelope);
        self.internal_ids_to_user(internal_ids)
    }

    fn get_node_absolute_bounding_box(&mut self, target: BoundsTarget) -> Option<Rectangle> {
        match target {
            BoundsTarget::Scene => {
                let scene = self.renderer.scene.as_ref()?;
                let geometry = self.renderer.get_cache().geometry();
                let roots = scene.graph.roots();
                let mut union: Option<Rectangle> = None;
                for root_id in roots {
                    if let Some(bounds) = geometry.get_world_bounds(root_id) {
                        union = Some(match union {
                            Some(u) => rect::union(&[u, bounds]),
                            None => bounds,
                        });
                    }
                }
                union
            }
            BoundsTarget::Node(id) => {
                let internal_id = self.user_id_to_internal(id)?;
                self.renderer
                    .get_cache()
                    .geometry()
                    .get_world_bounds(&internal_id)
            }
        }
    }

    fn export_node_as(&mut self, id: &str, format: ExportAs) -> Option<Exported> {
        let internal_id = self.user_id_to_internal(id)?;

        // Image exports reuse the live renderer's warm SceneCache directly.
        // This renders only the target subtree — no scene clone, no layout
        // rebuild, no O(N) traversal. The warm cache is always consistent
        // with the scene (atomically rebuilt on load_scene).
        if format.is_format_image() {
            return self.export_node_as_image(&internal_id, format);
        }

        // PDF/SVG: still use the throwaway-renderer path (separate backend).
        if let Some(scene) = self.renderer.scene.as_ref() {
            return export_node_as(
                scene,
                &self.renderer.get_cache().geometry,
                &self.renderer.fonts,
                &self.renderer.images,
                &internal_id,
                format,
            );
        }
        None
    }

    fn to_vector_network(&mut self, id: &str) -> Option<JSONFlattenResult> {
        let internal_id = self.user_id_to_internal(id)?;
        if let Some(scene) = self.renderer.scene.as_ref() {
            if let Ok(node) = scene.graph.get_node(&internal_id) {
                /// Convert a positive corner radius to `Some`, zero/negative to `None`.
                fn nonzero_radius(r: f32) -> Option<f32> {
                    if r > 0.0 {
                        Some(r)
                    } else {
                        None
                    }
                }

                let result: Option<(VectorNetwork, Option<f32>)> = match node {
                    // Rectangle: always bake corner geometry into the VN.
                    // Skia's native rrect uses conic arcs while corner_path
                    // PathEffect uses a different curve type (quadratic Bézier).
                    // See `shape/corner.rs` for documentation.
                    Node::Rectangle(n) => Some((n.to_vector_network(), None)),
                    Node::Ellipse(n) => Some((n.to_vector_network(), None)),
                    // Polygon/star shapes use corner_path for rendering, so
                    // corner_radius is preserved as a rendering effect.
                    Node::Polygon(n) => {
                        Some((n.to_vector_network(), nonzero_radius(n.corner_radius)))
                    }
                    Node::RegularPolygon(n) => {
                        Some((n.to_vector_network(), nonzero_radius(n.corner_radius)))
                    }
                    Node::RegularStarPolygon(n) => {
                        Some((n.to_vector_network(), nonzero_radius(n.corner_radius)))
                    }
                    Node::Vector(n) => Some((n.network.clone(), None)),
                    // TODO: find a better way to clean this, as simple as Text::to_vector_network()
                    Node::TextSpan(n) => {
                        let paragraph = self.renderer.get_cache().paragraph.borrow_mut().paragraph(
                            &n.text,
                            &n.fills,
                            &n.text_align,
                            &n.text_style,
                            &n.max_lines,
                            &n.ellipsis,
                            n.width,
                            &self.renderer.fonts,
                            &self.renderer.images,
                            Some(&internal_id),
                        );

                        let layout_height = paragraph.borrow().height();
                        let y_offset = match n.height {
                            Some(h) => match n.text_align_vertical {
                                TextAlignVertical::Top => 0.0,
                                TextAlignVertical::Center => (h - layout_height) / 2.0,
                                TextAlignVertical::Bottom => h - layout_height,
                            },
                            None => 0.0,
                        };

                        let mut path = {
                            let mut para_ref = paragraph.borrow_mut();
                            text::paragraph_to_path(&mut para_ref)
                        };
                        if y_offset != 0.0 {
                            path = path.make_transform(&Matrix::translate((0.0, y_offset)));
                        }
                        Some((VectorNetwork::from(&path), None))
                    }
                    _ => None,
                };
                return result.map(|(vn, cr)| JSONFlattenResult {
                    vector_network: vn.into(),
                    corner_radius: cr,
                });
            }
        }
        None
    }

    fn get_node_id_path(&self, id: &str) -> Option<Vec<String>> {
        use crate::query::node_id_path;

        let internal_id = self.user_id_to_internal(id)?;
        let scene = self.renderer.scene.as_ref()?;
        let path = node_id_path(&scene.graph, internal_id);
        Some(
            path.into_iter()
                .filter_map(|nid| self.internal_id_to_user(nid))
                .collect(),
        )
    }

    fn runtime_renderer_set_layer_compositing(&mut self, enable: bool) {
        self.renderer.set_layer_compositing(enable);
        self.queue();
    }

    fn runtime_renderer_set_pixel_preview_scale(&mut self, scale: u8) {
        self.renderer.set_pixel_preview_scale(scale);
        self.renderer
            .mark_changed(crate::runtime::changes::ChangeFlags::CONFIG);
        self.queue();
    }

    fn runtime_renderer_set_pixel_preview_stable(&mut self, stable: bool) {
        self.renderer.set_pixel_preview_strategy_stable(stable);
        self.renderer
            .mark_changed(crate::runtime::changes::ChangeFlags::CONFIG);
        self.queue();
    }

    fn runtime_renderer_set_render_policy_flags(
        &mut self,
        flags: crate::runtime::render_policy::RenderPolicyFlags,
    ) {
        let policy = crate::runtime::render_policy::RenderPolicy::from_flags(flags);
        self.renderer.set_render_policy(policy);
        self.renderer
            .mark_changed(crate::runtime::changes::ChangeFlags::CONFIG);
        self.queue();
    }

    fn runtime_renderer_set_skip_layout(&mut self, skip: bool) {
        self.renderer.set_skip_layout(skip);
    }

    fn devtools_rendering_set_show_tiles(&mut self, debug: bool) {
        self.devtools_rendering_show_tiles = debug;
    }

    fn devtools_rendering_set_show_fps_meter(&mut self, show: bool) {
        self.devtools_rendering_show_fps = show;
    }

    fn devtools_rendering_set_show_stats(&mut self, show: bool) {
        self.devtools_rendering_show_stats = show;
    }

    fn devtools_rendering_set_show_hit_testing(&mut self, _show: bool) {
        // Legacy hit overlay removed — surface overlay handles hover feedback.
    }

    fn devtools_rendering_set_show_ruler(&mut self, show: bool) {
        self.devtools_rendering_show_ruler = show;
    }

    fn highlight_strokes(
        &mut self,
        ids: Vec<String>,
        style: Option<crate::devtools::stroke_overlay::StrokeOverlayStyle>,
    ) {
        // Convert user string IDs to internal u64 IDs
        self.highlight_strokes = ids
            .into_iter()
            .filter_map(|user_id| self.user_id_to_internal(&user_id))
            .collect();
        self.highlight_stroke_style = style;
        self.queue();
    }

    fn load_scene_grida1(&mut self, json: &str) {
        match serde_json::from_str::<Value>(json) {
            Ok(value) => self.load_scene_from_value(value),
            Err(err) => eprintln!("failed to parse scene json: {}", err),
        }
    }

    fn load_scene_grida(&mut self, bytes: &[u8]) {
        use crate::io::io_grida_file;
        match io_grida_file::decode_with_id_map(bytes) {
            Ok(result) => {
                // Build id mappings from the decode result
                let mut string_to_internal = std::collections::HashMap::new();
                let mut internal_to_string = std::collections::HashMap::new();
                for (internal_id, string_id) in &result.id_map {
                    string_to_internal.insert(string_id.clone(), *internal_id);
                    internal_to_string.insert(*internal_id, string_id.clone());
                }
                self.id_mapping = string_to_internal;
                self.id_mapping_reverse = internal_to_string;

                // Store all decoded scenes. The caller is responsible for
                // calling switch_scene() to activate the desired scene.
                self.loaded_scenes = result
                    .scene_ids
                    .iter()
                    .zip(result.scenes)
                    .map(|(id, scene)| (id.clone(), scene))
                    .collect();

                if self.loaded_scenes.is_empty() {
                    eprintln!("load_scene_grida: no scenes in FlatBuffers data");
                }
            }
            Err(err) => eprintln!("failed to decode .grida FlatBuffers: {:?}", err),
        }
    }

    fn switch_scene(&mut self, scene_id: &str) {
        if let Some(pos) = self.loaded_scenes.iter().position(|(id, _)| id == scene_id) {
            let (_, scene) = self.loaded_scenes[pos].clone();
            self.renderer.load_scene(scene);
            self.queue();
        } else {
            eprintln!(
                "switch_scene: scene '{}' not found (available: {:?})",
                scene_id,
                self.loaded_scenes
                    .iter()
                    .map(|(id, _)| id)
                    .collect::<Vec<_>>()
            );
        }
    }

    fn loaded_scene_ids(&self) -> Vec<String> {
        self.loaded_scenes
            .iter()
            .map(|(id, _)| id.clone())
            .collect()
    }

    fn apply_document_transactions(
        &mut self,
        transactions: Vec<Vec<Value>>,
    ) -> Vec<TransactionApplyReport> {
        self.process_document_transactions(transactions)
    }

    fn load_dummy_scene(&mut self) {
        let scene = dummy::create_dummy_scene();
        self.renderer.load_scene(scene);
    }

    fn load_benchmark_scene(&mut self, cols: u32, rows: u32) {
        let scene = dummy::create_benchmark_scene(cols, rows);
        self.renderer.load_scene(scene);
    }
}

impl UnknownTargetApplication {
    /// Export a node as a raster image (PNG/JPEG/WEBP/BMP).
    ///
    /// Renders only the target subtree using the live renderer's warm
    /// `SceneCache`. This is safe because:
    /// - The cache is atomically rebuilt on every `load_scene` call
    /// - World transforms, clip paths, and effect tree are read from the
    ///   shared geometry cache (correct for any node)
    /// - Ancestor opacity is intentionally NOT propagated (standard export
    ///   behavior — the node is exported as if it were the root)
    /// - The Painter is stateless; no inter-node state leaks
    fn export_node_as_image(&self, node_id: &NodeId, format: ExportAs) -> Option<Exported> {
        use crate::export::{ExportAsImage, ExportSize};
        use skia_safe::EncodedImageFormat;

        let constraints = format.get_constraints();
        let geometry = &self.renderer.get_cache().geometry;
        let rect = geometry.get_render_bounds(node_id)?;

        let size = ExportSize {
            width: rect.width,
            height: rect.height,
        };
        let size = size.apply_constraints(constraints);

        let image = self
            .renderer
            .export_node_image(node_id, rect, (size.width, size.height))?;

        // Encode
        let img_format: ExportAsImage = format.try_into().ok()?;
        let skfmt: EncodedImageFormat = img_format.clone().into();
        let quality = match &img_format {
            ExportAsImage::JPEG(cfg) => cfg.quality,
            ExportAsImage::WEBP(cfg) => cfg.quality,
            _ => None,
        };
        let data = image.encode(None, skfmt, quality)?;

        match img_format {
            ExportAsImage::PNG(_) => Some(Exported::PNG(data.to_vec())),
            ExportAsImage::JPEG(_) => Some(Exported::JPEG(data.to_vec())),
            ExportAsImage::WEBP(_) => Some(Exported::WEBP(data.to_vec())),
            ExportAsImage::BMP(_) => Some(Exported::BMP(data.to_vec())),
        }
    }

    /// Returns image refs that were needed during the last render but not found.
    /// Only returns refs not yet reported in a previous call.
    pub fn drain_missing_images(&mut self) -> Vec<String> {
        self.renderer.drain_missing_images()
    }

    /// Mark whether this application is driven by a platform-managed tick loop
    /// (e.g. Emscripten RAF).
    pub fn set_auto_tick(&mut self, enabled: bool) {
        self.auto_tick = enabled;
    }

    pub fn auto_tick(&self) -> bool {
        self.auto_tick
    }

    /// Request the platform-managed tick loop (if any) to stop.
    pub fn request_stop(&mut self) {
        self.running = false;
    }

    pub fn running(&self) -> bool {
        self.running
    }

    pub fn renderer(&self) -> &Renderer {
        &self.renderer
    }

    pub fn renderer_mut(&mut self) -> &mut Renderer {
        &mut self.renderer
    }

    pub fn set_renderer_backend(&mut self, backend: Backend) {
        self.renderer.backend = backend;
    }

    pub fn surface_mut_ptr(&mut self) -> *mut Surface {
        self.state.surface_mut_ptr()
    }

    pub fn set_cursor_position(&mut self, position: [f32; 2]) {
        self.input.cursor = position;
    }

    /// Current cursor position in screen coordinates.
    pub fn input_cursor(&self) -> [f32; 2] {
        self.input.cursor
    }

    /// Dispatch a surface event (hover, select, gesture) and return what changed.
    ///
    /// The caller provides screen-space coordinates; this method handles the
    /// camera transform and hit-tester construction internally.
    pub fn surface_dispatch(
        &mut self,
        event: crate::surface::SurfaceEvent,
    ) -> crate::surface::SurfaceResponse {
        let (_hit_tester, response) = if let Some(scene) = self.renderer.scene.as_ref() {
            let ht = crate::hittest::HitTester::with_graph(self.renderer.get_cache(), &scene.graph);
            let r = self
                .surface
                .dispatch(event, &ht, &scene.graph, &self.ui_hit_regions);
            (ht, r)
        } else {
            let ht = crate::hittest::HitTester::new(self.renderer.get_cache());
            let r = self
                .surface
                .dispatch(event, &ht, &NoHierarchy, &self.ui_hit_regions);
            (ht, r)
        };
        if response.needs_redraw {
            self.queue();
        }
        response
    }

    // ── Query API ─────────────────────────────────────────────────────
    //
    // High-level read-only queries for the host / editor layer.
    // These hide cache and hit-tester internals behind the UTA boundary.

    /// Hit-test a canvas-space point against the scene content.
    /// Returns the topmost node ID at that point, or `None`.
    pub fn hit_test_point(&self, canvas_point: [f32; 2]) -> Option<crate::node::schema::NodeId> {
        if let Some(scene) = self.renderer.scene.as_ref() {
            let ht = crate::hittest::HitTester::with_graph(self.renderer.get_cache(), &scene.graph);
            ht.hit_first(canvas_point)
        } else {
            None
        }
    }

    /// Hit-test a canvas-space rectangle (marquee) against the scene.
    /// Returns the topmost ancestors that intersect the rect.
    pub fn hit_test_rect(&self, rect: &math2::rect::Rectangle) -> Vec<crate::node::schema::NodeId> {
        if let Some(scene) = self.renderer.scene.as_ref() {
            let ht = crate::hittest::HitTester::with_graph(self.renderer.get_cache(), &scene.graph);
            ht.intersects_topmost(rect)
        } else {
            Vec::new()
        }
    }

    /// Get the world-space bounding rect for a single node.
    pub fn get_node_bounds(
        &self,
        id: &crate::node::schema::NodeId,
    ) -> Option<math2::rect::Rectangle> {
        self.renderer.get_cache().geometry.get_world_bounds(id)
    }

    /// Get the union world-space bounding rect for a set of nodes.
    /// Returns `None` if no nodes have geometry.
    pub fn get_union_bounds(
        &self,
        ids: &[crate::node::schema::NodeId],
    ) -> Option<math2::rect::Rectangle> {
        let rects: Vec<_> = ids
            .iter()
            .filter_map(|id| self.renderer.get_cache().geometry.get_world_bounds(id))
            .collect();
        if rects.is_empty() {
            None
        } else {
            Some(math2::rect::union(&rects))
        }
    }

    /// Test whether a canvas-space point lies inside the union bounding
    /// rect of the given node IDs.
    pub fn point_in_node_bounds(
        &self,
        point: [f32; 2],
        ids: &[crate::node::schema::NodeId],
    ) -> bool {
        if let Some(scene) = self.renderer.scene.as_ref() {
            let ht = crate::hittest::HitTester::with_graph(self.renderer.get_cache(), &scene.graph);
            ht.point_in_selection_bounds(point, ids)
        } else {
            false
        }
    }

    /// Get the camera's current view matrix (for screen ↔ canvas conversion).
    pub fn view_matrix(&self) -> math2::transform::AffineTransform {
        self.renderer.camera.view_matrix()
    }

    /// Read-only access to the surface state.
    pub fn surface(&self) -> &crate::surface::SurfaceState {
        &self.surface
    }

    /// Mutable access to the surface state.
    ///
    /// Used by the host to configure flags like
    /// [`readonly`](crate::surface::SurfaceState::readonly) at startup.
    pub fn surface_mut(&mut self) -> &mut crate::surface::SurfaceState {
        &mut self.surface
    }

    // ---- Surface convenience methods ----
    // These handle screen→canvas coordinate conversion internally so that
    // hosts (native, wasm, emscripten) stay thin and consistent.

    /// Process a pointer-move at the given screen coordinates.
    ///
    /// Updates the cursor position, converts to canvas space, and dispatches
    /// through the surface event system (hover, gesture, cursor icon).
    pub fn surface_pointer_move(
        &mut self,
        screen_x: f32,
        screen_y: f32,
    ) -> crate::surface::SurfaceResponse {
        self.set_cursor_position([screen_x, screen_y]);
        let canvas_point = self
            .renderer
            .camera
            .screen_to_canvas_point([screen_x, screen_y]);
        let event = crate::surface::SurfaceEvent::PointerMove {
            canvas_point,
            screen_point: [screen_x, screen_y],
        };
        self.surface_dispatch(event)
    }

    /// Process a pointer-down at the given screen coordinates.
    pub fn surface_pointer_down(
        &mut self,
        screen_x: f32,
        screen_y: f32,
        button: crate::surface::PointerButton,
        modifiers: crate::surface::Modifiers,
    ) -> crate::surface::SurfaceResponse {
        let screen_point = [screen_x, screen_y];
        let canvas_point = self.renderer.camera.screen_to_canvas_point(screen_point);
        let event = crate::surface::SurfaceEvent::PointerDown {
            canvas_point,
            screen_point,
            button,
            modifiers,
        };
        self.surface_dispatch(event)
    }

    /// Process a pointer-up at the given screen coordinates.
    pub fn surface_pointer_up(
        &mut self,
        screen_x: f32,
        screen_y: f32,
        button: crate::surface::PointerButton,
        modifiers: crate::surface::Modifiers,
    ) -> crate::surface::SurfaceResponse {
        let screen_point = [screen_x, screen_y];
        let canvas_point = self.renderer.camera.screen_to_canvas_point(screen_point);
        let event = crate::surface::SurfaceEvent::PointerUp {
            canvas_point,
            screen_point,
            button,
            modifiers,
        };
        self.surface_dispatch(event)
    }

    // ---- Surface state accessors ----

    /// Currently hovered node, if any.
    pub fn surface_hovered_node(&self) -> Option<&crate::node::schema::NodeId> {
        self.surface.hover.hovered()
    }

    /// Currently selected node IDs.
    pub fn surface_selected_nodes(&self) -> &[crate::node::schema::NodeId] {
        self.surface.selection.as_slice()
    }

    /// Current cursor icon.
    pub fn surface_cursor(&self) -> crate::surface::CursorIcon {
        self.surface.cursor
    }

    /// Restore selection state (e.g. from undo/redo).
    pub fn surface_set_selection(&mut self, ids: Vec<crate::node::schema::NodeId>) {
        self.surface.select_all(ids);
        if let Some(scene) = self.renderer.scene.as_ref() {
            self.surface.prune_selection(&scene.graph);
        }
        self.queue();
    }

    /// Invalidate hover without hit-testing.
    ///
    /// Call during camera transforms (pan, zoom) to avoid wasting cycles.
    pub fn surface_invalidate_hover(&mut self) {
        let response = self.surface.invalidate_hover();
        if response.needs_redraw {
            self.queue();
        }
    }

    pub fn clipboard_bytes(&self) -> Option<&[u8]> {
        self.clipboard.data.as_deref()
    }

    pub fn tick_with_current_time(&mut self) {
        let now = self.clock.now() + self.last_frame_time.elapsed().as_secs_f64() * 1000.0;
        self.tick(now);
    }

    #[cfg(not(target_arch = "wasm32"))]
    pub fn notify_resource_loaded(&mut self) {
        self.resource_loaded();
    }

    #[cfg(target_arch = "wasm32")]
    pub fn notify_resource_loaded(&mut self) {}

    /// Create a new [`UnknownTargetApplication`] with a renderer configured for
    /// the given backend and camera. Each platform should supply a callback
    /// that requests a redraw on the host when invoked.
    pub fn new(
        state: super::state::AnySurfaceState,
        backend: Backend,
        camera: Camera2D,
        _target_fps: u32,
        #[cfg(not(target_arch = "wasm32"))] image_rx: mpsc::UnboundedReceiver<ImageMessage>,
        #[cfg(not(target_arch = "wasm32"))] font_rx: mpsc::UnboundedReceiver<FontMessage>,
        request_redraw: Option<crate::runtime::scene::RequestRedrawCallback>,
        options: crate::runtime::scene::RendererOptions,
    ) -> Self {
        let request_redraw = request_redraw.unwrap_or_else(|| std::sync::Arc::new(|| {}));
        let renderer =
            Renderer::new_with_options(backend, Some(request_redraw.clone()), camera, options);

        let debug = false;

        Self {
            debug,
            verbose: false,
            clock: clock::EventLoopClock::new(),
            clipboard: Clipboard::default(),
            request_redraw,
            renderer,
            state,
            input: super::input::InputState::default(),
            document_json: None,

            #[cfg(not(target_arch = "wasm32"))]
            image_rx,
            #[cfg(not(target_arch = "wasm32"))]
            font_rx,
            last_frame_time: std::time::Instant::now(),
            last_stats: None,
            highlight_strokes: Vec::new(),
            highlight_stroke_style: None,
            devtools_rendering_show_fps: debug,
            devtools_rendering_show_tiles: debug,
            devtools_rendering_show_stats: debug,
            devtools_rendering_show_ruler: debug,
            timer: TimerMgr::new(),
            frame_loop: FrameLoop::new(),
            id_mapping: std::collections::HashMap::new(),
            id_mapping_reverse: std::collections::HashMap::new(),
            loaded_scenes: Vec::new(),
            running: true,
            auto_tick: false,
            text_edit: None,
            text_edit_decorations: None,
            surface: crate::surface::SurfaceState::new(),
            surface_overlay_config: crate::devtools::surface_overlay::SurfaceOverlayConfig::default(
            ),
            ui_hit_regions: crate::surface::ui::HitRegions::new(),
        }
    }

    /// Create a new headless (CPU/raster) application.
    ///
    /// This is backend-agnostic core logic (no window/GL). Intended for
    /// Node/CLI export pipelines, but also usable in wasm.
    pub fn new_raster(
        width: i32,
        height: i32,
        options: crate::runtime::scene::RendererOptions,
    ) -> Box<Self> {
        #[cfg(not(target_arch = "wasm32"))]
        let (_image_tx, image_rx) = mpsc::unbounded::<ImageMessage>();
        #[cfg(not(target_arch = "wasm32"))]
        let (_font_tx, font_rx) = mpsc::unbounded::<FontMessage>();

        let camera = Camera2D::new(crate::node::schema::Size {
            width: width as f32,
            height: height as f32,
        });

        let mut state = super::state::AnySurfaceState::new_raster(width, height);
        let backend = state.backend();

        Box::new(Self::new(
            state,
            backend,
            camera,
            120,
            #[cfg(not(target_arch = "wasm32"))]
            image_rx,
            #[cfg(not(target_arch = "wasm32"))]
            font_rx,
            None,
            options,
        ))
    }

    /// Request a redraw from the host window using the provided callback.
    pub fn request_redraw(&self) {
        (self.request_redraw)();
    }

    fn load_scene_from_value(&mut self, value: Value) {
        match serde_json::from_value::<io_grida::JSONCanvasFile>(value.clone()) {
            Ok(file) => {
                if self.load_scene_from_canvas_file(file) {
                    self.document_json = Some(value);
                }
            }
            Err(err) => eprintln!("failed to deserialize scene json: {}", err),
        }
    }

    fn load_scene_from_canvas_file(&mut self, file: io_grida::JSONCanvasFile) -> bool {
        // Use IdConverter to handle string ID to u64 ID conversion
        let mut converter = crate::io::id_converter::IdConverter::new();

        match converter.convert_json_canvas_file(file) {
            Ok(scene) => {
                // Store the ID mappings for future API calls
                self.id_mapping = converter.string_to_internal.clone();
                self.id_mapping_reverse = converter.internal_to_string.clone();

                self.renderer.load_scene(scene);
                true
            }
            Err(err) => {
                eprintln!("Failed to convert canvas file: {}", err);
                false
            }
        }
    }

    /// Convert user string ID to internal u64 ID
    pub fn user_id_to_internal(&self, user_id: &str) -> Option<NodeId> {
        self.id_mapping.get(user_id).copied()
    }

    /// Convert internal u64 ID to user string ID
    pub fn internal_id_to_user(&self, internal_id: NodeId) -> Option<String> {
        self.id_mapping_reverse.get(&internal_id).cloned()
    }

    /// Convert multiple internal IDs to user IDs
    pub fn internal_ids_to_user(&self, internal_ids: Vec<NodeId>) -> Vec<String> {
        internal_ids
            .into_iter()
            .filter_map(|id| self.internal_id_to_user(id))
            .collect()
    }

    fn process_document_transactions(
        &mut self,
        transactions: Vec<Vec<Value>>,
    ) -> Vec<TransactionApplyReport> {
        let Some(current_document) = self.document_json.take() else {
            return transactions
                .into_iter()
                .map(|tx| TransactionApplyReport {
                    success: false,
                    applied: 0,
                    total: tx.len(),
                    error: Some("document not loaded".to_string()),
                })
                .collect();
        };

        let outcome = io_grida_patch::apply_transactions(current_document, transactions);
        if let Some(file) = outcome.scene_file {
            self.load_scene_from_canvas_file(file);
        }
        self.document_json = Some(outcome.document);
        outcome.reports
    }

    pub fn apply_document_transactions_json(
        &mut self,
        json: &str,
    ) -> Result<Vec<TransactionApplyReport>, serde_json::Error> {
        let transactions: Vec<Vec<Value>> = serde_json::from_str(json)?;
        Ok(self.process_document_transactions(transactions))
    }

    fn queue(&mut self) {
        // Invalidate the frame loop — it will handle unstable/stable
        // scheduling automatically via poll()/complete().
        let now = self.clock.now();
        self.frame_loop.invalidate(now);

        // Legacy path: also eager-queue an unstable frame on the renderer
        // so that the existing `redraw()` flow continues to work when
        // hosts call the old `redraw()` entry point.
        self.renderer.queue_unstable();
    }

    /// Unified frame entry point.
    ///
    /// Called once per host frame (e.g. from RAF on WASM, RedrawRequested on
    /// native). The engine decides whether to produce pixels and at what
    /// quality. Returns `true` if a frame was rendered.
    pub fn frame(&mut self, time: f64) -> bool {
        // 1. Advance host clock
        self.clock.tick(time);

        // 2. Fire non-frame timers (text blink, etc.)
        //    Timer callbacks may call invalidate() on the frame loop — that's
        //    fine, invalidate() just sets flags.
        self.timer.tick(self.clock.now());

        // Drive the text-edit clock from the host's wall time.
        #[cfg(target_arch = "wasm32")]
        crate::text_edit::time::Instant::set_micros((time * 1000.0) as u64);

        // 3. Process async resources (native only)
        #[cfg(not(target_arch = "wasm32"))]
        {
            self.process_image_queue();
            self.process_font_queue();
        }

        // 4. Poll frame loop — should we render?
        let now = self.clock.now();
        let quality = match self.frame_loop.poll(now) {
            Some(q) => q,
            None => return false, // idle
        };

        // 5. Build plan + render
        let __frame_start = std::time::Instant::now();

        // Prepare camera change for the renderer
        let camera_change = self.renderer.camera.change_kind();

        // Promote to stable quality when the camera didn't change — there is
        // no reason to render at reduced resolution for non-camera
        // invalidations (hit-test highlight, scene edits, etc.).
        let stable = quality == FrameQuality::Stable || !camera_change.any_changed();

        // Central invalidation dispatch: consume all accumulated changes
        // (viewport resize, font/image loads, text edits, config changes)
        // and camera state in one place. This replaces the ad-hoc
        // invalidate_compositor_on_zoom() call and all per-site cache nuking.
        let content_changed = self.renderer.apply_changes(camera_change, stable);

        // Warm the camera cache once per frame so view_matrix(), rect(), and
        // screen_to_canvas_point() are essentially free for the rest of this frame.
        self.renderer.camera.warm_cache();

        // 5a. Overlay-only fast path
        //
        // When neither scene data nor the camera changed (e.g. marquee drag,
        // hover highlight, selection change), the content layer is identical
        // to the previous frame. Restore it from the pan image cache and
        // skip the expensive frame-plan build + full draw.  The overlay is
        // still re-drawn below so marquee/selection visuals update correctly.
        //
        // Stable frames MUST skip this fast path.  On the web host the JS
        // side calls `redraw()` immediately after each camera command, which
        // consumes the camera change and renders an unstable frame.  When the
        // FrameLoop debounce expires and `poll()` returns `Stable`, there is
        // no camera change or data change left — but the pan-image-cache
        // still contains reduced-quality content from the last unstable
        // render.  Blitting it would satisfy the FrameLoop without ever
        // producing a full-quality frame, causing the canvas to never settle
        // unless the user triggers another explicit interaction (e.g. zoom).
        if quality != FrameQuality::Stable
            && !content_changed
            && !camera_change.any_changed()
            && self.renderer.blit_content_cache()
        {
            // Consume the camera change (no-op here, but keeps the contract).
            self.renderer.camera.consume_change();

            // Draw devtools overlays on top of the restored content.
            let _overlay_time = self.draw_and_flush_devtools_overlay();

            // Complete frame in the loop.
            self.frame_loop.complete(quality);
            self.last_frame_time = __frame_start;
            return true;
        }

        // Build frame plan lazily
        let rect = self.renderer.camera.rect();
        let zoom = self.renderer.camera.get_zoom();
        let plan = self
            .renderer
            .build_frame_plan(rect, zoom, stable, camera_change);

        // Consume the camera change so the next frame sees None
        // (unless a new mutation occurs before then).
        self.renderer.camera.consume_change();

        // Flush (draw + GPU submit)
        let stats = self.renderer.flush_with_plan(plan);

        // 6. Stats bookkeeping — update *before* the overlay so the overlay
        //    always shows the current frame's data (not the previous frame's).
        //    This matters for the stable frame: it's the last frame before idle,
        //    so the overlay text it paints is what the user sees until the next
        //    interaction.
        let __render_time = __frame_start.elapsed();
        if let Some(ref stats) = stats {
            self.update_stats(stats, __render_time);
        }

        // 7. Draw devtools overlays (uses the just-updated last_stats)
        let _overlay_time = self.draw_and_flush_devtools_overlay();

        // 8. Complete frame in the loop
        self.frame_loop.complete(quality);

        self.last_frame_time = __frame_start;

        true
    }

    #[cfg(not(target_arch = "wasm32"))]
    fn process_image_queue(&mut self) {
        let mut updated = false;
        while let Ok(Some(msg)) = self.image_rx.try_next() {
            let ok = if msg.src.starts_with("res://") || msg.src.starts_with("system://") {
                // Keyed by RID — preserve the caller's key
                if let Some((w, h, _)) = self.renderer.add_image_with_rid(&msg.data, &msg.src) {
                    println!("📝 Registered image: {} ({}x{})", msg.src, w, h);
                    true
                } else {
                    false
                }
            } else if msg.src.is_empty() {
                // No key — content-addressed (hash → res://images/{hash})
                let (hash, url, _, _, _) = self.renderer.add_image(&msg.data);
                println!("📝 Registered image: {} ({})", hash, url);
                true
            } else {
                // Arbitrary URL key (HTML embed images)
                if let Some((w, h)) = self.renderer.add_image_by_url(&msg.src, &msg.data) {
                    println!("📝 Registered HTML image: {} ({}x{})", msg.src, w, h);
                    true
                } else {
                    false
                }
            };
            updated |= ok;
        }
        if updated {
            self.renderer.mark_changed(ChangeFlags::IMAGE_LOADED);
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    fn process_font_queue(&mut self) {
        let mut updated = false;
        let mut font_count = 0;
        while let Ok(Some(msg)) = self.font_rx.try_next() {
            let family_name = &msg.family;
            self.renderer.add_font(family_name, &msg.data);

            if let Some(style) = &msg.style {
                println!(
                    "📝 Registered font with renderer: '{}' (style: {})",
                    family_name, style
                );
            } else {
                println!("📝 Registered font with renderer: '{}'", family_name);
            }
            font_count += 1;
            updated = true;
        }
        if updated {
            self.renderer.mark_changed(ChangeFlags::FONT_LOADED);
            if font_count > 0 {
                self.print_font_repository_info();
            }
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    fn print_font_repository_info(&self) {
        let font_repo = &self.renderer.fonts;
        let family_count = font_repo.family_count();
        let total_font_count = font_repo.total_font_count();

        println!("\n🔍 Font Repository Status:");
        println!("===========================");
        println!("Font families: {}", family_count);
        println!("Total fonts: {}", total_font_count);

        if family_count > 0 {
            println!("\n📋 Registered font families:");
            println!("---------------------------");
            for (i, (family_name, font_variants)) in font_repo.iter().enumerate() {
                println!(
                    "  {}. {} ({} variants)",
                    i + 1,
                    family_name,
                    font_variants.len()
                );
                for (j, hash) in font_variants.iter().enumerate() {
                    println!("     - Variant {}: hash {:016x}", j + 1, hash);
                }
            }
        }
        println!("✅ Font repository information printed");
    }

    fn get_hit_tester(&mut self) -> crate::hittest::HitTester<'_> {
        // Pass the scene graph if available to enable culling checks
        if let Some(scene) = self.renderer.scene.as_ref() {
            crate::hittest::HitTester::with_graph(self.renderer.get_cache(), &scene.graph)
        } else {
            crate::hittest::HitTester::new(self.renderer.get_cache())
        }
    }

    fn verbose(&self, msg: &str) {
        if self.verbose {
            println!("{}", msg);
        }
    }

    /// Hit test the current cursor position and store the result.
    #[cfg(not(target_arch = "wasm32"))]
    pub(crate) fn resource_loaded(&mut self) {
        self.process_image_queue();
        self.process_font_queue();
    }

    pub fn has_missing_fonts(&self) -> bool {
        self.renderer.fonts.has_missing()
    }

    pub fn list_missing_fonts(&self) -> Vec<String> {
        self.renderer.fonts.missing_families().into_iter().collect()
    }

    pub fn list_available_fonts(&self) -> Vec<String> {
        self.renderer.fonts.available_families()
    }

    pub fn set_default_fallback_fonts(&mut self, fonts: Vec<String>) {
        self.renderer.fonts.set_user_fallback_families(fonts);
        self.renderer.mark_changed(ChangeFlags::FONT_LOADED);
    }

    pub fn get_default_fallback_fonts(&self) -> Vec<String> {
        self.renderer.fonts.user_fallback_families()
    }

    pub fn report_missing_font(&mut self, family: &str) {
        self.renderer.fonts.mark_missing(family);
    }

    /// Register font bytes with the renderer.
    ///
    /// Multiple calls with the same `family` and different font files are
    /// supported (e.g. Regular, Bold, Italic per family).
    pub fn add_font(&mut self, family: &str, data: &[u8]) {
        self.renderer.add_font(family, data);
        self.renderer.mark_changed(ChangeFlags::FONT_LOADED);
    }

    /// Register image bytes with the renderer and return metadata.
    pub fn add_image(&mut self, data: &[u8]) -> (String, String, u32, u32, String) {
        self.renderer.add_image(data)
    }

    /// Register image bytes under a caller-specified RID (res:// or system://).
    pub fn add_image_with_rid(&mut self, data: &[u8], rid: &str) -> Option<(u32, u32, String)> {
        self.renderer.add_image_with_rid(data, rid)
    }

    /// Perform a redraw and print diagnostic information.
    pub fn redraw(&mut self) {
        let now = self.clock.now() + self.last_frame_time.elapsed().as_secs_f64() * 1000.0;
        self.tick(now);

        // Process pending changes (text edits, node mutations) before
        // flushing so the picture cache is invalidated and the new content
        // is re-recorded. In the frame() path this happens automatically;
        // in the redraw() path (native host) we must do it explicitly.
        //
        // Use unstable (stable=false) when a camera change is active — this
        // preserves the zoom/pan image caches and allows the fast blit paths.
        // Without this, every zoom frame would nuke the zoom cache and force
        // a full O(N) draw, causing ~3 FPS on large scenes.
        {
            let camera_change = self.renderer.camera.change_kind();
            let stable = !camera_change.any_changed();
            self.renderer.apply_changes(camera_change, stable);
        }

        let __frame_start = std::time::Instant::now();

        let stats = match self.renderer.flush() {
            FrameFlushResult::OK(stats) => stats,
            FrameFlushResult::NoFrame => {
                self.verbose("redraw/noframe: No frame to flush");
                return;
            }
            FrameFlushResult::NoScene => {
                self.verbose("redraw/noscene: No scene to flush");
                return;
            }
            FrameFlushResult::NoPending => {
                self.verbose("redraw/nopending: No pending frame to flush");
                return;
            }
        };

        // Consume the camera change so the next change_kind() returns None
        // (unless a new mutation occurs). This must happen here (not in
        // renderer.flush()) because on the web path both redraw() and frame()
        // may run: consuming in flush() would eat the change before frame()
        // sees it.  Completing the frame loop prevents frame() from rendering
        // a redundant second frame for the same invalidation.
        self.renderer.camera.consume_change();
        let quality = if stats.frame.stable {
            crate::runtime::frame_loop::FrameQuality::Stable
        } else {
            crate::runtime::frame_loop::FrameQuality::Unstable
        };
        self.frame_loop.complete(quality);

        // Build stats string BEFORE the overlay so the overlay shows the
        // current frame's data, not the previous frame's.
        let __total_frame_time_pre = __frame_start.elapsed();
        self.update_stats(&stats, __total_frame_time_pre);

        let _overlay_time = self.draw_and_flush_devtools_overlay();

        self.last_frame_time = __frame_start;
    }

    fn draw_and_flush_devtools_overlay(&mut self) -> std::time::Duration {
        let mut overlay_flush_time = std::time::Duration::ZERO;
        let overlay_draw_time: std::time::Duration;

        {
            let __overlay_start = std::time::Instant::now();
            let surface = self.state.surface_mut();
            let canvas = surface.canvas();
            if self.devtools_rendering_show_fps {
                fps_overlay::FpsMeter::draw(canvas, self.clock.hz() as f32);
            }
            if self.devtools_rendering_show_stats {
                if let Some(s) = self.last_stats.as_deref() {
                    stats_overlay::StatsOverlay::draw(canvas, s, &self.clock);
                }
            }

            if !self.highlight_strokes.is_empty() {
                stroke_overlay::StrokeOverlay::draw(
                    canvas,
                    &self.highlight_strokes,
                    &self.renderer.camera,
                    self.renderer.get_cache(),
                    &self.renderer.fonts,
                    self.highlight_stroke_style.as_ref(),
                );
            }
            // Text editing decorations (caret + selection) are rendered as
            // an overlay — unclipped by parent containers and with a
            // zoom-independent caret width.
            if let Some(ref deco) = self.text_edit_decorations {
                crate::devtools::text_edit_decoration_overlay::TextEditDecorationOverlay::draw(
                    canvas,
                    deco,
                    &self.renderer.camera,
                    self.renderer.get_cache(),
                );
            }
            // Surface interaction overlays (hover, selection, marquee)
            surface_overlay::SurfaceOverlay::draw(
                canvas,
                &self.surface,
                &self.renderer.camera,
                self.renderer.get_cache(),
                &self.surface_overlay_config,
                &self.renderer.fonts,
            );
            // Surface UI elements (size meter, frame titles, hit regions)
            crate::surface::ui::SurfaceUI::draw(
                canvas,
                &self.surface,
                &self.renderer.camera,
                self.renderer.get_cache(),
                &self.surface_overlay_config,
                &mut self.ui_hit_regions,
                self.renderer.scene.as_ref().map(|s| &s.graph),
                &self.renderer.fonts,
            );
            if self.devtools_rendering_show_ruler {
                ruler_overlay::Ruler::draw(canvas, &self.renderer.camera);
            }
            if let Some(mut ctx) = surface.recording_context() {
                if let Some(mut direct) = ctx.as_direct_context() {
                    let __overlay_flush_start = std::time::Instant::now();
                    direct.flush_and_submit();
                    overlay_flush_time = __overlay_flush_start.elapsed();
                }
            }
            overlay_draw_time = __overlay_start.elapsed();
        }
        overlay_flush_time + overlay_draw_time
    }

    /// Format and store the frame stats string for the devtools overlay.
    fn update_stats(
        &mut self,
        stats: &crate::runtime::scene::FrameFlushStats,
        wall_time: std::time::Duration,
    ) {
        let s = format!(
            "fps*: {:.0} | t: {:.2}ms | cam: {} | render: {:.1}ms | flush: {:.1}ms | frame: {:.1}ms | pred: {:.0}µs ({:.1}×) | list: {:.1}ms ({:?}) | draw: {:.1}ms | $:pic: {:?} ({:?} use) | $:geo: {:?} | comp: {:?} ({:?} hit, {:.1}KB) | live: {:?} | res: {} | img: {} | fnt: {}",
            1.0 / wall_time.as_secs_f64(),
            wall_time.as_secs_f64() * 1000.0,
            stats.frame.camera_change.label(),
            stats.total_duration.as_secs_f64() * 1000.0,
            stats.flush_duration.as_secs_f64() * 1000.0,
            stats.frame_duration.as_secs_f64() * 1000.0,
            stats.frame.predicted_cost_us,
            {
                let actual_us = stats.frame_duration.as_secs_f64() * 1_000_000.0;
                if actual_us > 0.0 { stats.frame.predicted_cost_us / actual_us } else { 0.0 }
            },
            stats.frame.display_list_duration.as_secs_f64() * 1000.0,
            stats.frame.display_list_size_estimated,
            stats.draw.painter_duration.as_secs_f64() * 1000.0,
            stats.draw.cache_picture_size,
            stats.draw.cache_picture_used,
            stats.draw.cache_geometry_size,
            stats.draw.layer_image_cache_size,
            stats.draw.layer_image_cache_hits,
            stats.draw.layer_image_cache_bytes as f64 / 1024.0,
            stats.draw.live_draw_count,
            self.renderer.resources.len(),
            self.renderer.images.len(),
            self.renderer.fonts.len(),
        );
        self.verbose(&s);
        self.last_stats = Some(s);
    }

    /// Update the cursor position.
    #[allow(dead_code)]
    pub fn pointer_move(&mut self, x: f32, y: f32) {
        self.input.cursor = [x, y];
    }

    // Timer convenience methods

    /// Sets a timeout that will execute the callback after the specified duration
    ///
    /// Returns a `TimerId` that can be used to cancel the timeout
    pub fn set_timeout<F>(
        &mut self,
        duration: std::time::Duration,
        callback: F,
    ) -> crate::sys::timer::TimerId
    where
        F: FnOnce() + Send + 'static,
    {
        self.timer.set_timeout(duration, callback)
    }

    /// Sets a repeating timer that will execute the callback at regular intervals
    ///
    /// Returns a `TimerId` that can be used to cancel the interval
    pub fn set_interval<F>(
        &mut self,
        interval: std::time::Duration,
        callback: F,
    ) -> crate::sys::timer::TimerId
    where
        F: Fn() + Send + 'static,
    {
        self.timer.set_interval(interval, callback)
    }

    /// Create a debounced function associated with the application's timer manager.
    pub fn debounce<F>(
        &mut self,
        wait: std::time::Duration,
        callback: F,
        leading: bool,
        trailing: bool,
    ) -> crate::sys::timer::Debounce
    where
        F: FnMut() + Send + 'static,
    {
        self.timer.debounce(wait, callback, leading, trailing)
    }

    /// Cancels a timer by its ID
    ///
    /// Returns `true` if the timer was found and cancelled, `false` otherwise
    pub fn cancel_timer(&mut self, id: crate::sys::timer::TimerId) -> bool {
        self.timer.cancel(id)
    }

    pub fn get_image_bytes(&self, id: &str) -> Option<Vec<u8>> {
        self.renderer.get_image_bytes(id)
    }

    pub fn get_image_size(&self, id: &str) -> Option<(u32, u32)> {
        self.renderer.get_image_size(id)
    }

    // -----------------------------------------------------------------------
    // Text editing — first-class engine feature
    // -----------------------------------------------------------------------

    /// Enter text editing mode for a node.
    ///
    /// Reads all text properties directly from the scene node to ensure
    /// the editing layout engine uses exactly the same configuration as
    /// the Painter. Returns `true` on success.
    ///
    /// The layout adapter (`ParagraphCacheLayout`) builds paragraphs with
    /// the **same** `textstyle()`, `FontCollection`, and
    /// `TextStyleRecBuildContext` that `ParagraphCache::measure()` uses,
    /// eliminating font fallback mismatches and layout divergence.
    pub fn text_edit_enter(&mut self, user_node_id: &str) -> bool {
        let node_id = match self.user_id_to_internal(user_node_id) {
            Some(id) => id,
            None => return false,
        };
        self.text_edit_enter_by_id(node_id)
    }

    /// Enter text editing mode for a node by its internal ID.
    ///
    /// Supports both `TextSpan` and `AttributedText` node types.
    /// Reads all text properties directly from the scene node to ensure
    /// the editing layout engine uses exactly the same configuration as
    /// the Painter. Returns `true` on success.
    pub fn text_edit_enter_by_id(&mut self, node_id: NodeId) -> bool {
        use crate::node::schema::Node;
        use crate::text::paragraph_cache_layout::ParagraphCacheLayout;
        use crate::text_edit_session::ActiveTextEdit;

        // Look up the text node from the scene to get the authoritative
        // properties — same data the Painter and ParagraphCache use.
        let scene = match self.renderer.scene.as_ref() {
            Some(s) => s,
            None => return false,
        };
        let node = match scene.graph.get_node(&node_id) {
            Ok(n) => n,
            Err(_) => return false,
        };

        match node {
            Node::TextSpan(tspan) => {
                let text = &tspan.text;
                let text_style_rec = &tspan.text_style;
                let text_align = &tspan.text_align;
                let layout_height = tspan.height.unwrap_or(10000.0);

                let fills = vec![Paint::from(CGColor::BLACK)];
                let paragraph_style = crate::text_edit::attributed_text::ParagraphStyle::default();

                // Build the layout adapter using the same font collection and style
                // code path as ParagraphCache::measure().
                let layout = ParagraphCacheLayout::new(
                    text_style_rec.clone(),
                    *text_align,
                    tspan.width, // None = auto-width (intrinsic sizing)
                    layout_height,
                    &self.renderer.fonts,
                );

                let te = ActiveTextEdit::new(
                    node_id,
                    text,
                    text_style_rec,
                    fills,
                    paragraph_style,
                    layout,
                );
                self.text_edit = Some(te);
            }
            Node::AttributedText(atext) => {
                let content: crate::text_edit::attributed_text::AttributedText =
                    (&atext.attributed_string).into();

                let layout = ParagraphCacheLayout::new(
                    atext.default_style.clone(),
                    atext.text_align,
                    atext.width,
                    atext.height.unwrap_or(10000.0),
                    &self.renderer.fonts,
                );

                let te = ActiveTextEdit::new_attributed(node_id, content, layout);
                self.text_edit = Some(te);
            }
            _ => return false,
        }

        self.text_edit_refresh_decorations();
        true
    }

    /// Exit text editing mode.
    ///
    /// If `commit`, returns the final text (if modified). Otherwise cancels.
    pub fn text_edit_exit(&mut self, commit: bool) -> Option<String> {
        let te = self.text_edit.take()?;
        self.text_edit_decorations = None;
        self.renderer.queue_unstable();

        if commit {
            te.commit()
        } else {
            te.cancel();
            None
        }
    }

    /// Whether a text editing session is active.
    pub fn text_edit_is_active(&self) -> bool {
        self.text_edit.is_some()
    }

    /// Returns the current text of the active editing session, or `None`
    /// if no session is active.
    pub fn text_edit_get_text(&self) -> Option<&str> {
        self.text_edit
            .as_ref()
            .map(|te| te.session.state.text.as_str())
    }

    /// Dispatch an editing command.
    pub fn text_edit_command(&mut self, cmd: crate::text_edit::EditingCommand) {
        if let Some(te) = self.text_edit.as_mut() {
            te.session.apply(cmd);
        }
        self.text_edit_refresh_decorations();
    }

    /// Undo within the text editing session.
    ///
    /// Returns `true` if the session had something to undo.
    pub fn text_edit_undo(&mut self) -> bool {
        let performed = self.text_edit.as_mut().is_some_and(|te| te.session.undo());
        self.text_edit_refresh_decorations();
        performed
    }

    /// Redo within the text editing session.
    ///
    /// Returns `true` if the session had something to redo.
    pub fn text_edit_redo(&mut self) -> bool {
        let performed = self.text_edit.as_mut().is_some_and(|te| te.session.redo());
        self.text_edit_refresh_decorations();
        performed
    }

    /// Pointer down in layout-local coordinates.
    pub fn text_edit_pointer_down(&mut self, x: f32, y: f32, shift: bool, click_count: u32) {
        if let Some(te) = self.text_edit.as_mut() {
            te.session.handle_click(x, y, click_count, shift);
        }
        self.text_edit_refresh_decorations();
    }

    /// Pointer move during drag (layout-local coordinates).
    pub fn text_edit_pointer_move(&mut self, x: f32, y: f32) {
        if let Some(te) = self.text_edit.as_mut() {
            te.session.on_pointer_move(x, y);
        }
        self.text_edit_refresh_decorations();
    }

    /// Pointer up.
    pub fn text_edit_pointer_up(&mut self) {
        if let Some(te) = self.text_edit.as_mut() {
            te.session.on_pointer_up();
        }
    }

    /// Set IME preedit string.
    pub fn text_edit_ime_set_preedit(&mut self, text: String) {
        if let Some(te) = self.text_edit.as_mut() {
            te.session.update_preedit(text);
        }
        self.text_edit_sync_display_text();
        self.text_edit_refresh_decorations();
    }

    /// Commit IME composition.
    pub fn text_edit_ime_commit(&mut self, text: &str) {
        if let Some(te) = self.text_edit.as_mut() {
            te.session.apply_with_kind(
                crate::text_edit::EditingCommand::Insert(text.to_owned()),
                crate::text_edit::EditKind::ImeCommit,
            );
            te.session.cancel_preedit();
        }
        self.text_edit_refresh_decorations();
    }

    /// Cancel IME composition.
    pub fn text_edit_ime_cancel(&mut self) {
        if let Some(te) = self.text_edit.as_mut() {
            te.session.cancel_preedit();
        }
        self.text_edit_sync_display_text();
        self.text_edit_refresh_decorations();
    }

    /// Get selected text (plain).
    pub fn text_edit_get_selected_text(&self) -> Option<String> {
        let te = self.text_edit.as_ref()?;
        te.session.selected_text().map(|s| s.to_owned())
    }

    /// Get selected text as HTML.
    pub fn text_edit_get_selected_html(&self) -> Option<String> {
        let te = self.text_edit.as_ref()?;
        te.session.selected_html()
    }

    /// Paste plain text.
    pub fn text_edit_paste_text(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }
        if let Some(te) = self.text_edit.as_mut() {
            te.session.apply_with_kind(
                crate::text_edit::EditingCommand::Insert(text.to_owned()),
                crate::text_edit::EditKind::Paste,
            );
        }
        self.text_edit_refresh_decorations();
    }

    /// Paste HTML with formatting.
    pub fn text_edit_paste_html(&mut self, html: &str) {
        if html.is_empty() {
            return;
        }
        if let Some(te) = self.text_edit.as_mut() {
            let base_style = te.session.content.default_style().clone();
            match crate::text_edit::attributed_text::html::html_to_attributed_text(html, base_style)
            {
                Ok(pasted) if !pasted.is_empty() => {
                    te.session.paste_attributed(&pasted);
                }
                _ => {} // malformed HTML — ignore silently
            }
        }
        self.text_edit_refresh_decorations();
    }

    /// Get caret rect in layout-local coordinates.
    pub fn text_edit_get_caret_rect(&mut self) -> Option<crate::text_edit::CaretRect> {
        let te = self.text_edit.as_mut()?;
        Some(te.session.caret_rect())
    }

    /// Get selection rects in layout-local coordinates.
    pub fn text_edit_get_selection_rects(
        &mut self,
    ) -> Option<Vec<crate::text_edit::SelectionRect>> {
        let te = self.text_edit.as_mut()?;
        let (lo, hi) = te.session.selection_range()?;
        let rects = te
            .session
            .layout
            .selection_rects_for_range(&te.session.state.text, lo, hi);
        if rects.is_empty() {
            None
        } else {
            Some(rects)
        }
    }

    /// Toggle bold on selection/caret.
    pub fn text_edit_toggle_bold(&mut self) {
        if let Some(te) = self.text_edit.as_mut() {
            te.session.toggle_bold();
        }
        self.text_edit_after_style_change();
    }

    /// Toggle italic on selection/caret.
    pub fn text_edit_toggle_italic(&mut self) {
        if let Some(te) = self.text_edit.as_mut() {
            te.session.toggle_italic();
        }
        self.text_edit_after_style_change();
    }

    /// Toggle underline on selection/caret.
    pub fn text_edit_toggle_underline(&mut self) {
        if let Some(te) = self.text_edit.as_mut() {
            te.session.toggle_underline();
        }
        self.text_edit_after_style_change();
    }

    /// Toggle strikethrough on selection/caret.
    pub fn text_edit_toggle_strikethrough(&mut self) {
        if let Some(te) = self.text_edit.as_mut() {
            te.session.toggle_strikethrough();
        }
        self.text_edit_after_style_change();
    }

    /// Set font size on selection/caret.
    pub fn text_edit_set_font_size(&mut self, size: f32) {
        if let Some(te) = self.text_edit.as_mut() {
            te.session.set_font_size(size);
        }
        self.text_edit_after_style_change();
    }

    /// Set font family on selection/caret.
    pub fn text_edit_set_font_family(&mut self, family: &str) {
        if let Some(te) = self.text_edit.as_mut() {
            te.session.set_font_family(family);
        }
        self.text_edit_after_style_change();
    }

    /// Set fill color on selection/caret.
    pub fn text_edit_set_color(&mut self, r: f32, g: f32, b: f32, a: f32) {
        if let Some(te) = self.text_edit.as_mut() {
            let color = CGColor::from_rgba(
                (r * 255.0) as u8,
                (g * 255.0) as u8,
                (b * 255.0) as u8,
                (a * 255.0) as u8,
            );
            te.session.set_color(color);
        }
        self.text_edit_after_style_change();
    }

    /// Tick the blink timer. Returns `true` if visibility changed.
    pub fn text_edit_tick(&mut self) -> bool {
        let changed = self
            .text_edit
            .as_mut()
            .map(|te| te.session.tick_blink())
            .unwrap_or(false);
        if changed {
            if let Some(te) = self.text_edit.as_ref() {
                let visible = te.session.should_show_caret();
                if let Some(ref mut deco) = self.text_edit_decorations {
                    if let Some(ref mut caret) = deco.caret {
                        caret.visible = visible;
                    }
                }
            }
            self.renderer.queue_unstable();
        }
        changed
    }

    // ---- In-scene text editing (native-only) ----
    //
    // These methods allow the application to own the full text editing
    // lifecycle: double-click to enter, keyboard routing, click-outside
    // to exit. The WASM path continues to use the host-driven text_edit_*
    // methods above.

    /// Process any surface event, routing keyboard/text/IME to the text
    /// editor when active and pointer events through the surface state.
    ///
    /// Returns a [`SurfaceResponse`] indicating what changed. The host
    /// should queue a redraw if `needs_redraw` is set and may inspect
    /// other flags (cursor, selection) for platform-specific actions.
    pub fn handle_surface_event(
        &mut self,
        event: crate::surface::SurfaceEvent,
    ) -> crate::surface::SurfaceResponse {
        use crate::surface::SurfaceEvent;

        match &event {
            // --- Pointer events ---
            SurfaceEvent::PointerDown { .. } => {
                if self.text_edit.is_some() {
                    self.handle_pointer_down_during_edit(event)
                } else {
                    let response = self.surface_dispatch(event);
                    // Double-click on a text node → enter edit mode.
                    if let Some(node_id) = response.double_clicked_node {
                        self.try_enter_text_edit(node_id);
                    }
                    response
                }
            }
            SurfaceEvent::PointerMove { canvas_point, .. } => {
                if self.text_edit.is_some() {
                    let canvas_point = *canvas_point;
                    self.handle_pointer_move_during_edit(canvas_point)
                } else {
                    self.surface_dispatch(event)
                }
            }
            SurfaceEvent::PointerUp { .. } => {
                if self.text_edit.is_some() {
                    self.text_edit_pointer_up();
                    crate::surface::SurfaceResponse::redraw()
                } else {
                    self.surface_dispatch(event)
                }
            }

            // --- Keyboard events ---
            SurfaceEvent::KeyDown { key, modifiers } => {
                let key = key.clone();
                let modifiers = *modifiers;
                self.handle_key_down(&key, &modifiers)
            }
            SurfaceEvent::TextInput { text } => {
                let text = text.clone();
                self.handle_text_input(&text)
            }
            SurfaceEvent::Ime(ime) => {
                let ime = ime.clone();
                self.handle_ime(&ime)
            }

            SurfaceEvent::ModifiersChanged(_) => self.surface_dispatch(event),
        }
    }

    /// Try to enter text edit mode on the given node.
    /// Only enters if the node is a text node (TextSpan or AttributedText).
    fn try_enter_text_edit(&mut self, node_id: NodeId) {
        let is_text = self
            .renderer
            .scene
            .as_ref()
            .and_then(|s| s.graph.get_node(&node_id).ok())
            .map(|n| matches!(n, Node::TextSpan(_) | Node::AttributedText(_)))
            .unwrap_or(false);

        if is_text {
            self.text_edit_enter_by_id(node_id);
        }
    }

    /// Handle a key-down event, routing to text editor or application commands.
    fn handle_key_down(
        &mut self,
        key: &crate::text_edit::session::KeyName,
        modifiers: &crate::surface::Modifiers,
    ) -> crate::surface::SurfaceResponse {
        use crate::text_edit::session::{KeyAction, KeyName};

        let mut response = crate::surface::SurfaceResponse::none();

        if self.text_edit.is_some() {
            // Escape → exit edit mode (commit changes).
            if matches!(key, KeyName::Escape) {
                self.exit_text_edit(true);
                response.needs_redraw = true;
                return response;
            }

            // Map platform modifiers to the text_edit convention.
            let cmd = modifiers.ctrl_or_cmd;
            let word = if cfg!(target_os = "macos") {
                modifiers.alt
            } else {
                modifiers.ctrl_or_cmd
            };
            let shift = modifiers.shift;

            if let Some(action) = KeyAction::from_key(cmd, word, shift, key) {
                // Skip Insert actions — character insertion comes via
                // the TextInput event to avoid double insertion.
                if !matches!(action, KeyAction::Insert(_)) {
                    if let Some(te) = self.text_edit.as_mut() {
                        te.session.handle_key_action(action);
                    }
                    self.text_edit_refresh_decorations();
                }
            }
            response.needs_redraw = true;
        }
        // When not editing, handle canvas-level key commands.
        if self.text_edit.is_none() {
            use crate::query::Selector;

            // Selection navigation
            let selector = match key {
                KeyName::Enter if modifiers.shift => Some(Selector::Parent),
                KeyName::Enter => Some(Selector::Children),
                KeyName::Tab if modifiers.shift => Some(Selector::PreviousSibling),
                KeyName::Tab => Some(Selector::NextSibling),
                _ => Option::None,
            };
            if let Some(sel) = selector {
                if self.command(ApplicationCommand::Select(sel)) {
                    response.needs_redraw = true;
                }
            }

            // Viewport zoom shortcuts (Shift + digit)
            if modifiers.shift {
                let zoom_cmd = match key {
                    KeyName::Digit(1) => Some(ApplicationCommand::ZoomToFit),
                    KeyName::Digit(2) => Some(ApplicationCommand::ZoomToSelection),
                    KeyName::Digit(0) => Some(ApplicationCommand::ZoomTo100),
                    _ => Option::None,
                };
                if let Some(cmd) = zoom_cmd {
                    if self.command(cmd) {
                        response.needs_redraw = true;
                    }
                }
            }
        }

        response
    }

    /// Handle committed text input (post-IME, post-dead-key).
    fn handle_text_input(&mut self, text: &str) -> crate::surface::SurfaceResponse {
        if let Some(te) = self.text_edit.as_mut() {
            te.session
                .apply(crate::text_edit::EditingCommand::Insert(text.to_owned()));
            self.text_edit_refresh_decorations();
            crate::surface::SurfaceResponse {
                needs_redraw: true,
                ..Default::default()
            }
        } else {
            crate::surface::SurfaceResponse::none()
        }
    }

    /// Handle an IME composition event.
    fn handle_ime(&mut self, ime: &crate::surface::ImeEvent) -> crate::surface::SurfaceResponse {
        match ime {
            crate::surface::ImeEvent::Preedit(text) => {
                self.text_edit_ime_set_preedit(text.clone());
            }
            crate::surface::ImeEvent::Commit(text) => {
                self.text_edit_ime_commit(text);
            }
            crate::surface::ImeEvent::Cancel => {
                self.text_edit_ime_cancel();
            }
        }
        crate::surface::SurfaceResponse {
            needs_redraw: self.text_edit.is_some(),
            ..Default::default()
        }
    }

    /// Handle a pointer-down event while text editing is active.
    ///
    /// If the click is inside the text node being edited, forward it as
    /// a layout-local text edit pointer event. If outside, exit edit mode
    /// (committing changes) and process the click normally.
    fn handle_pointer_down_during_edit(
        &mut self,
        event: crate::surface::SurfaceEvent,
    ) -> crate::surface::SurfaceResponse {
        let (canvas_point, modifiers) = match &event {
            crate::surface::SurfaceEvent::PointerDown {
                canvas_point,
                modifiers,
                ..
            } => (*canvas_point, *modifiers),
            _ => return crate::surface::SurfaceResponse::none(),
        };

        let node_id = match self.text_edit.as_ref() {
            Some(te) => te.node_id(),
            None => return self.surface_dispatch(event),
        };

        // Try to convert the canvas point to layout-local coordinates.
        // If the point is inside the text node, forward to the text editor.
        if let Some(local) = self.canvas_to_text_local(canvas_point, node_id) {
            let click_count = self.surface.click_tracker.register(local[0], local[1]);
            self.text_edit_pointer_down(local[0], local[1], modifiers.shift, click_count);
            crate::surface::SurfaceResponse {
                needs_redraw: true,
                ..Default::default()
            }
        } else {
            // Click outside the text node → exit edit mode, then process normally.
            self.exit_text_edit(true);
            self.surface_dispatch(event)
        }
    }

    /// Handle pointer-move during text editing (drag selection).
    fn handle_pointer_move_during_edit(
        &mut self,
        canvas_point: math2::vector2::Vector2,
    ) -> crate::surface::SurfaceResponse {
        let node_id = match self.text_edit.as_ref() {
            Some(te) => te.node_id(),
            None => return crate::surface::SurfaceResponse::none(),
        };

        if let Some(local) = self.canvas_to_text_local(canvas_point, node_id) {
            if let Some(te) = self.text_edit.as_mut() {
                te.session.on_pointer_move(local[0], local[1]);
            }
            // Only refresh overlay geometry (caret/selection), NOT the layer
            // text content. This avoids clearing the pan_image_cache on every
            // mouse move which causes flickering.
            self.text_edit_refresh_decorations_overlay_only();
            return crate::surface::SurfaceResponse {
                needs_redraw: true,
                ..Default::default()
            };
        }

        // Mouse is outside the text node — no text edit update needed.
        crate::surface::SurfaceResponse::none()
    }

    /// Convert a canvas-space point to layout-local coordinates for the
    /// given text node. Returns `None` if the click is outside the node's
    /// bounding box, the layer is not found, or the transform is
    /// non-invertible.
    fn canvas_to_text_local(
        &self,
        canvas_point: math2::vector2::Vector2,
        node_id: NodeId,
    ) -> Option<math2::vector2::Vector2> {
        use crate::painter::layer::{Layer, PainterPictureLayer};

        let entry = self
            .renderer
            .get_cache()
            .layers
            .layers
            .iter()
            .find(|e| e.id == node_id)?;

        let node_transform = entry.layer.transform();
        let inverse = node_transform.inverse()?;
        let local = math2::vector2::transform(canvas_point, &inverse);

        // Bounds check: is the local point inside the node's bounding rect?
        let bounds = match &entry.layer {
            PainterPictureLayer::Text(tl) => tl.shape.rect,
            _ => entry.layer.shape().rect,
        };
        if local[0] < bounds.left()
            || local[0] > bounds.right()
            || local[1] < bounds.top()
            || local[1] > bounds.bottom()
        {
            return None;
        }

        // Apply vertical alignment offset.
        let paragraph_height = self
            .text_edit
            .as_ref()
            .map(|te| te.session.layout.paragraph_height())
            .unwrap_or(0.0);
        let y_offset = Self::compute_text_y_offset(&self.renderer, node_id, paragraph_height);

        Some([local[0], local[1] - y_offset])
    }

    /// Exit text edit mode, optionally committing changes to the scene graph.
    ///
    /// This is the centralized exit point — all text edit session teardown
    /// flows through here. For the WASM path, [`text_edit_exit`] remains
    /// available as a simpler host-facing API.
    pub fn exit_text_edit(&mut self, commit: bool) {
        let Some(te) = self.text_edit.take() else {
            return;
        };
        self.text_edit_decorations = None;

        if commit {
            let result = te.commit_full();
            if result.modified {
                self.apply_text_edit_commit(result);
            }
        }

        self.renderer.queue_unstable();
    }

    /// Apply a text edit commit to the scene graph.
    ///
    /// Single, centralized place for all commit-to-scene logic.
    fn apply_text_edit_commit(&mut self, commit: crate::text_edit_session::TextEditCommit) {
        let Some(scene) = self.renderer.scene.as_mut() else {
            return;
        };
        let Ok(node) = scene.graph.get_node_mut(&commit.node_id) else {
            return;
        };

        match node {
            Node::TextSpan(t) => {
                t.text = commit.text;
            }
            Node::AttributedText(t) => {
                if let Some(ref attr) = commit.attributed {
                    t.attributed_string = attr.into();
                } else {
                    t.attributed_string.text = commit.text;
                }
            }
            _ => {}
        }
    }

    // -- Internal helpers --

    /// Build the display text (committed text + preedit at cursor) and
    /// sync it to the layer. Called during IME composition so the user
    /// sees each intermediate syllable.
    fn text_edit_sync_display_text(&mut self) {
        if let Some(te) = self.text_edit.as_ref() {
            let node_id = te.node_id();
            let display_text = match te.session.preedit() {
                Some(preedit) if !preedit.is_empty() => {
                    let committed = &te.session.state.text;
                    let cursor = te.session.state.cursor;
                    let mut buf = String::with_capacity(committed.len() + preedit.len());
                    buf.push_str(&committed[..cursor]);
                    buf.push_str(preedit);
                    buf.push_str(&committed[cursor..]);
                    buf
                }
                _ => te.session.state.text.clone(),
            };
            self.renderer.update_layer_text(node_id, &display_text);
        }
        self.renderer.queue_unstable();
    }

    fn text_edit_after_style_change(&mut self) {
        if let Some(te) = self.text_edit.as_mut() {
            te.session.layout.invalidate();
            te.session.layout.ensure_layout(&te.session.content);
        }
        self.text_edit_refresh_decorations();
    }

    /// Refresh text editing decorations (caret + selection rects).
    ///
    /// When `sync_content` is true, also pushes the current text content
    /// and shape bounds to the layer cache (triggers paragraph rebuild
    /// and clears the pan image cache). Use `sync_content: false` for
    /// pointer-move during drag selection where only the caret/selection
    /// geometry changed — this avoids clearing the pan cache and causing
    /// flicker.
    fn text_edit_refresh_decorations_inner(&mut self, sync_content: bool) {
        use crate::devtools::text_edit_decoration_overlay::{
            CaretDecoration, TextEditingDecorations,
        };

        // Split borrows: extract all data from `text_edit` first,
        // then access `renderer`.
        let deco_data = self.text_edit.as_mut().map(|te| {
            te.session.layout.ensure_layout(&te.session.content);
            let node_id = te.node_id();
            let paragraph_height = te.session.layout.paragraph_height();
            let caret = te.session.caret_rect();
            let visible = te.session.should_show_caret();
            let selection_rects = te
                .session
                .selection_range()
                .map(|(lo, hi)| {
                    te.session
                        .layout
                        .selection_rects_for_range(&te.session.state.text, lo, hi)
                })
                .unwrap_or_default();

            // Content sync data (only extracted when needed).
            let content_data = if sync_content {
                let layout_width = te.session.layout.layout_width();
                // Display text includes preedit for IME composition.
                let display_text = match te.session.preedit() {
                    Some(preedit) if !preedit.is_empty() => {
                        let committed = &te.session.state.text;
                        let cursor = te.session.state.cursor;
                        let mut buf = String::with_capacity(committed.len() + preedit.len());
                        buf.push_str(&committed[..cursor]);
                        buf.push_str(preedit);
                        buf.push_str(&committed[cursor..]);
                        buf
                    }
                    _ => te.session.state.text.clone(),
                };
                let attributed: Option<crate::cg::types::AttributedString> = if te.is_attributed() {
                    Some((&te.session.content).into())
                } else {
                    None
                };
                Some((layout_width, display_text, attributed))
            } else {
                None
            };

            (
                node_id,
                paragraph_height,
                caret,
                visible,
                selection_rects,
                content_data,
            )
        });

        if let Some((node_id, paragraph_height, caret, visible, selection_rects, content_data)) =
            deco_data
        {
            if let Some((layout_width, display_text, attributed)) = content_data {
                if let Some(attr) = attributed {
                    self.renderer
                        .update_layer_attributed_text(node_id, &display_text, attr);
                } else {
                    self.renderer.update_layer_text(node_id, &display_text);
                }
                self.renderer
                    .update_layer_text_shape(node_id, layout_width, paragraph_height);
            }

            let y_offset = Self::compute_text_y_offset(&self.renderer, node_id, paragraph_height);

            self.text_edit_decorations = Some(TextEditingDecorations {
                node_id,
                caret: Some(CaretDecoration {
                    rect: caret,
                    visible,
                }),
                selection_rects,
                y_offset,
            });
        }
        self.renderer.queue_unstable();
    }

    fn text_edit_refresh_decorations(&mut self) {
        self.text_edit_refresh_decorations_inner(true);
    }

    fn text_edit_refresh_decorations_overlay_only(&mut self) {
        self.text_edit_refresh_decorations_inner(false);
    }

    /// Compute the text vertical alignment offset for a text node.
    fn compute_text_y_offset(renderer: &Renderer, node_id: NodeId, paragraph_height: f32) -> f32 {
        use crate::node::schema::Node;
        let scene = match renderer.scene.as_ref() {
            Some(s) => s,
            None => return 0.0,
        };
        let node = match scene.graph.get_node(&node_id) {
            Ok(n) => n,
            Err(_) => return 0.0,
        };
        match node {
            Node::TextSpan(t) => match t.height {
                Some(h) => match t.text_align_vertical {
                    TextAlignVertical::Top => 0.0,
                    TextAlignVertical::Center => (h - paragraph_height) / 2.0,
                    TextAlignVertical::Bottom => h - paragraph_height,
                },
                None => 0.0,
            },
            _ => 0.0,
        }
    }
}
