#![cfg(any(target_os = "macos", target_os = "linux"))]

use agent_kit_core::{ArtifactId, ErrorKind, SessionId};
use grida_agent::scratch::{ScratchLimits, ScratchScope};
use grida_agent::workspace::ProtectedRoots;
use std::fs;
use std::io::{self, Read};
use std::os::unix::fs::{PermissionsExt, symlink};
use std::path::{Path, PathBuf};

fn limits() -> ScratchLimits {
    ScratchLimits {
        max_assets: 4,
        max_asset_bytes: 64,
        max_source_bytes: 128,
        max_work_bytes: 128,
    }
}

fn base() -> (tempfile::TempDir, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().canonicalize().unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
    (temp, path)
}

fn asset() -> ArtifactId {
    ArtifactId::new("upload/input").unwrap()
}

fn scope(base: &Path, owner: &str, limits: ScratchLimits) -> ScratchScope {
    ScratchScope::open(
        base,
        SessionId::new(owner).unwrap(),
        limits,
        &ProtectedRoots::new(vec![]).unwrap(),
    )
    .unwrap()
}

#[test]
fn original_and_edited_working_copy_survive_restart_independently() {
    let (_temp, base) = base();
    let mut original = scope(&base, "thread/owner", limits());
    let asset = original
        .retain(asset(), 1, "input.png", b"original".as_slice())
        .unwrap();
    let work = original.materialize(&asset).unwrap();
    assert_eq!(work.path().extension().unwrap(), "png");
    assert_eq!(fs::read(work.path()).unwrap(), b"original");
    fs::write(work.path(), b"edited").unwrap();
    let receipt = work.receipt().clone();
    drop(original);
    let mut reopened = scope(&base, "thread/owner", limits());
    let duplicate = reopened
        .retain(asset.id().clone(), 1, "input.png", b"original".as_slice())
        .unwrap();
    assert_eq!(duplicate, asset);
    assert!(
        reopened
            .retain(asset.id().clone(), 1, "input.png", b"different".as_slice())
            .is_err()
    );
    let reopened_work = reopened.materialize(&asset).unwrap();
    assert_eq!(reopened_work.receipt(), &receipt);
    assert_eq!(reopened_work.path(), work.path());
    assert_eq!(fs::read(reopened_work.path()).unwrap(), b"edited");
    assert_eq!(reopened.read_retained(&asset, 8).unwrap(), b"original");
    assert_eq!(
        reopened.read_retained(&asset, 7).unwrap_err().kind,
        ErrorKind::LimitExceeded
    );
    assert!(
        scope(&base, "different-owner", limits())
            .read_retained(&asset, 8)
            .is_err()
    );
}

#[test]
fn lost_materialized_copy_does_not_become_a_fresh_original() {
    let (_temp, base) = base();
    let mut opened = scope(&base, "owner", limits());
    let original = opened
        .retain(asset(), 1, "image.png", b"original".as_slice())
        .unwrap();
    let work = opened.materialize(&original).unwrap();
    fs::remove_file(work.path()).unwrap();
    drop(opened);
    let mut reopened = scope(&base, "owner", limits());
    assert_eq!(
        reopened.materialize(&original).err().unwrap().code,
        "scratch_working_copy_unavailable"
    );
    assert_eq!(
        reopened
            .retain(asset(), 1, "image.png", b"original".as_slice())
            .unwrap(),
        original
    );
    assert!(!work.path().exists());
    assert_eq!(reopened.read_retained(&original, 8).unwrap(), b"original");
    assert!(!work.path().exists());
}

#[test]
fn an_unreceipted_working_copy_must_match_the_retained_bytes() {
    let (_temp, base) = base();
    let mut opened = scope(&base, "owner", limits());
    let original = opened
        .retain(asset(), 1, "image.png", b"original".as_slice())
        .unwrap();
    let work = opened.materialize(&original).unwrap();
    let sources = work
        .path()
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("sources");
    let marker = fs::read_dir(&sources)
        .unwrap()
        .filter_map(|entry| {
            let entry = entry.unwrap().path();
            (entry.extension().unwrap() == "working").then_some(entry)
        })
        .next()
        .unwrap();
    fs::remove_file(&marker).unwrap();
    fs::write(work.path(), b"modified").unwrap();
    drop(opened);
    let mut reopened = scope(&base, "owner", limits());
    assert_eq!(
        reopened.materialize(&original).err().unwrap().code,
        "scratch_storage_invalid"
    );
    assert!(!marker.exists());
    fs::write(work.path(), b"original").unwrap();
    assert_eq!(
        reopened.materialize(&original).unwrap().receipt(),
        work.receipt()
    );
    assert!(marker.is_file());
}

#[test]
fn malformed_source_and_linked_work_are_rejected() {
    let (_temp, base) = base();
    let mut opened = scope(&base, "owner", limits());
    let original = opened
        .retain(asset(), 1, "image.png", b"original".as_slice())
        .unwrap();
    let work = opened.materialize(&original).unwrap();
    let sources = work
        .path()
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("sources");
    let source = fs::read_dir(&sources)
        .unwrap()
        .filter_map(|entry| {
            let entry = entry.unwrap().path();
            (entry.extension().unwrap() == "asset").then_some(entry)
        })
        .next()
        .unwrap();
    let bytes = fs::read(&source).unwrap();
    let mut corrupted = bytes.clone();
    *corrupted.last_mut().unwrap() ^= 1;
    fs::write(&source, corrupted).unwrap();
    assert_eq!(
        opened.materialize(&original).err().unwrap().code,
        "scratch_storage_invalid"
    );
    fs::write(&source, &bytes).unwrap();
    fs::remove_file(work.path()).unwrap();
    symlink(&source, work.path()).unwrap();
    assert!(opened.materialize(&original).is_err());
    fs::remove_file(work.path()).unwrap();
    fs::hard_link(&source, work.path()).unwrap();
    assert!(opened.materialize(&original).is_err());
    assert_eq!(fs::read(&source).unwrap(), bytes);
}

#[test]
fn limits_bound_consumption_and_leave_failed_retains_retryable() {
    struct Endless {
        read: usize,
    }
    impl Read for &mut Endless {
        fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
            output.fill(b'x');
            self.read += output.len();
            Ok(output.len())
        }
    }
    let (_temp, base) = base();
    let mut scope = scope(
        &base,
        "owner",
        ScratchLimits {
            max_assets: 2,
            max_asset_bytes: 5,
            max_source_bytes: 7,
            max_work_bytes: 4,
        },
    );
    let mut input = Endless { read: 0 };
    assert_eq!(
        scope
            .retain(asset(), 1, "input.bin", &mut input)
            .unwrap_err()
            .kind,
        ErrorKind::LimitExceeded
    );
    assert_eq!(input.read, 6);
    let first = scope
        .retain(asset(), 1, "input.bin", b"first".as_slice())
        .unwrap();
    assert_eq!(
        scope.materialize(&first).err().unwrap().kind,
        ErrorKind::LimitExceeded
    );
    let second = ArtifactId::new("second").unwrap();
    assert_eq!(
        scope
            .retain(second.clone(), 1, "next.bin", b"too".as_slice())
            .unwrap_err()
            .kind,
        ErrorKind::LimitExceeded
    );
    let second = scope
        .retain(second, 1, "next.bin", b"ok".as_slice())
        .unwrap();
    assert_eq!(
        fs::read(scope.materialize(&second).unwrap().path()).unwrap(),
        b"ok"
    );
}

#[test]
fn owner_lock_and_protected_base_isolate_sessions() {
    let (_temp, base) = base();
    let mut first = scope(&base, "owner/one", limits());
    let original = first
        .retain(asset(), 1, "image.png", b"first".as_slice())
        .unwrap();
    let empty = ProtectedRoots::new(vec![]).unwrap();
    let claimed = ScratchScope::open(
        &base,
        SessionId::new("owner/one").unwrap(),
        limits(),
        &empty,
    );
    assert_eq!(claimed.err().unwrap().code, "scratch_owner_in_use");
    let mut second = scope(&base, "owner/two", limits());
    assert_eq!(
        second.materialize(&original).err().unwrap().code,
        "scratch_source_unavailable"
    );
    let protected = ProtectedRoots::new(vec![base.join("future-state")]).unwrap();
    let before = fs::read_dir(&base).unwrap().count();
    let denied = ScratchScope::open(
        &base,
        SessionId::new("owner/three").unwrap(),
        limits(),
        &protected,
    );
    assert_eq!(denied.err().unwrap().code, "protected_root_overlap");
    assert_eq!(fs::read_dir(&base).unwrap().count(), before);
}

#[test]
fn reopen_recovers_interrupted_publication_cleanup_without_deleting_source() {
    let (_temp, base) = base();
    let mut opened = scope(&base, "owner", limits());
    let original = opened
        .retain(asset(), 1, "input.png", b"original".as_slice())
        .unwrap();
    let work = opened.materialize(&original).unwrap();
    let sources = work
        .path()
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("sources");
    let source = fs::read_dir(&sources)
        .unwrap()
        .filter_map(|entry| {
            let entry = entry.unwrap().path();
            (entry.extension().unwrap() == "asset").then_some(entry)
        })
        .next()
        .unwrap();
    let pending = sources.join(format!(".stage-{}", uuid::Uuid::new_v4()));
    fs::hard_link(&source, &pending).unwrap();
    drop(opened);
    let mut reopened = scope(&base, "owner", limits());
    assert!(!pending.exists());
    assert!(source.is_file());
    assert_eq!(
        reopened.materialize(&original).unwrap().receipt(),
        work.receipt()
    );
}

#[cfg(target_os = "macos")]
#[test]
fn scratch_rejects_acl_grants_even_with_owner_only_mode() {
    let (_temp, base) = base();
    assert!(
        std::process::Command::new("/bin/chmod")
            .args(["+a", "everyone allow list"])
            .arg(&base)
            .status()
            .unwrap()
            .success()
    );
    assert_eq!(
        fs::metadata(&base).unwrap().permissions().mode() & 0o777,
        0o700
    );
    let opened = ScratchScope::open(
        &base,
        SessionId::new("owner").unwrap(),
        limits(),
        &ProtectedRoots::new(vec![]).unwrap(),
    );
    assert_eq!(opened.err().unwrap().code, "scratch_storage_invalid");
    assert_eq!(fs::read_dir(&base).unwrap().count(), 0);
}
