//! `color_picker` — the canonical color hot path (`WID-4`, `PERF-1`):
//! a saturation/value plane, a hue bar, an alpha bar, and a hex
//! field. Dragging any of the three areas emits continuous previews
//! and exactly one commit on release (`UI-4`); the hex field commits
//! a typed value on Enter. Every commit carries one
//! [`BindingValue::Color`] — the same binding the swatch rides, so
//! the picker is the swatch's activated form.
//!
//! Monolithic (like the quad): the four sub-controls fold into one
//! color, and child emissions do not bubble, so the picker draws and
//! hit-tests its own sub-regions. The working HSVA lives in retained
//! state so a drag is smooth across rebuilds and round-trips through
//! hue/value extremes without the RGB snapback a per-event RGB
//! recompute would cause.
//!
//! Visual deferrals (named, not silently omitted): the SV plane is a
//! solid of the current hue with a position marker rather than a
//! two-axis gradient, and the alpha bar is a solid track — the
//! gradient backdrops are cosmetic and wait on the gradient-paint
//! wiring; the interaction and the committed color are exact.

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;
use grida::text_edit::session::KeyName;
use math2::rect::Rectangle;

use crate::ui::bind::{Binding, BindingPhase, BindingValue, Emission};
use crate::ui::field::Field;
use crate::ui::popover;
use crate::ui::widget::{BuildCtx, UiResponse, Widget, WidgetEvent, WidgetId, WidgetState};

/// SV plane height, logical px.
const PLANE_H: f32 = 120.0;
/// Hue / alpha bar height.
const BAR_H: f32 = 12.0;
/// Hex field height.
const FIELD_H: f32 = 20.0;
/// Vertical gap between sub-controls.
const GAP: f32 = 6.0;
/// Popover padding (only when the picker floats as its own panel).
const PAD: f32 = 8.0;

/// Hue (0–360), saturation, value, alpha (each 0–1).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hsva {
    pub h: f32,
    pub s: f32,
    pub v: f32,
    pub a: f32,
}

/// Which sub-control a drag is editing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    Sv,
    Hue,
    Alpha,
}

/// Retained picker state (`UI-2`).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct PickerState {
    /// The area being dragged, if any.
    pub drag: Option<Target>,
    /// The working color while interacting (seeded from the value on
    /// the first event; smooths hue/value extremes).
    pub working: Option<Hsva>,
    /// Hex field edit buffer, while focused.
    pub hex: Option<String>,
    /// Outbox: set when the picker asks to be dismissed (a press
    /// outside the panel and its trigger, or Escape, while floating as
    /// a popover). The host (the properties panel) drains it and
    /// unmounts the picker.
    pub closed: bool,
}

pub struct ColorPicker {
    pub id: WidgetId,
    /// The current color; the panel rebuilds on change.
    pub value: Field<CGColor>,
    pub width: f32,
    /// When `Some`, the picker renders as a floating popover at this
    /// world origin (its own top-level scene root); when `None`, it
    /// lays out in flow where its parent places it.
    pub origin: Option<[f32; 2]>,
    /// The trigger that opened this popover (the swatch), excluded
    /// from outside-dismiss so the opening gesture's residual press —
    /// which lands on the trigger — does not dismiss it
    /// ([`popover::should_dismiss`]). `None` for an inline picker.
    pub trigger: Option<Rectangle>,
    pub binding: Binding,
}

// -- HSV <-> RGB --------------------------------------------------------------

fn hsv_to_rgb(h: f32, s: f32, v: f32) -> (u8, u8, u8) {
    let c = v * s;
    let hp = (h.rem_euclid(360.0)) / 60.0;
    let x = c * (1.0 - ((hp % 2.0) - 1.0).abs());
    let (r1, g1, b1) = match hp as i32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let m = v - c;
    let q = |t: f32| ((t + m) * 255.0).round().clamp(0.0, 255.0) as u8;
    (q(r1), q(g1), q(b1))
}

fn rgb_to_hsv(r: u8, g: u8, b: u8) -> (f32, f32, f32) {
    let (r, g, b) = (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0);
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let d = max - min;
    let h = if d == 0.0 {
        0.0
    } else if max == r {
        60.0 * (((g - b) / d).rem_euclid(6.0))
    } else if max == g {
        60.0 * (((b - r) / d) + 2.0)
    } else {
        60.0 * (((r - g) / d) + 4.0)
    };
    let s = if max == 0.0 { 0.0 } else { d / max };
    (h, s, max)
}

fn color_to_hsva(c: CGColor) -> Hsva {
    let (h, s, v) = rgb_to_hsv(c.r, c.g, c.b);
    Hsva {
        h,
        s,
        v,
        a: c.a as f32 / 255.0,
    }
}

fn hsva_to_color(hsva: Hsva) -> CGColor {
    let (r, g, b) = hsv_to_rgb(hsva.h, hsva.s, hsva.v);
    CGColor::from_rgba(r, g, b, (hsva.a * 255.0).round().clamp(0.0, 255.0) as u8)
}

fn format_hex(c: CGColor) -> String {
    format!("#{:02X}{:02X}{:02X}", c.r, c.g, c.b)
}

fn parse_hex(s: &str) -> Option<(u8, u8, u8)> {
    let s = s.trim().trim_start_matches('#');
    if s.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&s[0..2], 16).ok()?;
    let g = u8::from_str_radix(&s[2..4], 16).ok()?;
    let b = u8::from_str_radix(&s[4..6], 16).ok()?;
    Some((r, g, b))
}

impl ColorPicker {
    fn current(&self) -> CGColor {
        self.value
            .value()
            .unwrap_or(CGColor::from_rgba(0, 0, 0, 255))
    }

    /// The working HSVA: the retained one during a drag, else the
    /// value's.
    fn hsva(&self, s: &PickerState) -> Hsva {
        s.working.unwrap_or_else(|| color_to_hsva(self.current()))
    }

    fn total_height(&self) -> f32 {
        PLANE_H + GAP + BAR_H + GAP + BAR_H + GAP + FIELD_H
    }

    /// The inset of the content from the widget's bounds — the popover
    /// padding when floating, zero when inline. Every hit-test rect is
    /// offset by it so the geometry matches the built (padded) layout.
    fn pad(&self) -> f32 {
        if self.origin.is_some() { PAD } else { 0.0 }
    }

    fn plane_rect(&self, b: Rectangle) -> Rectangle {
        let p = self.pad();
        Rectangle {
            x: b.x + p,
            y: b.y + p,
            width: self.width,
            height: PLANE_H,
        }
    }
    fn hue_rect(&self, b: Rectangle) -> Rectangle {
        let p = self.pad();
        Rectangle {
            x: b.x + p,
            y: b.y + p + PLANE_H + GAP,
            width: self.width,
            height: BAR_H,
        }
    }
    fn alpha_rect(&self, b: Rectangle) -> Rectangle {
        let p = self.pad();
        Rectangle {
            x: b.x + p,
            y: b.y + p + PLANE_H + 2.0 * GAP + BAR_H,
            width: self.width,
            height: BAR_H,
        }
    }
    fn hex_rect(&self, b: Rectangle) -> Rectangle {
        let p = self.pad();
        Rectangle {
            x: b.x + p,
            y: b.y + p + PLANE_H + 3.0 * GAP + 2.0 * BAR_H,
            width: self.width,
            height: FIELD_H,
        }
    }

    fn emit(&self, phase: BindingPhase) -> Emission {
        Emission {
            binding: self.binding.clone(),
            phase,
        }
    }

    /// Update the working HSVA for `target` from a pointer, returning
    /// the new color.
    fn apply_drag(&self, target: Target, point: [f32; 2], b: Rectangle, hsva: &mut Hsva) {
        let frac = |x: f32, r: Rectangle| ((x - r.x) / r.width).clamp(0.0, 1.0);
        match target {
            Target::Sv => {
                let r = self.plane_rect(b);
                hsva.s = frac(point[0], r);
                hsva.v = 1.0 - ((point[1] - r.y) / r.height).clamp(0.0, 1.0);
            }
            Target::Hue => hsva.h = frac(point[0], self.hue_rect(b)) * 360.0,
            Target::Alpha => hsva.a = frac(point[0], self.alpha_rect(b)),
        }
    }

    fn target_at(&self, point: [f32; 2], b: Rectangle) -> Option<Target> {
        if self.plane_rect(b).contains_point(point) {
            Some(Target::Sv)
        } else if self.hue_rect(b).contains_point(point) {
            Some(Target::Hue)
        } else if self.alpha_rect(b).contains_point(point) {
            Some(Target::Alpha)
        } else {
            None
        }
    }
}

// -- build helpers ------------------------------------------------------------

fn solid(color: CGColor) -> Paints {
    Paints::new([Paint::Solid(SolidPaint::new_color(color))])
}

fn stop(offset: f32, color: CGColor) -> GradientStop {
    GradientStop { offset, color }
}

/// A linear gradient paint between two normalized-alignment endpoints.
fn linear(xy1: Alignment, xy2: Alignment, stops: Vec<GradientStop>) -> Paint {
    Paint::LinearGradient(LinearGradientPaint {
        active: true,
        xy1,
        xy2,
        tile_mode: TileMode::Clamp,
        transform: math2::transform::AffineTransform::identity(),
        stops,
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
    })
}

/// The rainbow stops for the hue bar (0°…360°).
fn hue_stops() -> Vec<GradientStop> {
    (0..=6)
        .map(|i| {
            let (r, g, b) = hsv_to_rgb(i as f32 / 6.0 * 360.0, 1.0, 1.0);
            stop(i as f32 / 6.0, CGColor::from_rgba(r, g, b, 255))
        })
        .collect()
}

/// A thin vertical marker rect at `x` within a bar of `height`.
fn bar_marker(nf: &NodeFactory, x: f32, height: f32) -> Node {
    let mut m = nf.create_rectangle_node();
    m.transform = math2::transform::AffineTransform::new((x - 1.5).max(0.0), -1.0, 0.0);
    m.size = Size {
        width: 3.0,
        height: height + 2.0,
    };
    m.fills = solid(CGColor::from_rgba(255, 255, 255, 255));
    m.strokes = solid(CGColor::from_rgba(90, 90, 90, 255));
    m.stroke_width = StrokeWidth::Uniform(1.0);
    m.corner_radius = RectangularCornerRadius::circular(1.5);
    Node::Rectangle(m)
}

impl Widget for ColorPicker {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn default_state(&self) -> WidgetState {
        WidgetState::Picker(PickerState::default())
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let state = match ctx.states.get(&self.id) {
            Some(WidgetState::Picker(s)) => s.clone(),
            _ => PickerState::default(),
        };
        let hsva = self.hsva(&state);
        let nf = NodeFactory::new();

        // Body: vertical flow (plane, hue, alpha, hex) with GAP — the
        // offsets match the *_rect hit-test geometry.
        let mut body = nf.create_container_node();
        // A popover picker positions itself as its own top-level root;
        // an inline one flows where its parent places it.
        if let Some(origin) = self.origin {
            body.position = LayoutPositioningBasis::Cartesian(CGPoint {
                x: origin[0],
                y: origin[1],
            });
        }
        body.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Vertical,
            layout_gap: Some(LayoutGap::uniform(GAP)),
            layout_padding: self.origin.map(|_| EdgeInsets::all(PAD)),
            ..Default::default()
        };
        body.layout_dimensions.layout_target_width =
            Some(self.width + self.origin.map(|_| 2.0 * PAD).unwrap_or(0.0));
        body.layout_dimensions.layout_target_height =
            Some(self.total_height() + self.origin.map(|_| 2.0 * PAD).unwrap_or(0.0));
        if self.origin.is_some() {
            body.fills = solid(CGColor::from_rgba(250, 250, 250, 255));
            body.strokes = solid(CGColor::from_rgba(210, 210, 210, 255));
            body.stroke_width = StrokeWidth::Uniform(1.0);
            body.corner_radius = RectangularCornerRadius::circular(6.0);
        }
        let node = ctx.graph.append_child(Node::Container(body), parent);
        ctx.register(&self.id, node, true, true);

        let hue_color = {
            let (r, g, b) = hsv_to_rgb(hsva.h, 1.0, 1.0);
            CGColor::from_rgba(r, g, b, 255)
        };

        // SV plane: a white→hue horizontal gradient (saturation) under
        // a transparent→black vertical gradient (value) — the standard
        // SV square — plus a ring marker at (s, v).
        let mut plane = nf.create_container_node();
        plane.layout_dimensions.layout_target_width = Some(self.width);
        plane.layout_dimensions.layout_target_height = Some(PLANE_H);
        plane.fills = Paints::new([
            linear(
                Alignment::CENTER_LEFT,
                Alignment::CENTER_RIGHT,
                vec![
                    stop(0.0, CGColor::from_rgba(255, 255, 255, 255)),
                    stop(1.0, hue_color),
                ],
            ),
            linear(
                Alignment::TOP_CENTER,
                Alignment::BOTTOM_CENTER,
                vec![
                    stop(0.0, CGColor::from_rgba(0, 0, 0, 0)),
                    stop(1.0, CGColor::from_rgba(0, 0, 0, 255)),
                ],
            ),
        ]);
        plane.corner_radius = RectangularCornerRadius::circular(3.0);
        plane.clip = true;
        let pnode = ctx
            .graph
            .append_child(Node::Container(plane), Parent::NodeId(node));
        let mut marker = nf.create_rectangle_node();
        marker.transform = math2::transform::AffineTransform::new(
            (hsva.s * self.width - 5.0).clamp(0.0, self.width - 10.0),
            ((1.0 - hsva.v) * PLANE_H - 5.0).clamp(0.0, PLANE_H - 10.0),
            0.0,
        );
        marker.size = Size {
            width: 10.0,
            height: 10.0,
        };
        marker.fills = Paints::default();
        marker.strokes = solid(CGColor::from_rgba(255, 255, 255, 255));
        marker.stroke_width = StrokeWidth::Uniform(2.0);
        marker.corner_radius = RectangularCornerRadius::circular(5.0);
        ctx.graph
            .append_child(Node::Rectangle(marker), Parent::NodeId(pnode));

        // Hue bar: a true rainbow gradient + a position marker.
        let mut hue = nf.create_container_node();
        hue.layout_dimensions.layout_target_width = Some(self.width);
        hue.layout_dimensions.layout_target_height = Some(BAR_H);
        hue.fills = Paints::new([linear(
            Alignment::CENTER_LEFT,
            Alignment::CENTER_RIGHT,
            hue_stops(),
        )]);
        hue.corner_radius = RectangularCornerRadius::circular(2.0);
        hue.clip = true;
        let hnode = ctx
            .graph
            .append_child(Node::Container(hue), Parent::NodeId(node));
        ctx.graph.append_child(
            bar_marker(&nf, hsva.h / 360.0 * self.width, BAR_H),
            Parent::NodeId(hnode),
        );

        // Alpha bar: transparent→opaque current color + a marker.
        let opaque = hsva_to_color(Hsva { a: 1.0, ..hsva });
        let mut alpha = nf.create_container_node();
        alpha.layout_dimensions.layout_target_width = Some(self.width);
        alpha.layout_dimensions.layout_target_height = Some(BAR_H);
        alpha.fills = Paints::new([linear(
            Alignment::CENTER_LEFT,
            Alignment::CENTER_RIGHT,
            vec![
                stop(0.0, CGColor::from_rgba(opaque.r, opaque.g, opaque.b, 0)),
                stop(1.0, opaque),
            ],
        )]);
        alpha.corner_radius = RectangularCornerRadius::circular(2.0);
        alpha.clip = true;
        let anode = ctx
            .graph
            .append_child(Node::Container(alpha), Parent::NodeId(node));
        ctx.graph.append_child(
            bar_marker(&nf, hsva.a * self.width, BAR_H),
            Parent::NodeId(anode),
        );

        // Hex field.
        let editing_hex = state.hex.is_some();
        let hex_text = match &state.hex {
            Some(b) => format!("{b}|"),
            None => format_hex(hsva_to_color(hsva)),
        };
        let mut hex = nf.create_container_node();
        hex.layout_dimensions.layout_target_width = Some(self.width);
        hex.layout_dimensions.layout_target_height = Some(FIELD_H);
        hex.fills = solid(CGColor::from_rgba(255, 255, 255, 255));
        hex.strokes = solid(if editing_hex {
            CGColor::from_rgba(20, 90, 200, 255)
        } else {
            CGColor::from_rgba(210, 210, 210, 255)
        });
        hex.stroke_width = StrokeWidth::Uniform(1.0);
        hex.corner_radius = RectangularCornerRadius::circular(3.0);
        hex.clip = true;
        let xnode = ctx
            .graph
            .append_child(Node::Container(hex), Parent::NodeId(node));
        let mut hex_span = nf.create_text_span_node();
        hex_span.text = hex_text;
        hex_span.transform = math2::transform::AffineTransform::new(6.0, 3.0, 0.0);
        hex_span.width = Some(self.width - 12.0);
        hex_span.height = Some(FIELD_H - 6.0);
        hex_span.text_style = TextStyleRec::from_font("Geist", 11.0);
        hex_span.fills = solid(CGColor::from_rgba(40, 40, 40, 255));
        ctx.graph
            .append_child(Node::TextSpan(hex_span), Parent::NodeId(xnode));

        node
    }

    fn handle(
        &self,
        state: &mut WidgetState,
        event: &WidgetEvent,
        bounds: Rectangle,
    ) -> UiResponse {
        let WidgetState::Picker(s) = state else {
            return UiResponse::ignored();
        };
        match event {
            WidgetEvent::PointerDown { point, .. } => {
                if self.hex_rect(bounds).contains_point(*point) {
                    // Focus starts a fresh entry (type the full hex);
                    // the alpha of the current color is preserved on
                    // commit.
                    s.hex = Some(String::new());
                    return UiResponse {
                        consumed: true,
                        rebuild: true,
                        ..UiResponse::default()
                    };
                }
                let Some(target) = self.target_at(*point, bounds) else {
                    // A press outside the panel *and* its trigger
                    // dismisses a floating picker (the popup grab
                    // routes it here); a press on the trigger or in the
                    // panel's padding gaps does nothing. The trigger
                    // exclusion is what stops the opening gesture's
                    // residual press — which lands on the trigger —
                    // from dismissing the picker it just opened.
                    if self.origin.is_some()
                        && popover::should_dismiss(*point, bounds, self.trigger)
                    {
                        s.closed = true;
                        return UiResponse {
                            consumed: true,
                            release: true,
                            rebuild: true,
                            ..UiResponse::default()
                        };
                    }
                    return UiResponse::consumed();
                };
                let mut hsva = self.hsva(s);
                self.apply_drag(target, *point, bounds, &mut hsva);
                s.drag = Some(target);
                s.working = Some(hsva);
                UiResponse {
                    consumed: true,
                    emissions: vec![
                        self.emit(BindingPhase::Begin),
                        self.emit(BindingPhase::Preview(BindingValue::Color(hsva_to_color(
                            hsva,
                        )))),
                    ],
                    capture: true,
                    rebuild: true,
                    ..UiResponse::default()
                }
            }
            WidgetEvent::PointerMove { point } => {
                let Some(target) = s.drag else {
                    return UiResponse::ignored();
                };
                let mut hsva = self.hsva(s);
                self.apply_drag(target, *point, bounds, &mut hsva);
                s.working = Some(hsva);
                UiResponse {
                    consumed: true,
                    emissions: vec![self.emit(BindingPhase::Preview(BindingValue::Color(
                        hsva_to_color(hsva),
                    )))],
                    rebuild: true,
                    ..UiResponse::default()
                }
            }
            WidgetEvent::PointerUp { .. } => {
                let Some(_) = s.drag.take() else {
                    return UiResponse::ignored();
                };
                let hsva = self.hsva(s);
                s.working = None;
                UiResponse {
                    consumed: true,
                    emissions: vec![self.emit(BindingPhase::Commit(BindingValue::Color(
                        hsva_to_color(hsva),
                    )))],
                    release: true,
                    rebuild: true,
                    ..UiResponse::default()
                }
            }
            WidgetEvent::Key {
                key: KeyName::Escape,
                ..
            } => {
                // Escape cancels a hex edit if one is open, else
                // dismisses a floating picker.
                if s.hex.take().is_some() {
                    return UiResponse {
                        consumed: true,
                        rebuild: true,
                        ..UiResponse::default()
                    };
                }
                if self.origin.is_some() {
                    s.closed = true;
                    return UiResponse {
                        consumed: true,
                        release: true,
                        rebuild: true,
                        ..UiResponse::default()
                    };
                }
                UiResponse::ignored()
            }
            WidgetEvent::Key { key, .. } => {
                let Some(buffer) = s.hex.as_mut() else {
                    return UiResponse::ignored();
                };
                match key {
                    KeyName::Character(c) => {
                        buffer.push_str(c);
                        UiResponse {
                            consumed: true,
                            rebuild: true,
                            ..UiResponse::default()
                        }
                    }
                    KeyName::Backspace => {
                        buffer.pop();
                        UiResponse {
                            consumed: true,
                            rebuild: true,
                            ..UiResponse::default()
                        }
                    }
                    KeyName::Enter => {
                        let buffer = s.hex.take().unwrap();
                        match parse_hex(&buffer) {
                            Some((r, g, b)) => {
                                let a = (self.hsva(s).a * 255.0) as u8;
                                let color = CGColor::from_rgba(r, g, b, a);
                                UiResponse {
                                    consumed: true,
                                    emissions: vec![
                                        self.emit(BindingPhase::Begin),
                                        self.emit(BindingPhase::Commit(BindingValue::Color(color))),
                                    ],
                                    rebuild: true,
                                    ..UiResponse::default()
                                }
                            }
                            None => UiResponse {
                                consumed: true,
                                rebuild: true,
                                ..UiResponse::default()
                            },
                        }
                    }
                    _ => UiResponse::ignored(),
                }
            }
        }
    }
}
