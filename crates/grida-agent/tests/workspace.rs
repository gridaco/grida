#![cfg(unix)]

use agent_kit_core::{BindingId, ErrorKind};
use grida_agent::workspace::{
    DirectoryGrant, DirectorySpec, FileAccess, ProtectedRoots, WorkspaceSnapshot,
};
use std::fs;
use std::os::unix::fs::symlink;
use std::path::{Path, PathBuf};

fn id(value: &str) -> BindingId {
    BindingId::new(value).unwrap()
}

fn directory(name: &str, path: PathBuf) -> DirectorySpec {
    DirectorySpec {
        id: id(name),
        name: name.to_owned(),
        path,
        generation: id("first"),
    }
}

fn grant(snapshot: &WorkspaceSnapshot, name: &str, write: bool) -> DirectoryGrant {
    DirectoryGrant::bind(snapshot, &id(name), true, write).unwrap()
}

fn temp() -> (tempfile::TempDir, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().canonicalize().unwrap();
    (temp, path)
}

#[test]
fn defaults_are_captured_and_never_retarget_a_prepared_path() {
    let (_temp, base) = temp();
    let first = base.join("first");
    let second = base.join("second");
    for root in [&first, &second] {
        fs::create_dir(root).unwrap();
        fs::write(root.join("same.txt"), "separate").unwrap();
    }
    let protected = ProtectedRoots::new(vec![]).unwrap();
    let specs = vec![
        directory("first", first.clone()),
        directory("second", second.clone()),
    ];
    let current = WorkspaceSnapshot::capture(
        id("project"),
        5,
        specs.clone(),
        Some(id("first")),
        &protected,
    )
    .unwrap();
    let grants = [
        grant(&current, "first", true),
        grant(&current, "second", true),
    ];
    let selected = current
        .select(
            None,
            Path::new("same.txt"),
            FileAccess::Write,
            &grants,
            &protected,
        )
        .unwrap();
    assert_eq!(selected.path(), first.join("same.txt"));
    assert_eq!(selected.captured_revision(), 5);
    let changed =
        WorkspaceSnapshot::capture(id("project"), 6, specs, Some(id("second")), &protected)
            .unwrap();
    selected.revalidate(&changed, &grants, &protected).unwrap();
    assert_eq!(selected.path(), first.join("same.txt"));
    let new_selection = changed
        .select(
            None,
            Path::new("same.txt"),
            FileAccess::Write,
            &grants,
            &protected,
        )
        .unwrap();
    assert_eq!(new_selection.path(), second.join("same.txt"));
    assert_eq!(
        selected
            .revalidate(&changed, &grants[1..], &protected)
            .unwrap_err()
            .code,
        "workspace_access_denied"
    );
}

#[test]
fn nested_roots_keep_independent_grants() {
    let (_temp, base) = temp();
    let parent = base.join("project");
    let child = parent.join("submodule");
    fs::create_dir_all(&child).unwrap();
    let protected = ProtectedRoots::new(vec![]).unwrap();
    let snapshot = WorkspaceSnapshot::capture(
        id("workspace"),
        1,
        vec![
            directory("parent", parent),
            directory("child", child.clone()),
        ],
        Some(id("parent")),
        &protected,
    )
    .unwrap();
    let grants = [
        grant(&snapshot, "parent", true),
        grant(&snapshot, "child", false),
    ];
    assert!(
        snapshot
            .select(
                Some(&id("child")),
                Path::new("new.txt"),
                FileAccess::Write,
                &grants,
                &protected
            )
            .is_err()
    );
    assert_eq!(
        snapshot
            .select(
                None,
                Path::new("submodule/new.txt"),
                FileAccess::Write,
                &grants,
                &protected
            )
            .unwrap()
            .path(),
        child.join("new.txt")
    );
}

#[test]
fn protected_tree_denies_aliases_ancestors_and_not_yet_created_paths() {
    let (_temp, base) = temp();
    let project = base.join("project");
    let custody = base.join("custody");
    fs::create_dir(&project).unwrap();
    fs::create_dir(&custody).unwrap();
    symlink(&custody, project.join("alias")).unwrap();
    let protected = ProtectedRoots::new(vec![custody.join("future")]).unwrap();
    assert!(
        WorkspaceSnapshot::capture(
            id("workspace"),
            1,
            vec![directory("parent", base.clone())],
            Some(id("parent")),
            &protected,
        )
        .is_err()
    );
    let snapshot = WorkspaceSnapshot::capture(
        id("workspace"),
        1,
        vec![directory("project", project.clone())],
        Some(id("project")),
        &protected,
    )
    .unwrap();
    let result = snapshot.select(
        None,
        Path::new("alias/future/key"),
        FileAccess::Write,
        &[grant(&snapshot, "project", true)],
        &protected,
    );
    assert_eq!(result.err().unwrap().code, "protected_root_overlap");
    symlink(base.join("absent"), project.join("broken")).unwrap();
    let result = snapshot.select(
        None,
        Path::new("broken/new"),
        FileAccess::Write,
        &[grant(&snapshot, "project", true)],
        &protected,
    );
    assert!(result.is_err());
}

#[test]
fn replaced_root_and_retargeted_path_cannot_reuse_old_selection() {
    let (_temp, base) = temp();
    let project = base.join("project");
    fs::create_dir(&project).unwrap();
    for name in ["first", "second"] {
        fs::write(project.join(name), name).unwrap();
    }
    symlink("first", project.join("target")).unwrap();
    let protected = ProtectedRoots::new(vec![]).unwrap();
    let snapshot = WorkspaceSnapshot::capture(
        id("workspace"),
        1,
        vec![directory("project", project.clone())],
        Some(id("project")),
        &protected,
    )
    .unwrap();
    let grants = [grant(&snapshot, "project", true)];
    let target = snapshot
        .select(
            None,
            Path::new("target"),
            FileAccess::Read,
            &grants,
            &protected,
        )
        .unwrap();
    fs::remove_file(project.join("target")).unwrap();
    symlink("second", project.join("target")).unwrap();
    assert_eq!(
        target
            .revalidate(&snapshot, &grants, &protected)
            .unwrap_err()
            .code,
        "workspace_path_changed"
    );
    fs::rename(&project, base.join("old-project")).unwrap();
    fs::create_dir(&project).unwrap();
    let replacement = WorkspaceSnapshot::capture(
        id("workspace"),
        2,
        vec![directory("project", project)],
        Some(id("project")),
        &protected,
    )
    .unwrap();
    assert_eq!(
        target
            .revalidate(&replacement, &grants, &protected)
            .unwrap_err()
            .code,
        "workspace_directory_changed"
    );
}

#[test]
fn rootless_workspace_and_duplicate_real_directory_are_distinct() {
    let (_temp, base) = temp();
    let protected = ProtectedRoots::new(vec![]).unwrap();
    let rootless =
        WorkspaceSnapshot::capture(id("workspace"), 1, vec![], None, &protected).unwrap();
    assert_eq!(
        rootless
            .select(None, Path::new(""), FileAccess::Read, &[], &protected)
            .err()
            .unwrap()
            .code,
        "workspace_directory_required"
    );
    let project = base.join("project");
    let alias = base.join("alias");
    fs::create_dir(&project).unwrap();
    symlink(&project, &alias).unwrap();
    let capture = WorkspaceSnapshot::capture(
        id("workspace"),
        1,
        vec![directory("project", project), directory("alias", alias)],
        Some(id("project")),
        &protected,
    );
    assert_eq!(capture.err().unwrap().kind, ErrorKind::Conflict);
}

#[test]
fn persisted_selection_is_revalidated_and_does_not_grant_access() {
    use grida_agent::workspace::FileTarget;

    let (_temp, base) = temp();
    let project = base.join("project");
    fs::create_dir(&project).unwrap();
    let protected = ProtectedRoots::new(vec![]).unwrap();
    let specs = vec![directory("project", project.clone())];
    let first = WorkspaceSnapshot::capture(
        id("workspace"),
        1,
        specs.clone(),
        Some(id("project")),
        &protected,
    )
    .unwrap();
    let grants = [grant(&first, "project", true)];
    let selected = first
        .select(
            None,
            Path::new("draft"),
            FileAccess::Write,
            &grants,
            &protected,
        )
        .unwrap();
    let mut encoded = serde_json::to_value(&selected).unwrap();
    let restored: FileTarget = serde_json::from_value(encoded.clone()).unwrap();
    assert_eq!(selected, restored);
    assert_eq!(
        restored
            .revalidate(&first, &[], &protected)
            .unwrap_err()
            .code,
        "workspace_access_denied"
    );
    restored.revalidate(&first, &grants, &protected).unwrap();
    encoded["relative"] = serde_json::json!("../outside");
    encoded["path"] = serde_json::to_value(base.join("outside")).unwrap();
    let forged: FileTarget = serde_json::from_value(encoded).unwrap();
    assert_eq!(
        forged
            .revalidate(&first, &grants, &protected)
            .unwrap_err()
            .code,
        "workspace_relative_path_invalid"
    );

    drop(first);
    fs::rename(&project, base.join("old-project")).unwrap();
    fs::create_dir(&project).unwrap();
    let replacement =
        WorkspaceSnapshot::capture(id("workspace"), 2, specs, Some(id("project")), &protected)
            .unwrap();
    assert_eq!(
        restored
            .revalidate(&replacement, &grants, &protected)
            .unwrap_err()
            .code,
        "workspace_directory_changed"
    );
    assert_eq!(
        replacement
            .select(
                None,
                Path::new("draft"),
                FileAccess::Write,
                &grants,
                &protected
            )
            .unwrap_err()
            .code,
        "workspace_access_denied"
    );
}

#[test]
fn retargeted_protected_alias_cannot_release_its_captured_directory() {
    let (_temp, base) = temp();
    let old = base.join("old-custody");
    let current = base.join("new-custody");
    let alias = base.join("custody");
    fs::create_dir(&old).unwrap();
    fs::create_dir(&current).unwrap();
    symlink(&old, &alias).unwrap();
    let protected = ProtectedRoots::new(vec![alias.clone()]).unwrap();
    fs::remove_file(&alias).unwrap();
    symlink(&current, &alias).unwrap();
    for path in [&old, &current, &alias] {
        assert_eq!(
            protected.check(path).unwrap_err().code,
            "protected_root_overlap"
        );
    }
}
