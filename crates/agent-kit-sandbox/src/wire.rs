use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;

#[cfg(target_os = "macos")]
pub const HELPER_FLAG: &str = "--agent-kit-sandbox-helper-v3";
#[cfg(target_os = "linux")]
pub const HELPER_FLAG: &str = "--agent-kit-sandbox-helper-v2";
pub const MAX_FRAME_BYTES: usize = 256 * 1024;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Launch {
    pub roots: Vec<PathIdentity>,
    pub private_temp: PathBuf,
    pub task: Task,
    #[cfg(target_os = "linux")]
    pub host_namespaces: [u64; 5],
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Task {
    Probe,
    Command {
        executable: PathBuf,
        arguments: Vec<String>,
        cwd: PathBuf,
        environment: BTreeMap<String, String>,
        mode: Mode,
    },
}

/// How the helper connects the payload to the owner.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    /// Inherited stdio. The payload shares the helper's process group.
    Finite,
    /// A session whose payload has closed stdin and one merged output pipe.
    Pipe,
    /// A session whose payload leads its own session on a pseudo-terminal.
    Terminal,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PathIdentity {
    pub path: PathBuf,
    pub device: u64,
    pub inode: u64,
}

impl PathIdentity {
    pub fn matches(&self) -> bool {
        use std::os::unix::fs::MetadataExt;
        std::fs::symlink_metadata(&self.path).is_ok_and(|metadata| {
            metadata.dev() == self.device
                && metadata.ino() == self.inode
                && !metadata.file_type().is_symlink()
        })
    }
}

pub const STATUS_READY: u8 = b'R';
pub const STATUS_SETUP_FAILED: u8 = b'F';
pub const STATUS_EXIT: u8 = b'E';
pub const STATUS_SIGNAL: u8 = b'S';
/// A session helper sends this after the exit report once it has signalled
/// the payload's own process group while the payload was still unreaped.
pub const STATUS_GROUP_ENDED: u8 = b'K';

/// Owner to helper: deliver an interrupt to a session payload.
pub const CONTROL_INTERRUPT: u8 = b'I';
/// Owner to helper: end the payload. End of stream and any other byte mean
/// the owner is gone, and the helper ends everything it launched.
pub const CONTROL_STOP: u8 = b'T';

#[cfg(target_os = "linux")]
pub fn namespaces() -> std::io::Result<[u64; 5]> {
    use std::os::unix::fs::MetadataExt;
    let mut result = [0; 5];
    for (index, namespace) in ["user", "mnt", "pid", "ipc", "net"].iter().enumerate() {
        result[index] = std::fs::metadata(format!("/proc/self/ns/{namespace}"))?.ino();
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_launch_mode_is_a_required_part_of_the_command() {
        let task = Task::Command {
            executable: "/bin/sh".into(),
            arguments: vec![],
            cwd: "/".into(),
            environment: BTreeMap::new(),
            mode: Mode::Terminal,
        };
        let encoded = serde_json::to_string(&task).unwrap();
        assert!(encoded.contains(r#""mode":"terminal""#), "{encoded}");
        let without_mode = encoded.replace(r#","mode":"terminal""#, "");
        assert!(serde_json::from_str::<Task>(&without_mode).is_err());
        let unknown = encoded.replace("terminal", "shell");
        assert!(serde_json::from_str::<Task>(&unknown).is_err());
    }
}
