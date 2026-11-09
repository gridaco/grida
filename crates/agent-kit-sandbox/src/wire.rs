use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;

#[cfg(target_os = "macos")]
pub const HELPER_FLAG: &str = "--agent-kit-sandbox-helper-v2";
#[cfg(target_os = "linux")]
pub const HELPER_FLAG: &str = "--agent-kit-sandbox-helper-v1";
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
    },
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

#[cfg(target_os = "linux")]
pub fn namespaces() -> std::io::Result<[u64; 5]> {
    use std::os::unix::fs::MetadataExt;
    let mut result = [0; 5];
    for (index, namespace) in ["user", "mnt", "pid", "ipc", "net"].iter().enumerate() {
        result[index] = std::fs::metadata(format!("/proc/self/ns/{namespace}"))?.ino();
    }
    Ok(result)
}
