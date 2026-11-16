//! Enforce the native dependency budgets without maintaining a second allowlist.

use std::collections::{BTreeMap, BTreeSet};
use std::process::Command;

use serde::Deserialize;
use serde_json::json;

const ARCHITECTURE: &str = include_str!("../docs/rust-core.md");
const START: &str = "<!-- agent-dependency-budgets:start -->";
const END: &str = "<!-- agent-dependency-budgets:end -->";

#[derive(Debug)]
struct Budget {
    ring: u8,
    production: BTreeSet<String>,
    test_only: BTreeSet<String>,
}

#[derive(Deserialize)]
struct Metadata {
    workspace_members: BTreeSet<String>,
    packages: Vec<Package>,
}

#[derive(Deserialize)]
struct Package {
    id: String,
    name: String,
    dependencies: Vec<Dependency>,
}

#[derive(Deserialize)]
struct Dependency {
    name: String,
    kind: Option<String>,
    source: Option<String>,
}

fn names(cell: &str) -> Result<BTreeSet<String>, String> {
    if cell == "none" {
        return Ok(BTreeSet::new());
    }
    cell.split(',')
        .map(|item| {
            let name = item
                .trim()
                .strip_prefix('`')
                .and_then(|item| item.strip_suffix('`'))
                .filter(|name| {
                    !name.is_empty()
                        && name
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
                })
                .ok_or_else(|| format!("invalid dependency cell: {cell}"))?;
            Ok(name.to_owned())
        })
        .collect()
}

fn budgets(document: &str) -> Result<BTreeMap<String, Budget>, String> {
    if document.matches(START).count() != 1 || document.matches(END).count() != 1 {
        return Err("expected exactly one dependency budget table".into());
    }
    let section = document
        .split_once(START)
        .and_then(|(_, rest)| rest.split_once(END))
        .map(|(section, _)| section)
        .ok_or("dependency budget markers are out of order")?;
    let mut rows = section
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty());
    let columns = |line: &str| -> Vec<String> {
        line.trim_matches('|')
            .split('|')
            .map(|cell| cell.trim().to_owned())
            .collect()
    };
    if rows.next().map(columns)
        != Some(
            [
                "Package",
                "Ring",
                "Production dependencies",
                "Test-only workspace additions",
            ]
            .map(str::to_owned)
            .to_vec(),
        )
    {
        return Err("unexpected dependency budget columns".into());
    }
    let separator = columns(rows.next().ok_or("missing table separator")?);
    if separator.len() != 4
        || separator
            .iter()
            .any(|cell| cell.len() < 3 || !cell.bytes().all(|byte| b"-:".contains(&byte)))
    {
        return Err("invalid dependency budget separator".into());
    }
    let mut result = BTreeMap::new();
    for row in rows {
        let cells = columns(row);
        if cells.len() != 4 {
            return Err(format!("invalid dependency budget row: {row}"));
        }
        let package = names(&cells[0])?;
        if package.len() != 1 {
            return Err(format!("expected one package: {row}"));
        }
        let name = package.into_iter().next().unwrap();
        let ring = cells[1]
            .strip_prefix('R')
            .and_then(|number| number.parse::<u8>().ok())
            .filter(|ring| *ring <= 3)
            .ok_or_else(|| format!("invalid ring: {}", cells[1]))?;
        let production = names(&cells[2])?;
        let test_only = names(&cells[3])?;
        if (ring != 3 && production.contains("external")) || test_only.contains("external") {
            return Err(format!(
                "external production allowance is host-only: {name}"
            ));
        }
        if result
            .insert(
                name.clone(),
                Budget {
                    ring,
                    production,
                    test_only,
                },
            )
            .is_some()
        {
            return Err(format!("duplicate dependency budget: {name}"));
        }
    }
    if result.is_empty() {
        return Err("empty dependency budget table".into());
    }
    Ok(result)
}

fn agent_package(name: &str) -> bool {
    name.starts_with("agent-kit-") || name == "grida-agent" || name.starts_with("grida-agent-")
}

fn violations(metadata: &Metadata, budgets: &BTreeMap<String, Budget>) -> Vec<String> {
    let workspace: BTreeMap<_, _> = metadata
        .packages
        .iter()
        .filter(|package| metadata.workspace_members.contains(&package.id))
        .map(|package| (package.name.as_str(), package))
        .collect();
    let mut failures = Vec::new();
    for name in workspace.keys().filter(|name| agent_package(name)) {
        if !budgets.contains_key(*name) {
            failures.push(format!("unclassified agent package: {name}"));
        }
    }
    for (name, budget) in budgets {
        let Some(package) = workspace.get(name.as_str()) else {
            failures.push(format!("budget has no workspace package: {name}"));
            continue;
        };
        for dependency in &package.dependencies {
            let development = dependency.kind.as_deref() == Some("dev");
            if !matches!(dependency.kind.as_deref(), None | Some("dev" | "build")) {
                failures.push(format!(
                    "unknown dependency kind: {name} -> {}",
                    dependency.name
                ));
                continue;
            }
            let external = dependency.source.is_some();
            let approved = budget.production.contains(&dependency.name)
                || (external && budget.production.contains("external"))
                || (development && (external || budget.test_only.contains(&dependency.name)));
            if !approved {
                failures.push(format!(
                    "unapproved {} dependency: {name} -> {}",
                    dependency.kind.as_deref().unwrap_or("normal"),
                    dependency.name
                ));
            }
            if !development
                && !external
                && let Some(target) = budgets.get(&dependency.name)
                && target.ring > budget.ring
            {
                failures.push(format!(
                    "outward production dependency: {name} (R{}) -> {} (R{})",
                    budget.ring, dependency.name, target.ring
                ));
            }
        }
    }
    failures
}

#[test]
fn workspace_dependency_budgets() {
    let output = Command::new(env!("CARGO"))
        .current_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/../.."))
        .args([
            "metadata",
            "--format-version",
            "1",
            "--no-deps",
            "--all-features",
            "--offline",
            "--locked",
        ])
        .output()
        .expect("run Cargo metadata");
    assert!(
        output.status.success(),
        "Cargo metadata failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let metadata = serde_json::from_slice(&output.stdout).expect("Cargo metadata JSON");
    let failures = violations(&metadata, &budgets(ARCHITECTURE).unwrap());
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

fn example_workspace() -> serde_json::Value {
    let mut packages: Vec<_> = budgets(ARCHITECTURE)
        .unwrap()
        .keys()
        .map(|name| json!({"id": name, "name": name, "dependencies": []}))
        .collect();
    packages.push(json!({"id": "grida-auth", "name": "grida-auth", "dependencies": []}));
    json!({
        "workspace_members": packages.iter().map(|package| &package["id"]).collect::<Vec<_>>(),
        "packages": packages,
    })
}

fn add_dependency(workspace: &mut serde_json::Value, package: &str, dependency: serde_json::Value) {
    workspace["packages"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|entry| entry["name"] == package)
        .unwrap()["dependencies"]
        .as_array_mut()
        .unwrap()
        .push(dependency);
}

#[test]
fn permitted_composition_and_test_fixtures() {
    let mut workspace = example_workspace();
    for (package, dependency) in [
        ("agent-kit-runtime", json!({"name": "agent-kit-core"})),
        ("grida-agent-master", json!({"name": "agent-kit-runtime"})),
        (
            "grida-agent-master",
            json!({"name": "agent-kit-store-sqlite", "kind": "dev"}),
        ),
        (
            "agent-kit-core",
            json!({"name": "tokio", "kind": "dev", "source": "registry+crates.io"}),
        ),
        ("grida-agent", json!({"name": "grida-auth"})),
        (
            "grida-agent",
            json!({"name": "reqwest", "source": "registry+crates.io"}),
        ),
    ] {
        add_dependency(&mut workspace, package, dependency);
    }
    let failures = violations(
        &serde_json::from_value(workspace).unwrap(),
        &budgets(ARCHITECTURE).unwrap(),
    );
    assert!(failures.is_empty(), "{failures:?}");
}

#[test]
fn refuses_policy_infrastructure_and_test_only_production_edges() {
    for (package, dependency) in [
        ("agent-kit-core", json!({"name": "grida-agent-master"})),
        ("agent-kit-runtime", json!({"name": "agent-kit-sessions"})),
        ("agent-kit-core", json!({"name": "grida-auth"})),
        (
            "agent-kit-core",
            json!({"name": "reqwest", "source": "registry+crates.io"}),
        ),
        (
            "grida-agent-master",
            json!({"name": "agent-kit-store-sqlite"}),
        ),
        (
            "agent-kit-runtime",
            json!({"name": "agent-kit-sessions", "kind": "dev"}),
        ),
        ("grida-agent", json!({"name": "unreviewed-local-adapter"})),
    ] {
        let mut workspace = example_workspace();
        add_dependency(&mut workspace, package, dependency.clone());
        let failures = violations(
            &serde_json::from_value(workspace).unwrap(),
            &budgets(ARCHITECTURE).unwrap(),
        );
        assert!(
            failures
                .iter()
                .any(|failure| failure.contains("unapproved")),
            "accepted {package} -> {dependency}: {failures:?}"
        );
    }
}

#[test]
fn conditional_build_and_renamed_dependencies_do_not_bypass_budgets() {
    for declaration in [
        json!({"name": "agent-kit-sessions", "kind": "build"}),
        json!({"name": "agent-kit-sessions", "optional": true}),
        json!({"name": "agent-kit-sessions", "target": "cfg(windows)"}),
        json!({"name": "agent-kit-sessions", "rename": "agent-kit-core"}),
    ] {
        let mut workspace = example_workspace();
        add_dependency(&mut workspace, "agent-kit-runtime", declaration.clone());
        let failures = violations(
            &serde_json::from_value(workspace).unwrap(),
            &budgets(ARCHITECTURE).unwrap(),
        );
        assert!(!failures.is_empty(), "accepted {declaration}");
    }
}

#[test]
fn outward_production_edges_need_more_than_an_allowlist_entry() {
    let mut rules = budgets(ARCHITECTURE).unwrap();
    rules
        .get_mut("agent-kit-core")
        .unwrap()
        .production
        .insert("agent-kit-runtime".into());
    let mut workspace = example_workspace();
    add_dependency(
        &mut workspace,
        "agent-kit-core",
        json!({"name": "agent-kit-runtime"}),
    );
    let failures = violations(&serde_json::from_value(workspace).unwrap(), &rules);
    assert_eq!(failures.len(), 1);
    assert!(failures[0].contains("outward production dependency"));
}

#[test]
fn new_agent_packages_and_removed_budget_owners_require_classification() {
    let mut workspace = example_workspace();
    workspace["workspace_members"]
        .as_array_mut()
        .unwrap()
        .push(json!("agent-kit-new"));
    workspace["packages"].as_array_mut().unwrap().push(json!({
        "id": "agent-kit-new", "name": "agent-kit-new", "dependencies": []
    }));
    let mut rules = budgets(ARCHITECTURE).unwrap();
    rules.insert(
        "grida-agent-removed".into(),
        Budget {
            ring: 3,
            production: BTreeSet::new(),
            test_only: BTreeSet::new(),
        },
    );
    let failures = violations(&serde_json::from_value(workspace).unwrap(), &rules);
    assert_eq!(failures.len(), 2);
    assert!(
        failures
            .iter()
            .any(|failure| failure.contains("unclassified agent package: agent-kit-new"))
    );
    assert!(failures.iter().any(|failure| failure.contains("budget has no workspace package: grida-agent-removed")));
}

#[test]
fn malformed_or_weakened_budget_tables_fail_closed() {
    let valid = format!(
        "{START}\n| Package | Ring | Production dependencies | Test-only workspace additions |\n\
         | --- | --- | --- | --- |\n\
         | `example-core` | R0 | `serde` | none |\n{END}"
    );
    assert!(budgets(&valid).is_ok());
    for document in [
        valid.replace(START, ""),
        format!("{valid}\n{START}"),
        valid.replace("R0", "R4"),
        valid.replace("`serde`", "`external`"),
        valid.replace(
            END,
            &format!("| `example-core` | R0 | `serde` | none |\n{END}"),
        ),
    ] {
        assert!(
            budgets(&document).is_err(),
            "accepted malformed budget table"
        );
    }
}
