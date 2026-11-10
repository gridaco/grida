//! GRIDA-SEC-004 / GRIDA-SEC-014 — built registered workspace span protocol.

#![cfg(any(target_os = "macos", target_os = "linux"))]

use serde_json::{Value, json};
use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::Path;
use std::process::Stdio;
use std::time::{Duration, UNIX_EPOCH};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};

const EXE: &str = env!("CARGO_BIN_EXE_grida-agent");
const WAIT: Duration = Duration::from_secs(8);

fn request(root: &Path, path: &str) -> Value {
    let stat = fs::metadata(root).unwrap();
    json!({
        "workspaceId":"registered-editor-workspace",
        "root":root,
        "identity":{
            "device":stat.dev().to_string(),
            "inode":stat.ino().to_string(),
            "birthTimeNs":stat.created().unwrap().duration_since(UNIX_EPOCH).unwrap().as_nanos().to_string(),
        },
        "protected":[],
        "path":path,
    })
}

fn worker() -> Command {
    let mut command = Command::new(EXE);
    command.arg("workspace-file");
    command
}

fn launch(mut command: Command) -> Child {
    command
        .env_clear()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .unwrap()
}

async fn send(input: &mut ChildStdin, value: Value) {
    input
        .write_all(format!("{value}\n").as_bytes())
        .await
        .unwrap();
}

async fn complete(child: Child) -> std::process::Output {
    tokio::time::timeout(WAIT, child.wait_with_output())
        .await
        .unwrap()
        .unwrap()
}

async fn opened(
    child: &mut Child,
    request: Value,
) -> (ChildStdin, BufReader<tokio::process::ChildStdout>, Value) {
    let mut input = child.stdin.take().unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    send(&mut input, request).await;
    let mut metadata = String::new();
    assert_ne!(
        tokio::time::timeout(WAIT, output.read_line(&mut metadata))
            .await
            .unwrap()
            .unwrap(),
        0
    );
    let metadata = serde_json::from_str(&metadata).unwrap();
    (input, output, metadata)
}

#[tokio::test]
async fn private_worker_serves_a_binary_span_from_the_same_descriptor() {
    use std::io::{Seek, SeekFrom, Write};

    const MEDIA_OFFSET: u64 = 1 << 20;
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let file = root.join("sample.mp4");
    let mut media = fs::File::create(&file).unwrap();
    media.seek(SeekFrom::Start(MEDIA_OFFSET)).unwrap();
    media.write_all(&[0, 1, 2, 0xff, 4, 5, 6]).unwrap();
    drop(media);
    let mut child = launch(worker());
    let (mut input, mut output, metadata) = opened(&mut child, request(&root, "sample.mp4")).await;
    assert_eq!(metadata, json!({"size":(MEDIA_OFFSET + 7).to_string()}));
    fs::rename(&file, root.join("original.mp4")).unwrap();
    fs::write(&file, b"replacement").unwrap();
    send(
        &mut input,
        json!({"offset":(MEDIA_OFFSET + 2).to_string(), "length":"4"}),
    )
    .await;
    drop(input);
    let mut bytes = Vec::new();
    tokio::time::timeout(WAIT, output.read_to_end(&mut bytes))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(bytes, [2, 0xff, 4, 5]);
    let result = complete(child).await;
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
}

#[tokio::test]
async fn private_worker_refuses_changed_scope_escape_and_oversized_input() {
    let temp = tempfile::tempdir().unwrap();
    let base = temp.path().canonicalize().unwrap();
    let root = base.join("workspace");
    let outside = base.join("outside.mp4");
    fs::write(&outside, b"secret").unwrap();
    fs::create_dir(&root).unwrap();
    fs::write(root.join("sample.mp4"), b"registered").unwrap();
    std::os::unix::fs::symlink(&outside, root.join("outside.mp4")).unwrap();
    let mut protected = request(&root, "sample.mp4");
    protected["protected"] = json!([&root]);
    let mut changed = request(&root, "sample.mp4");
    changed["identity"]["inode"] = json!("0");
    for (request, code) in [
        (changed, "workspace_directory_changed"),
        (protected, "protected_root_overlap"),
        (request(&root, "outside.mp4"), "workspace_path_outside_root"),
        (
            request(&root, "../outside.mp4"),
            "file_relative_path_invalid",
        ),
        (
            json!({"oversized":"a".repeat(32 * 1024)}),
            "workspace_file_frame_invalid",
        ),
    ] {
        let mut child = launch(worker());
        send(child.stdin.as_mut().unwrap(), request).await;
        let result = complete(child).await;
        assert!(!result.status.success());
        assert!(result.stdout.is_empty());
        assert_eq!(
            String::from_utf8(result.stderr).unwrap().trim(),
            format!("grida-agent: {code}")
        );
    }
}

#[tokio::test]
async fn closing_the_request_pipe_after_metadata_releases_the_worker() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    fs::write(root.join("sample.mp4"), b"read only if requested").unwrap();
    let mut child = launch(worker());
    let (input, mut output, metadata) = opened(&mut child, request(&root, "sample.mp4")).await;
    assert_eq!(metadata, json!({"size":"22"}));
    drop(input);
    let mut bytes = Vec::new();
    tokio::time::timeout(WAIT, output.read_to_end(&mut bytes))
        .await
        .unwrap()
        .unwrap();
    assert!(bytes.is_empty());
    assert!(complete(child).await.status.success());
}

#[cfg(target_os = "macos")]
#[tokio::test]
#[ignore = "requires a native host that permits applying the Seatbelt profile"]
async fn private_worker_reads_a_registered_root_under_a_read_only_kernel_scope() {
    let temp = tempfile::tempdir().unwrap();
    let base = temp.path().canonicalize().unwrap();
    let root = base.join("workspace");
    let unrelated = base.join("unrelated");
    for folder in [&root, &unrelated] {
        fs::create_dir(folder).unwrap();
        fs::write(folder.join("sample.mp4"), b"test span").unwrap();
    }
    let executable = Path::new(EXE).canonicalize().unwrap();
    let sandbox = || {
        let mut command = Command::new("/usr/bin/sandbox-exec");
        command.args(["-D", &format!("ROOT={}", root.display()), "-D", &format!("BIN={}", executable.display())])
            .arg("-p").arg(r#"
              (version 1)
              (deny default)
              (allow process-exec file-read* file-map-executable (literal (param "BIN")))
              (allow file-read* (subpath (param "ROOT")))
              (allow file-read-metadata file-test-existence (path-ancestors (param "ROOT")) (path-ancestors (param "BIN")))
              (allow file-read* file-map-executable (subpath "/System/Library") (subpath "/usr/lib"))
              (allow file-read* file-test-existence (literal "/"))
              (allow file-read* file-write-data (literal "/dev/null"))
              (allow sysctl-read (sysctl-name "hw.logicalcpu") (sysctl-name "hw.activecpu") (sysctl-name "hw.pagesize") (sysctl-name "hw.pagesize_compat"))
            "#)
            .arg(&executable)
            .arg("workspace-file")
            .current_dir(&root);
        command
    };
    let mut child = launch(sandbox());
    let (mut input, mut output, metadata) = opened(&mut child, request(&root, "sample.mp4")).await;
    assert_eq!(metadata, json!({"size":"9"}));
    send(&mut input, json!({"offset":"5","length":"4"})).await;
    drop(input);
    let mut bytes = Vec::new();
    tokio::time::timeout(WAIT, output.read_to_end(&mut bytes))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(bytes, b"span");
    assert!(complete(child).await.status.success());

    let mut child = launch(sandbox());
    send(
        child.stdin.as_mut().unwrap(),
        request(&unrelated, "sample.mp4"),
    )
    .await;
    let denied = complete(child).await;
    assert!(!denied.status.success());
    assert!(denied.stdout.is_empty());
}
