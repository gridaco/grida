use cg::scheduler;
use rand::Rng;
use std::time::{Duration, Instant};
use winit::{
    application::ApplicationHandler,
    dpi::LogicalSize,
    event_loop::EventLoop,
    window::{Window, WindowAttributes},
};

// Main application struct holding the window and rendering loop state
struct App {
    window: Window,
    frame_count: u32,
    start_time: Instant,
    scheduler: scheduler::FrameScheduler,
}

impl App {
    /// Simulates rendering work by sleeping for a few milliseconds
    fn render(&self) {
        let mut rng = rand::thread_rng();
        let render_time = rng.gen_range(1..=5);
        std::thread::sleep(Duration::from_millis(render_time));
    }
}

impl ApplicationHandler for App {
    fn resumed(&mut self, _event_loop: &winit::event_loop::ActiveEventLoop) {}

    fn window_event(
        &mut self,
        event_loop: &winit::event_loop::ActiveEventLoop,
        _window_id: winit::window::WindowId,
        event: winit::event::WindowEvent,
    ) {
        match event {
            // Exit gracefully when the window is closed
            winit::event::WindowEvent::CloseRequested => {
                event_loop.exit();
            }
            // Called once per frame when redraw is requested
            winit::event::WindowEvent::RedrawRequested => {
                self.render(); // Simulate some frame rendering work

                self.scheduler.sleep_to_maintain_fps(); // Apply pacing (no-op on wasm)

                self.frame_count += 1;

                // Log FPS every second
                let elapsed = self.start_time.elapsed();
                if elapsed >= Duration::from_secs(1) {
                    println!("Frames in last second: {}", self.frame_count);
                    self.frame_count = 0;
                    self.start_time = Instant::now();
                }

                self.window.request_redraw(); // Schedule next frame
            }
            _ => {}
        }
    }
}

fn main() {
    // Set up the winit event loop and window
    let el = EventLoop::new().expect("Failed to create event loop");

    let window_attributes = WindowAttributes::default()
        .with_title("Winit RAF Demo")
        .with_inner_size(LogicalSize::new(800, 600));

    let window = el
        .create_window(window_attributes)
        .expect("Failed to create window");

    let now = Instant::now();

    // Initialize application with both a target and max FPS
    let mut app = App {
        window,
        frame_count: 0,
        start_time: now,
        scheduler: scheduler::FrameScheduler::new(120).with_max_fps(144),
    };

    // Start the app's event loop
    el.run_app(&mut app).unwrap();
}
