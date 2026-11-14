//! Internal entrypoint for the same-version sandbox launcher.

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[path = "../helper.rs"]
mod helper;
#[cfg(target_os = "linux")]
#[path = "../linux_seccomp.rs"]
mod linux_seccomp;
#[cfg(any(target_os = "macos", target_os = "linux"))]
#[path = "../wire.rs"]
mod wire;

fn main() -> std::process::ExitCode {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    if helper::run() {
        return std::process::ExitCode::SUCCESS;
    }
    std::process::ExitCode::FAILURE
}
