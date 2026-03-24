use crate::cg::types::TextAlignVertical;
use crate::devtools::{
    fps_overlay, hit_overlay, ruler_overlay, stats_overlay, stroke_overlay, surface_overlay,
};
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
use crate::vectornetwork::VectorNetwork;
use crate::window::command::ApplicationCommand;
use grida_text_edit::layout::ManagedTextLayout;
use grida_text_edit::TextLayoutEngine;

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

pub struct Clipboard {
    pub(crate) data: Option<Vec<u8>>,
}

impl Default for Clipboard {
    fn default() -> Self {
        Self { data: None }
    }
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
    pub(crate) hit_test_result: Option<crate::node::schema::NodeId>,
    pub(crate) hit_test_last: std::time::Instant,
    pub(crate) hit_test_interval: std::time::Duration,
    #[cfg(not(target_arch = "wasm32"))]
    pub(crate) image_rx: mpsc::UnboundedReceiver<ImageMessage>,
    #[cfg(not(target_arch = "wasm32"))]
    pub(crate) font_rx: mpsc::UnboundedReceiver<FontMessage>,
    pub(crate) last_frame_time: std::time::Instant,
    pub(crate) last_stats: Option<String>,
    pub(crate) devtools_selection: Option<crate::node::schema::NodeId>,
    pub(crate) highlight_strokes: Vec<crate::node::schema::NodeId>,
    pub(crate) highlight_stroke_style: Option<crate::devtools::stroke_overlay::StrokeOverlayStyle>,
    pub(crate) devtools_rendering_show_fps: bool,
    pub(crate) devtools_rendering_show_tiles: bool,
    pub(crate) devtools_rendering_show_stats: bool,
    pub(crate) devtools_rendering_show_hit_overlay: bool,
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
        grida_text_edit::time::Instant::set_micros((time * 1000.0) as u64);
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
                if let Some(internal_id) = self.devtools_selection.as_ref() {
                    let internal_id = internal_id.clone();
                    // Convert internal ID to user ID for API call
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
        self.devtools_rendering_show_hit_overlay = self.debug;
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
        return None;
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

    fn devtools_rendering_set_show_hit_testing(&mut self, show: bool) {
        self.devtools_rendering_show_hit_overlay = show;
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
        use crate::io::io_grida_fbs;
        match io_grida_fbs::decode_with_id_map(bytes) {
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
                    .zip(result.scenes.into_iter())
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
        if let Some((_, scene)) = self.loaded_scenes.iter().find(|(id, _)| id == scene_id) {
            self.renderer.load_scene(scene.clone());
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

    pub fn perform_hit_test_host(&mut self) {
        self.perform_hit_test();
    }

    pub fn capture_hit_test_selection(&mut self) {
        self.devtools_selection = self.hit_test_result.clone();
    }

    /// Dispatch a surface event (hover, select, gesture) and return what changed.
    ///
    /// The caller provides screen-space coordinates; this method handles the
    /// camera transform and hit-tester construction internally.
    pub fn surface_dispatch(
        &mut self,
        event: crate::surface::SurfaceEvent,
    ) -> crate::surface::SurfaceResponse {
        // Build hit tester and hierarchy from renderer fields without
        // borrowing `self` as a whole.
        let (hit_tester, response) = if let Some(scene) = self.renderer.scene.as_ref() {
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
        drop(hit_tester);
        if response.needs_redraw {
            self.queue();
        }
        response
    }

    /// Read-only access to the surface state.
    pub fn surface(&self) -> &crate::surface::SurfaceState {
        &self.surface
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
            hit_test_result: None,
            hit_test_last: std::time::Instant::now(),
            hit_test_interval: std::time::Duration::from_millis(0),
            #[cfg(not(target_arch = "wasm32"))]
            image_rx,
            #[cfg(not(target_arch = "wasm32"))]
            font_rx,
            last_frame_time: std::time::Instant::now(),
            last_stats: None,
            devtools_selection: None,
            highlight_strokes: Vec::new(),
            highlight_stroke_style: None,
            devtools_rendering_show_fps: debug,
            devtools_rendering_show_tiles: debug,
            devtools_rendering_show_stats: debug,
            devtools_rendering_show_hit_overlay: debug,
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
        grida_text_edit::time::Instant::set_micros((time * 1000.0) as u64);

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
        if !stable && !content_changed && self.renderer.blit_content_cache() {
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
            let (hash, url, _, _, _) = self.renderer.add_image(&msg.data);
            println!("📝 Registered image with renderer: {} ({})", hash, url);
            updated = true;
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
    pub(crate) fn perform_hit_test(&mut self) {
        if self.hit_test_interval != std::time::Duration::ZERO
            && self.hit_test_last.elapsed() < self.hit_test_interval
        {
            return;
        }
        self.hit_test_last = std::time::Instant::now();
        let camera = &self.renderer.camera;
        let point = camera.screen_to_canvas_point(self.input.cursor);
        // Get string ID from API, convert to internal ID for storage
        let new_hit_result = self
            .get_node_id_from_point(point)
            .and_then(|user_id| self.user_id_to_internal(&user_id));
        if self.hit_test_result != new_hit_result {
            self.queue();
        }
        self.hit_test_result = new_hit_result;
    }

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
                fps_overlay::FpsMeter::draw(&canvas, self.clock.hz() as f32);
            }
            if self.devtools_rendering_show_stats {
                if let Some(s) = self.last_stats.as_deref() {
                    stats_overlay::StatsOverlay::draw(&canvas, s, &self.clock);
                }
            }
            if self.devtools_rendering_show_hit_overlay {
                hit_overlay::HitOverlay::draw(
                    &canvas,
                    self.hit_test_result.as_ref(),
                    self.devtools_selection.as_ref(),
                    &self.renderer.camera,
                    self.renderer.get_cache(),
                    &self.renderer.fonts,
                );
            }
            if !self.highlight_strokes.is_empty() {
                stroke_overlay::StrokeOverlay::draw(
                    &canvas,
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
                    &canvas,
                    deco,
                    &self.renderer.camera,
                    self.renderer.get_cache(),
                );
            }
            // Surface interaction overlays (hover, selection, marquee)
            surface_overlay::SurfaceOverlay::draw(
                &canvas,
                &self.surface,
                &self.renderer.camera,
                self.renderer.get_cache(),
                &self.surface_overlay_config,
            );
            // Surface UI elements (size meter, frame titles, hit regions)
            crate::surface::ui::SurfaceUI::draw(
                &canvas,
                &self.surface,
                &self.renderer.camera,
                self.renderer.get_cache(),
                &self.surface_overlay_config,
                &mut self.ui_hit_regions,
                self.renderer.scene.as_ref().map(|s| &s.graph),
                &self.renderer.fonts,
            );
            if self.devtools_rendering_show_ruler {
                ruler_overlay::Ruler::draw(&canvas, &self.renderer.camera);
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
            "fps*: {:.0} | t: {:.2}ms | cam: {} | render: {:.1}ms | flush: {:.1}ms | frame: {:.1}ms | list: {:.1}ms ({:?}) | draw: {:.1}ms | $:pic: {:?} ({:?} use) | $:geo: {:?} | comp: {:?} ({:?} hit, {:.1}KB) | live: {:?} | res: {} | img: {} | fnt: {}",
            1.0 / wall_time.as_secs_f64(),
            wall_time.as_secs_f64() * 1000.0,
            stats.frame.camera_change.label(),
            stats.total_duration.as_secs_f64() * 1000.0,
            stats.flush_duration.as_secs_f64() * 1000.0,
            stats.frame_duration.as_secs_f64() * 1000.0,
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

    /// Update the cursor position and run a debounced hit test.
    #[allow(dead_code)]
    pub fn pointer_move(&mut self, x: f32, y: f32) {
        self.input.cursor = [x, y];
        self.perform_hit_test();
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
        use crate::node::schema::Node;
        use crate::text::paragraph_cache_layout::ParagraphCacheLayout;
        use crate::text_edit_session::ActiveTextEdit;

        let node_id = match self.user_id_to_internal(user_node_id) {
            Some(id) => id,
            None => return false,
        };

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
        let tspan = match node {
            Node::TextSpan(t) => t,
            _ => return false,
        };

        let text = &tspan.text;
        let text_style_rec = &tspan.text_style;
        let text_align = &tspan.text_align;
        let layout_height = tspan.height.unwrap_or(10000.0);

        let fill = grida_text_edit::attributed_text::TextFill::default();
        let paragraph_style = grida_text_edit::attributed_text::ParagraphStyle::default();

        // Build the layout adapter using the same font collection and style
        // code path as ParagraphCache::measure().
        let layout = ParagraphCacheLayout::new(
            text_style_rec.clone(),
            *text_align,
            tspan.width, // None = auto-width (intrinsic sizing)
            layout_height,
            &self.renderer.fonts,
        );

        let te = ActiveTextEdit::new(node_id, text, text_style_rec, fill, paragraph_style, layout);

        self.text_edit = Some(te);
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
    pub fn text_edit_command(&mut self, cmd: grida_text_edit::EditingCommand) {
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
                grida_text_edit::EditingCommand::Insert(text.to_owned()),
                grida_text_edit::EditKind::ImeCommit,
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
                grida_text_edit::EditingCommand::Insert(text.to_owned()),
                grida_text_edit::EditKind::Paste,
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
            match grida_text_edit::attributed_text::html::html_to_attributed_text(html, base_style)
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
    pub fn text_edit_get_caret_rect(&mut self) -> Option<grida_text_edit::CaretRect> {
        let te = self.text_edit.as_mut()?;
        Some(te.session.caret_rect())
    }

    /// Get selection rects in layout-local coordinates.
    pub fn text_edit_get_selection_rects(&mut self) -> Option<Vec<grida_text_edit::SelectionRect>> {
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
        use grida_text_edit::attributed_text::RGBA;
        if let Some(te) = self.text_edit.as_mut() {
            te.session.set_color(RGBA { r, g, b, a });
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

    fn text_edit_refresh_decorations(&mut self) {
        // The generic session's apply() already calls ensure_layout internally,
        // but we still need to compute decoration data for the overlay.

        // Split borrows: extract data from `text_edit`, then access `renderer`.
        let deco_data = self.text_edit.as_mut().map(|te| {
            // Ensure layout is up to date.
            te.session.layout.ensure_layout(&te.session.content);
            let node_id = te.node_id();
            let paragraph_height = te.session.layout.paragraph_height();
            // Use display text (committed + preedit) so intermediate IME
            // syllables remain visible when decorations are refreshed.
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
            (
                node_id,
                paragraph_height,
                display_text,
                caret,
                visible,
                selection_rects,
            )
        });

        if let Some((node_id, paragraph_height, display_text, caret, visible, selection_rects)) =
            deco_data
        {
            self.renderer.update_layer_text(node_id, &display_text);

            let y_offset = Self::compute_text_y_offset(&self.renderer, node_id, paragraph_height);

            use crate::devtools::text_edit_decoration_overlay::{
                CaretDecoration, TextEditingDecorations,
            };

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
