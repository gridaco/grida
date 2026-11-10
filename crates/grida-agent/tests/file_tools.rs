//! GRIDA-SEC-004 / GRIDA-SEC-014 — native file authority regressions.

#![cfg(any(target_os = "macos", target_os = "linux"))]

use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{
    Inventory, InventorySnapshot, InvocationContext, PreparedInvocation, ToolOutcome,
};
use agent_kit_core::{AttemptId, BindingId, CancellationToken, OperationId, ToolId};
use grida_agent::file_tools::{FileAuthority, FileTools};
use grida_agent::workspace::{DirectoryGrant, DirectorySpec, ProtectedRoots, WorkspaceSnapshot};
use serde_json::{Value, json};
use std::fs;
use std::os::unix::fs::symlink;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::Instant;

struct Fixture {
    _temp: tempfile::TempDir,
    base: PathBuf,
    first: PathBuf,
    second: PathBuf,
    captured: Arc<WorkspaceSnapshot>,
    current: Arc<RwLock<FileAuthority>>,
    inventory: InventorySnapshot,
}

impl Fixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().canonicalize().unwrap();
        let first = base.join("first");
        let second = base.join("second");
        fs::create_dir(&first).unwrap();
        fs::create_dir(&second).unwrap();
        let protected = Arc::new(ProtectedRoots::new(vec![]).unwrap());
        let captured = snapshot(1, "first", &first, &second, &protected);
        let current = Arc::new(RwLock::new(FileAuthority {
            workspace: captured.clone(),
            grants: grants(&captured),
            protected,
        }));
        let live = current.clone();
        let tools = Arc::new(
            FileTools::new(
                captured.clone(),
                Arc::new(move || Ok(live.read().unwrap().clone())),
            )
            .unwrap(),
        );
        let inventory = inventory(&tools);
        Self {
            _temp: temp,
            base,
            first,
            second,
            captured,
            current,
            inventory,
        }
    }

    async fn call(&self, name: &str, arguments: Value) -> ToolOutcome {
        prepared(&self.inventory, name, arguments)
            .invoke(context())
            .await
    }
}

fn id(value: &str) -> BindingId {
    BindingId::new(value).unwrap()
}

fn snapshot(
    revision: u64,
    primary: &str,
    first: &Path,
    second: &Path,
    protected: &ProtectedRoots,
) -> Arc<WorkspaceSnapshot> {
    Arc::new(
        WorkspaceSnapshot::capture(
            id("workspace"),
            revision,
            [("first", first), ("second", second)]
                .into_iter()
                .map(|(name, path)| DirectorySpec {
                    id: id(name),
                    name: name.into(),
                    path: path.to_owned(),
                    generation: id("original"),
                })
                .collect(),
            Some(id(primary)),
            protected,
        )
        .unwrap(),
    )
}

fn grants(snapshot: &WorkspaceSnapshot) -> Arc<[DirectoryGrant]> {
    ["first", "second"]
        .map(|name| DirectoryGrant::bind(snapshot, &id(name), true, false).unwrap())
        .into()
}

fn inventory(tools: &Arc<FileTools>) -> InventorySnapshot {
    let mut inventory = Inventory::new();
    let mut ids = Vec::new();
    for tool in tools.adapters().unwrap() {
        ids.push(tool.definition().id.clone());
        inventory.insert(tool).unwrap();
    }
    inventory.snapshot(&ids).unwrap()
}

fn prepared(inventory: &InventorySnapshot, name: &str, arguments: Value) -> PreparedInvocation {
    inventory
        .prepare(
            OperationId::new("file-operation").unwrap(),
            &ToolId::new(name).unwrap(),
            ToolArguments::Json(arguments),
        )
        .unwrap()
}

fn context() -> InvocationContext {
    InvocationContext {
        attempt: AttemptId::new("file-attempt").unwrap(),
        cancellation: CancellationToken::new(),
        deadline: None,
        max_output_bytes: 64 * 1024,
    }
}

fn result_text(outcome: &ToolOutcome) -> &str {
    let [ResultContent::Text(text)] = outcome.content.as_slice() else {
        panic!("expected one tool text, got {outcome:?}");
    };
    text
}

fn body(outcome: &ToolOutcome) -> Value {
    assert_eq!(outcome.status, OutcomeStatus::Succeeded, "{outcome:?}");
    serde_json::from_str(result_text(outcome)).unwrap()
}

fn failed(outcome: ToolOutcome, code: &str) {
    assert_eq!(outcome.status, OutcomeStatus::Failed, "{outcome:?}");
    assert_eq!(result_text(&outcome), code);
}

#[tokio::test]
async fn current_primary_cannot_retarget_the_turn_and_named_roots_read_independently() {
    let fixture = Fixture::new();
    fs::write(fixture.first.join("notes.txt"), "first café").unwrap();
    fs::write(fixture.second.join("notes.txt"), "second").unwrap();
    {
        let mut live = fixture.current.write().unwrap();
        live.workspace = snapshot(
            2,
            "second",
            &fixture.first,
            &fixture.second,
            &live.protected,
        );
    }
    let first = fixture.call("read_file", json!({"path":"notes.txt"})).await;
    assert_eq!(first.status, OutcomeStatus::Succeeded);
    assert_eq!(result_text(&first), "first café");
    let second = fixture
        .call(
            "read_file",
            json!({"directory":"second","path":"notes.txt"}),
        )
        .await;
    assert_eq!(second.status, OutcomeStatus::Succeeded);
    assert_eq!(result_text(&second), "second");
    // Material added after inventory construction is discovered on demand.
    let list = fixture.call("list_files", json!({})).await;
    assert_eq!(
        body(&list)["entries"],
        json!([{"name":"notes.txt","kind":"file"}])
    );
}

#[tokio::test]
async fn current_grant_revocation_and_directory_replacement_prevent_reads() {
    let fixture = Fixture::new();
    fs::write(fixture.first.join("notes.txt"), "original").unwrap();
    fixture.current.write().unwrap().grants = Arc::new([]);
    failed(
        fixture.call("read_file", json!({"path":"notes.txt"})).await,
        "workspace_access_denied",
    );

    fs::rename(&fixture.first, fixture.base.join("old-first")).unwrap();
    fs::create_dir(&fixture.first).unwrap();
    fs::write(fixture.first.join("notes.txt"), "replacement secret").unwrap();
    {
        let mut live = fixture.current.write().unwrap();
        live.workspace = snapshot(2, "first", &fixture.first, &fixture.second, &live.protected);
        live.grants = grants(&live.workspace);
    }
    failed(
        fixture.call("read_file", json!({"path":"notes.txt"})).await,
        "workspace_access_denied",
    );
}

#[tokio::test]
async fn live_protected_roots_override_previously_granted_membership() {
    let fixture = Fixture::new();
    fs::write(fixture.first.join("notes.txt"), "workspace content").unwrap();
    fixture.current.write().unwrap().protected =
        Arc::new(ProtectedRoots::new(vec![fixture.first.join("future-provider-store")]).unwrap());
    failed(
        fixture.call("read_file", json!({"path":"notes.txt"})).await,
        "protected_root_overlap",
    );
}

#[tokio::test]
async fn native_opens_refuse_internal_and_external_symlinks_hardlinks_and_fifos() {
    let fixture = Fixture::new();
    let outside = fixture.base.join("outside.txt");
    fs::write(&outside, "external secret").unwrap();
    fs::write(fixture.first.join("plain.txt"), "visible").unwrap();
    symlink("plain.txt", fixture.first.join("internal-link")).unwrap();
    symlink(&outside, fixture.first.join("external-link")).unwrap();
    symlink(&fixture.second, fixture.first.join("link-folder")).unwrap();
    fs::hard_link(&outside, fixture.first.join("hard-link")).unwrap();
    assert!(
        std::process::Command::new("/usr/bin/mkfifo")
            .arg(fixture.first.join("pipe"))
            .status()
            .unwrap()
            .success()
    );

    for path in ["internal-link", "external-link", "link-folder/unopened"] {
        failed(
            fixture.call("read_file", json!({"path":path})).await,
            "file_symlink_unsupported",
        );
    }
    for path in ["hard-link", "pipe"] {
        failed(
            fixture.call("read_file", json!({"path":path})).await,
            "file_type_unsupported",
        );
    }
    let listing = fixture.call("list_files", json!({})).await;
    assert_eq!(
        body(&listing)["entries"],
        json!([{"name":"plain.txt","kind":"file"}])
    );
    let search = fixture.call("search_text", json!({"query":"secret"})).await;
    assert_eq!(body(&search)["matches"], json!([]));
    assert_eq!(fs::read_to_string(outside).unwrap(), "external secret");
}

#[tokio::test]
async fn text_and_request_bounds_refuse_binary_oversize_and_traversal() {
    let fixture = Fixture::new();
    fs::write(fixture.first.join("binary"), [b'a', 0, b'b']).unwrap();
    fs::write(fixture.first.join("large"), vec![b'a'; 64 * 1024 + 1]).unwrap();
    failed(
        fixture.call("read_file", json!({"path":"binary"})).await,
        "file_utf8_text_required",
    );
    failed(
        fixture.call("read_file", json!({"path":"large"})).await,
        "file_read_limit",
    );
    for arguments in [
        json!({"path":null}),
        json!({"query":null}),
        json!({"path":"ok","query":null}),
    ] {
        let result = fixture.inventory.prepare(
            OperationId::new("invalid-arguments").unwrap(),
            &ToolId::new("list_files").unwrap(),
            ToolArguments::Json(arguments),
        );
        assert_eq!(result.err().unwrap().code, "file_arguments_invalid");
    }
    for path in ["../escape", "/absolute"] {
        let result = fixture.inventory.prepare(
            OperationId::new("invalid-path").unwrap(),
            &ToolId::new("read_file").unwrap(),
            ToolArguments::Json(json!({"path":path})),
        );
        assert_eq!(result.err().unwrap().code, "file_relative_path_invalid");
    }
}

#[tokio::test]
async fn literal_search_keeps_line_numbers_and_reports_partial_coverage() {
    let fixture = Fixture::new();
    fs::create_dir(fixture.first.join("nested")).unwrap();
    fs::write(
        fixture.first.join("nested/source.txt"),
        format!("A.B\naxb\n{}a.b\n", "é".repeat(300),),
    )
    .unwrap();
    fs::write(fixture.first.join("oversize"), vec![b'a'; 64 * 1024 + 1]).unwrap();
    let search = fixture.call("search_text", json!({"query":"a.b"})).await;
    let body = body(&search);
    let matches = body["matches"].as_array().unwrap();
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0]["line"], 3);
    assert_eq!(matches[0]["path"], "nested/source.txt");
    assert!(matches[0]["snippet"].as_str().unwrap().ends_with("a.b"));
    assert!(body["truncated"].as_bool().unwrap());
    assert!(search.truncated);
}

#[tokio::test]
async fn listing_and_search_bound_result_count_and_encoded_projection() {
    let fixture = Fixture::new();
    for index in 0..140 {
        fs::write(fixture.first.join(format!("file-{index:03}.txt")), "match").unwrap();
    }
    let listing = fixture.call("list_files", json!({})).await;
    assert_eq!(body(&listing)["entries"].as_array().unwrap().len(), 128);
    assert!(listing.truncated);
    let search = fixture.call("search_text", json!({"query":"match"})).await;
    assert_eq!(body(&search)["matches"].as_array().unwrap().len(), 64);
    assert!(search.truncated);
    let limited = prepared(&fixture.inventory, "list_files", json!({}))
        .invoke(InvocationContext {
            max_output_bytes: 512,
            ..context()
        })
        .await;
    assert!(limited.truncated);
    assert!(!body(&limited)["entries"].as_array().unwrap().is_empty());
    assert!(
        serde_json::to_vec(&(&limited.content, &limited.structured))
            .unwrap()
            .len()
            <= 512
    );
}

#[tokio::test]
async fn expiry_or_mid_search_revocation_never_delivers_old_results() {
    use std::sync::atomic::{AtomicUsize, Ordering};

    let fixture = Fixture::new();
    fs::write(fixture.first.join("first.txt"), "private").unwrap();
    fs::write(fixture.first.join("second.txt"), "private").unwrap();
    let original = fixture.current.read().unwrap().clone();
    let calls = Arc::new(AtomicUsize::new(0));
    let observe = calls.clone();
    let tools = Arc::new(
        FileTools::new(
            fixture.captured.clone(),
            Arc::new(move || {
                let mut live = original.clone();
                if observe.fetch_add(1, Ordering::SeqCst) >= 2 {
                    live.grants = Arc::new([]);
                }
                Ok(live)
            }),
        )
        .unwrap(),
    );
    let inventory = inventory(&tools);
    let expired = prepared(&inventory, "list_files", json!({}))
        .invoke(InvocationContext {
            deadline: Some(Instant::now()),
            ..context()
        })
        .await;
    assert_eq!(expired.status, OutcomeStatus::Cancelled);
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    let search = prepared(&inventory, "search_text", json!({"query":"private"}))
        .invoke(context())
        .await;
    failed(search, "workspace_access_denied");
    assert_eq!(calls.load(Ordering::SeqCst), 3);
}

#[tokio::test]
async fn one_turn_bounds_blocking_worker_admission() {
    use std::sync::{Condvar, Mutex};
    use std::time::Duration;

    let fixture = Fixture::new();
    fs::write(fixture.first.join("visible.txt"), "visible").unwrap();
    let live = fixture.current.read().unwrap().clone();
    let (started, mut ready) = tokio::sync::mpsc::unbounded_channel();
    let gate = Arc::new((Mutex::new(false), Condvar::new()));
    let wait = gate.clone();
    let tools = Arc::new(
        FileTools::new(
            fixture.captured.clone(),
            Arc::new(move || {
                let _ = started.send(());
                let (released, condition) = &*wait;
                let _guard = condition
                    .wait_timeout_while(released.lock().unwrap(), Duration::from_secs(2), |value| {
                        !*value
                    })
                    .unwrap();
                Ok(live.clone())
            }),
        )
        .unwrap(),
    );
    let inventory = inventory(&tools);
    let first = tokio::spawn(prepared(&inventory, "list_files", json!({})).invoke(context()));
    let second = tokio::spawn(prepared(&inventory, "list_files", json!({})).invoke(context()));
    tokio::time::timeout(Duration::from_secs(1), async {
        ready.recv().await.unwrap();
        ready.recv().await.unwrap();
    })
    .await
    .unwrap();
    let third = prepared(&inventory, "list_files", json!({}))
        .invoke(context())
        .await;
    {
        let (released, condition) = &*gate;
        *released.lock().unwrap() = true;
        condition.notify_all();
    }
    failed(third, "file_workers_busy");
    assert_eq!(first.await.unwrap().status, OutcomeStatus::Succeeded);
    assert_eq!(second.await.unwrap().status, OutcomeStatus::Succeeded);
}

#[test]
fn registered_range_keeps_the_metadata_and_bytes_of_one_opened_inode() {
    use grida_agent::workspace_file::OpenedWorkspaceFile;
    use std::io::Read;

    let fixture = Fixture::new();
    let file = fixture.first.join("clip.mp4");
    fs::write(&file, b"0123456789").unwrap();
    let modified = fs::metadata(&file).unwrap().modified().unwrap();
    let live = fixture.current.clone();
    let open = || {
        let live = live.clone();
        OpenedWorkspaceFile::open(
            &fixture.captured,
            &id("first"),
            Path::new("clip.mp4"),
            Arc::new(move || Ok(live.read().unwrap().clone())),
        )
        .unwrap()
    };

    let opened = open();
    assert_eq!(opened.size(), 10);
    assert_eq!(opened.modified(), modified);
    fs::rename(&file, fixture.first.join("prior.mp4")).unwrap();
    fs::write(&file, b"new").unwrap();

    let mut bytes = Vec::new();
    opened.range(3, 4).unwrap().read_to_end(&mut bytes).unwrap();
    assert_eq!(bytes, b"3456");
    assert!(
        open()
            .range(3, 0)
            .unwrap()
            .read_to_end(&mut Vec::new())
            .is_ok()
    );
    assert_eq!(
        open().range(u64::MAX, 1).err().unwrap().code,
        "workspace_file_range_invalid"
    );
    assert_eq!(
        open().range(2, 2).err().unwrap().code,
        "workspace_file_range_invalid"
    );
}

#[test]
fn registered_range_refuses_unproven_aliases_and_uses_an_in_root_symbolic_target() {
    use grida_agent::workspace_file::OpenedWorkspaceFile;
    use std::io::Read;

    let fixture = Fixture::new();
    let outside = fixture.second.join("outside.mp4");
    let inside = fixture.first.join("inside.mp4");
    fs::write(&outside, b"outside").unwrap();
    fs::write(&inside, b"inside").unwrap();
    symlink(&outside, fixture.first.join("escape.mp4")).unwrap();
    symlink(&inside, fixture.first.join("alias.mp4")).unwrap();
    fs::hard_link(&outside, fixture.first.join("hardlink.mp4")).unwrap();
    fs::create_dir(fixture.first.join("folder")).unwrap();
    let open = |path: &str| {
        let live = fixture.current.clone();
        OpenedWorkspaceFile::open(
            &fixture.captured,
            &id("first"),
            Path::new(path),
            Arc::new(move || Ok(live.read().unwrap().clone())),
        )
    };

    let mut bytes = Vec::new();
    open("alias.mp4")
        .unwrap()
        .range(1, 3)
        .unwrap()
        .read_to_end(&mut bytes)
        .unwrap();
    assert_eq!(bytes, b"nsi");
    for (path, error) in [
        ("../second/outside.mp4", "file_relative_path_invalid"),
        ("escape.mp4", "workspace_path_outside_root"),
        ("hardlink.mp4", "file_type_unsupported"),
        ("folder", "file_type_unsupported"),
    ] {
        assert_eq!(open(path).err().unwrap().code, error);
    }
    fs::hard_link(&inside, fixture.first.join("other-name.mp4")).unwrap();
    assert_eq!(
        open("inside.mp4").err().unwrap().code,
        "file_type_unsupported"
    );
}

#[test]
fn registered_range_withholds_bytes_if_the_grant_changes_during_a_read() {
    use grida_agent::workspace_file::OpenedWorkspaceFile;
    use std::io::{ErrorKind, Read};
    use std::sync::atomic::{AtomicUsize, Ordering};

    let fixture = Fixture::new();
    fs::write(fixture.first.join("video.mp4"), b"private").unwrap();
    let live = fixture.current.clone();
    let checks = Arc::new(AtomicUsize::new(0));
    let current = {
        let checks = checks.clone();
        Arc::new(move || {
            let mut current = live.read().unwrap().clone();
            let check = checks.load(Ordering::Relaxed);
            if check > 0 && checks.fetch_add(1, Ordering::Relaxed) > 1 {
                current.grants = Arc::default();
            }
            Ok(current)
        })
    };
    let mut range = OpenedWorkspaceFile::open(
        &fixture.captured,
        &id("first"),
        Path::new("video.mp4"),
        current,
    )
    .unwrap()
    .range(0, 7)
    .unwrap();

    checks.store(1, Ordering::Relaxed);
    let mut bytes = [0xa5; 7];
    let error = range.read(&mut bytes).unwrap_err();
    assert_eq!(error.kind(), ErrorKind::PermissionDenied);
    assert_eq!(error.to_string(), "workspace_access_denied");
    assert_eq!(bytes, [0xa5; 7]);
}

#[test]
fn registered_range_refuses_replaced_roots_and_current_protected_paths() {
    use grida_agent::workspace_file::OpenedWorkspaceFile;

    let fixture = Fixture::new();
    fs::write(fixture.first.join("video.mp4"), b"private").unwrap();
    let open = || {
        let live = fixture.current.clone();
        OpenedWorkspaceFile::open(
            &fixture.captured,
            &id("first"),
            Path::new("video.mp4"),
            Arc::new(move || Ok(live.read().unwrap().clone())),
        )
    };

    fixture.current.write().unwrap().protected =
        Arc::new(ProtectedRoots::new(vec![fixture.first.join("video.mp4")]).unwrap());
    assert_eq!(open().err().unwrap().code, "protected_root_overlap");
    fixture.current.write().unwrap().protected = Arc::new(ProtectedRoots::new(vec![]).unwrap());
    fs::rename(&fixture.first, fixture.base.join("old-workspace")).unwrap();
    fs::create_dir(&fixture.first).unwrap();
    fs::write(fixture.first.join("video.mp4"), b"other identity").unwrap();
    assert_eq!(open().err().unwrap().code, "workspace_directory_changed");
}

#[test]
fn registered_range_refuses_an_open_inode_moved_outside_its_root() {
    use grida_agent::workspace_file::OpenedWorkspaceFile;
    use std::io::{ErrorKind, Read};

    let fixture = Fixture::new();
    let clip = fixture.first.join("clip.mp4");
    fs::write(&clip, b"private").unwrap();
    let live = fixture.current.clone();
    let mut range = OpenedWorkspaceFile::open(
        &fixture.captured,
        &id("first"),
        Path::new("clip.mp4"),
        Arc::new(move || Ok(live.read().unwrap().clone())),
    )
    .unwrap()
    .range(0, 7)
    .unwrap();
    fs::rename(&clip, fixture.second.join("moved.mp4")).unwrap();
    fs::write(&clip, b"replacement").unwrap();
    let mut output = [0xa5; 7];
    let error = range.read(&mut output).unwrap_err();
    assert_eq!(error.kind(), ErrorKind::PermissionDenied);
    assert_eq!(error.to_string(), "file_path_changed");
    assert_eq!(output, [0xa5; 7]);
}
