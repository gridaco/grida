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

async fn list(root: &Path, path: &str) -> std::process::Output {
    let mut child = launch(worker());
    let mut request = request(root, path);
    request["listDirectory"] = json!(true);
    let mut input = child.stdin.take().unwrap();
    send(&mut input, request).await;
    drop(input);
    complete(child).await
}

async fn save(
    command: Command,
    root: &Path,
    path: &str,
    bytes: &[u8],
    expected_mtime: Option<f64>,
) -> std::process::Output {
    let mut child = launch(command);
    let mut request = request(root, path);
    let mut write = json!({"length":bytes.len()});
    if let Some(expected) = expected_mtime {
        write["expectedMtime"] = json!(expected.to_string());
    }
    request["write"] = write;
    let mut input = child.stdin.take().unwrap();
    send(&mut input, request).await;
    input.write_all(bytes).await.unwrap();
    drop(input);
    complete(child).await
}

#[tokio::test]
async fn private_writer_replaces_exact_utf8_and_refuses_a_stale_or_deleted_target() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let file = root.join("draft.txt");
    fs::write(&file, b"before").unwrap();
    let handle = fs::File::options().write(true).open(&file).unwrap();
    handle
        .set_times(
            fs::FileTimes::new()
                .set_modified(UNIX_EPOCH + Duration::new(1_794_291_981, 825_364_300)),
        )
        .unwrap();
    let stat = handle.metadata().unwrap();
    let before = stat.mtime() as f64 * 1_000.0 + stat.mtime_nsec() as f64 / 1_000_000.0;
    let bytes = "\u{feff}one\r\nRésumé\r\n".as_bytes();
    let saved = save(worker(), &root, "draft.txt", bytes, Some(before)).await;
    assert!(saved.status.success(), "{:?}", saved.stderr);
    let stat = fs::metadata(&file).unwrap();
    assert_ne!(stat.ino(), handle.metadata().unwrap().ino());
    let mtime = stat.mtime() as f64 * 1_000.0 + stat.mtime_nsec() as f64 / 1_000_000.0;
    let returned = std::str::from_utf8(&saved.stdout)
        .unwrap()
        .trim()
        .strip_prefix("{\"mtime\":")
        .unwrap()
        .strip_suffix('}')
        .unwrap()
        .parse::<f64>()
        .unwrap();
    assert_eq!(returned, mtime);
    assert_eq!(fs::read(&file).unwrap(), bytes);
    let saved_again = save(worker(), &root, "draft.txt", bytes, Some(returned)).await;
    assert!(saved_again.status.success(), "{:?}", saved_again.stderr);
    let stale = save(worker(), &root, "draft.txt", b"stale", Some(before)).await;
    assert!(!stale.status.success());
    assert!(String::from_utf8_lossy(&stale.stderr).contains("workspace_write_modified_since"));
    assert_eq!(fs::read(&file).unwrap(), bytes);
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    fs::remove_file(&file).unwrap();
    let deleted = save(worker(), &root, "draft.txt", b"stale", Some(mtime)).await;
    assert!(!deleted.status.success());
    assert!(String::from_utf8_lossy(&deleted.stderr).contains("workspace_write_modified_since"));
    assert!(!file.exists());
    assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
}

#[tokio::test]
async fn private_writer_creates_contained_parents_and_refuses_final_links() {
    let temp = tempfile::tempdir().unwrap();
    let base = temp.path().canonicalize().unwrap();
    let root = base.join("workspace");
    let real = root.join("real");
    let outside = base.join("outside");
    for directory in [&root, &real, &outside] {
        fs::create_dir(directory).unwrap();
    }
    std::os::unix::fs::symlink(&real, root.join("alias")).unwrap();
    std::os::unix::fs::symlink(&outside, root.join("escape")).unwrap();
    let made = save(worker(), &root, "alias/nested/draft.txt", b"draft", None).await;
    assert!(made.status.success(), "{:?}", made.stderr);
    assert_eq!(fs::read(real.join("nested/draft.txt")).unwrap(), b"draft");
    let forced = save(worker(), &root, "alias/nested/draft.txt", b"forced", None).await;
    assert!(forced.status.success(), "{:?}", forced.stderr);
    assert_eq!(fs::read(real.join("nested/draft.txt")).unwrap(), b"forced");
    std::os::unix::fs::symlink(real.join("nested/draft.txt"), root.join("link.txt")).unwrap();
    let link = save(worker(), &root, "link.txt", b"replacement", None).await;
    assert!(!link.status.success());
    assert!(String::from_utf8_lossy(&link.stderr).contains("workspace_write_type_unsupported"));
    assert!(
        fs::symlink_metadata(root.join("link.txt"))
            .unwrap()
            .is_symlink()
    );
    assert_eq!(fs::read(real.join("nested/draft.txt")).unwrap(), b"forced");
    let escape = save(worker(), &root, "escape/new/file.txt", b"outside", None).await;
    assert!(!escape.status.success());
    assert_eq!(fs::read_dir(outside).unwrap().count(), 0);
}

#[tokio::test]
async fn private_writer_checks_the_complete_bounded_utf8_body_before_mutating() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    for (length, bytes, code) in [
        (2, b"x".as_slice(), "workspace_file_frame_invalid"),
        (1, b"xy".as_slice(), "workspace_file_frame_invalid"),
        (1, b"\xff".as_slice(), "workspace_write_utf8"),
        (
            64 * 1024 * 1024 + 1,
            b"".as_slice(),
            "workspace_write_limit",
        ),
    ] {
        let mut request = request(&root, "new/ignored.txt");
        request["write"] = json!({"length":length});
        let mut child = launch(worker());
        let mut input = child.stdin.take().unwrap();
        send(&mut input, request).await;
        input.write_all(bytes).await.unwrap();
        drop(input);
        let refused = complete(child).await;
        assert!(!refused.status.success());
        assert!(refused.stdout.is_empty());
        assert!(String::from_utf8_lossy(&refused.stderr).contains(code));
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
    }
}

#[tokio::test]
async fn private_worker_lists_exact_directory_without_following_child_links() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap().join("workspace");
    fs::create_dir(&root).unwrap();
    fs::create_dir(root.join("subfolder")).unwrap();
    fs::write(root.join("subfolder/draft.txt"), b"content").unwrap();
    fs::write(root.join("root.txt"), b"root").unwrap();
    let outside = root.parent().unwrap().join("outside");
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("secret.txt"), b"outside").unwrap();
    std::os::unix::fs::symlink(&outside, root.join("escape")).unwrap();
    std::os::unix::fs::symlink(root.join("subfolder"), root.join("alias")).unwrap();
    let _socket = std::os::unix::net::UnixListener::bind(root.join("local.sock")).unwrap();

    let listed = list(&root, "").await;
    assert!(listed.status.success(), "{:?}", listed.stderr);
    let value: Value = serde_json::from_slice(&listed.stdout).unwrap();
    let mut entries = value["entries"].as_array().unwrap().clone();
    entries.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
    assert_eq!(
        entries,
        [
            json!({"name":"alias", "kind":"symlink"}),
            json!({"name":"escape", "kind":"symlink"}),
            json!({"name":"local.sock", "kind":"other"}),
            json!({"name":"root.txt", "kind":"file"}),
            json!({"name":"subfolder", "kind":"directory"}),
        ]
    );
    let alias = list(&root, "alias").await;
    assert!(alias.status.success(), "{:?}", alias.stderr);
    assert_eq!(
        serde_json::from_slice::<Value>(&alias.stdout).unwrap(),
        json!({"entries":[{"name":"draft.txt", "kind":"file"}]})
    );
    let escaped = list(&root, "escape").await;
    assert!(!escaped.status.success());
    assert!(escaped.stdout.is_empty());
}

#[tokio::test]
async fn private_worker_refuses_an_incomplete_directory_listing() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    for index in 0..8_192 {
        fs::File::create(root.join(format!("entry-{index}"))).unwrap();
    }
    let full = list(&root, "").await;
    assert!(full.status.success(), "{:?}", full.stderr);
    let value: Value = serde_json::from_slice(&full.stdout).unwrap();
    assert_eq!(value["entries"].as_array().unwrap().len(), 8_192);
    fs::File::create(root.join("over-limit")).unwrap();
    let refused = list(&root, "").await;
    assert!(!refused.status.success());
    assert!(refused.stdout.is_empty());
    assert!(String::from_utf8_lossy(&refused.stderr).contains("workspace_directory_limit"));
}

#[tokio::test]
async fn private_worker_supplies_fractional_mtime_only_when_requested() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let file = root.join("draft.txt");
    fs::write(&file, b"draft").unwrap();
    let handle = fs::File::options().write(true).open(&file).unwrap();
    handle
        .set_times(
            fs::FileTimes::new()
                .set_modified(UNIX_EPOCH + std::time::Duration::new(1_700_000_000, 123_456_000)),
        )
        .unwrap();
    let stat = handle.metadata().unwrap();
    let mtime = stat.mtime() as f64 * 1_000.0 + stat.mtime_nsec() as f64 / 1_000_000.0;
    assert_ne!(mtime.fract(), 0.0);
    let mut child = launch(worker());
    let mut open = request(&root, "draft.txt");
    open["includeModified"] = json!(true);
    let (mut input, mut output, metadata) = opened(&mut child, open).await;
    assert_eq!(metadata, json!({"size":"5", "mtime":mtime}));
    send(&mut input, json!({"offset":"0", "length":"5"})).await;
    drop(input);
    let mut bytes = Vec::new();
    tokio::time::timeout(WAIT, output.read_to_end(&mut bytes))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(bytes, b"draft");
    assert!(complete(child).await.status.success());
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

    let refused_write = save(sandbox(), &root, "sample.mp4", b"write attempt", None).await;
    assert!(!refused_write.status.success());
    assert!(refused_write.stdout.is_empty());
    assert_eq!(fs::read(root.join("sample.mp4")).unwrap(), b"test span");
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
}
