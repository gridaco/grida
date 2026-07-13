//! The windowed shell — winit + glutin + Skia GL surface, with an
//! egui_glow overlay for the dev panels (the grida_editor shell recipe,
//! reduced). The shell owns no editing semantics: every edit flows
//! through the lab's ops layer via the interaction FSM.

mod app;
pub mod hud;
mod player;
mod player_transport;
mod window;

pub fn run() {
    let init = window::create_window("anchor spike — E10", 1280, 840);
    app::run(init);
}

pub fn play_svg(path: &std::path::Path) -> Result<(), String> {
    player::run(path)
}
