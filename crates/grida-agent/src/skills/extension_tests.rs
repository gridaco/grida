//! Source-qualified selection, bounded discovery, and retained skill identity.

use super::*;

#[test]
fn recovered_listing_keeps_same_named_extension_and_workspace_skills_distinct() {
    let listing: SkillListing = serde_json::from_value(serde_json::json!({"skills":[
        {"name":"inspect","description":"Inspect a page","source":"bundled","extension":"browser"},
        {"name":"history","description":"Page history","source":"bundled","extension":"browser"},
        {"name":"inspect","description":"Inspect a run","source":"bundled","extension":"desktop-fx"},
        {"name":"inspect","description":"Inspect this project","source":"project_agents"}
    ]})).unwrap();
    assert_eq!(
        listing.bundled().collect::<Vec<_>>(),
        ["browser/inspect", "browser/history", "desktop-fx/inspect"]
    );
    let instructions = listing.instructions_with_discovery(true);
    assert!(instructions.contains(".agents/skills/inspect/SKILL.md"));
    assert!(!instructions.contains("Inspect a page"));
    assert!(!instructions.contains("Inspect a run"));
}

#[test]
fn duplicate_extension_skills_resolve_independently_at_acceptance_and_reopen() {
    use extensions::Extension;
    let packages = [
        Extension {
            id: "pages",
            description: "Inspect pages and history.",
            skills: &[
                (
                    "inspect",
                    "---\nname: inspect\ndescription: Inspect pages.\n---\nPage body",
                ),
                (
                    "history",
                    "---\nname: history\ndescription: Read history.\n---\nHistory body",
                ),
            ],
        },
        Extension {
            id: "runs",
            description: "Inspect saved runs.",
            skills: &[(
                "inspect",
                "---\nname: inspect\ndescription: Inspect runs.\n---\nRun body",
            )],
        },
    ];
    let enabled = ["pages".into(), "runs".into()];
    let catalog = Catalog {
        packages: &packages,
        enabled: &enabled,
    };
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let folder = root.join(".agents/skills/inspect");
    std::fs::create_dir_all(&folder).unwrap();
    std::fs::write(
        folder.join("SKILL.md"),
        "---\nname: inspect\ndescription: Inspect this project.\n---\nWorkspace body",
    )
    .unwrap();
    let root = ProjectRoot::open(&root).unwrap();

    let catalog_entries = catalog.descriptions(Some(&root), None, true).unwrap();
    let inspect: Vec<_> = catalog_entries
        .iter()
        .filter(|s| s.name == "inspect")
        .collect();
    assert_eq!(inspect.len(), 3);
    let refs: Vec<_> = inspect
        .iter()
        .map(|s| SkillReference::from_uri(&s.uri).unwrap().unwrap())
        .collect();
    let captured = capture_from(Some(&root), None, refs, &[], &catalog)
        .unwrap()
        .unwrap();
    let captured: CapturedGuidance =
        serde_json::from_slice(&serde_json::to_vec(&captured).unwrap()).unwrap();
    assert!(captured.skills[0].body.ends_with("Workspace body"));
    assert_eq!(captured.skills[1].body, "Page body");
    assert_eq!(captured.skills[2].body, "Run body");

    let listing = catalog.listing(Some(&root)).unwrap();
    let reopened: SkillListing =
        serde_json::from_slice(&serde_json::to_vec(&listing).unwrap()).unwrap();
    assert_eq!(reopened.extension_skills().count(), 3);
    assert_eq!(
        reopened.read_from(&packages, "pages/inspect").unwrap(),
        "Page body"
    );
    assert_eq!(
        reopened.read_from(&packages, "runs/inspect").unwrap(),
        "Run body"
    );
    assert_eq!(
        reopened.read_from(&packages, "pages/history").unwrap(),
        "History body"
    );
    assert_eq!(
        reopened.read_from(&packages, "inspect").unwrap_err().code,
        "skill_not_listed"
    );
    let bare = vec![SkillReference::named("inspect".into()).unwrap()];
    assert!(
        capture_from(Some(&root), None, bare.clone(), &[], &catalog)
            .unwrap()
            .unwrap()
            .skills[0]
            .body
            .ends_with("Workspace body")
    );
    assert_eq!(
        capture_from(None, None, bare, &[], &catalog)
            .unwrap_err()
            .code,
        "ambiguous_bundled_skill"
    );
    assert_eq!(
        catalog
            .listing(None)
            .unwrap()
            .read_from(&packages, "inspect")
            .unwrap_err()
            .code,
        "ambiguous_bundled_skill"
    );

    // Losing the original package, or updating its instructions after
    // acceptance, cannot redirect the older listing to the other copy.
    assert_eq!(
        reopened
            .read_from(&packages[1..], "pages/inspect")
            .unwrap_err()
            .code,
        "skill_unavailable"
    );
    let changed = [Extension {
        id: "pages",
        description: "Inspect pages.",
        skills: &[(
            "inspect",
            "---\nname: inspect\ndescription: Inspect pages.\n---\nNew page body",
        )],
    }];
    assert_eq!(
        reopened
            .read_from(&changed, "pages/inspect")
            .unwrap_err()
            .code,
        "listed_skill_changed"
    );
}

#[test]
fn legacy_package_links_and_captured_listings_read_the_historical_owner() {
    let enabled = [FX_EXTENSION.to_owned(), BROWSER_EXTENSION.to_owned()];
    for name in &enabled {
        let selected = capture_with(
            None,
            vec![SkillReference::named(name.clone()).unwrap()],
            &enabled,
        )
        .unwrap()
        .unwrap();
        let skill = &selected.skills[0];
        let uri = format!("{URI_PREFIX}{name}@{}", skill.descriptor.revision);
        let pinned = SkillReference::from_uri(&uri).unwrap().unwrap();
        assert_eq!(
            capture_with(None, vec![pinned.clone()], &enabled)
                .unwrap()
                .unwrap(),
            selected
        );
        assert_eq!(
            capture_with(None, vec![pinned], &[]).unwrap_err().code,
            "selected_skill_unavailable"
        );
        let changed = SkillReference::from_uri(&format!("{URI_PREFIX}{name}@{}", "f".repeat(64)))
            .unwrap()
            .unwrap();
        assert_eq!(
            capture_with(None, vec![changed], &enabled)
                .unwrap_err()
                .code,
            "selected_skill_changed"
        );
        let value = serde_json::json!({"skills":[{"name":name,"description":"Old summary","source":"bundled"}]});
        let old: SkillListing = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(&old).unwrap(), value);
        assert_eq!(old.read_bundled(name).unwrap(), skill.body);
        assert!(old.extension_skills().all(|s| s.owner.is_none()));
    }
}

#[test]
fn a_pinned_legacy_name_cannot_switch_to_another_package_with_identical_text() {
    let members: &[(&str, &str)] = &[(
        "browser",
        "---\nname: browser\ndescription: Inspect pages.\n---\nSame text",
    )];
    let packages = [
        extensions::Extension {
            id: "browser",
            description: "Original browser.",
            skills: members,
        },
        extensions::Extension {
            id: "other",
            description: "Another browser.",
            skills: members,
        },
    ];
    let revision = catalog::document(&packages, Some("browser"), "browser")
        .unwrap()
        .unwrap()
        .descriptor
        .revision;
    let pinned = SkillReference::from_uri(&format!("grida-skill:browser@{revision}"))
        .unwrap()
        .unwrap();
    let both = ["browser".to_owned(), "other".to_owned()];
    let catalog = Catalog {
        packages: &packages,
        enabled: &both,
    };
    let captured = capture_from(None, None, vec![pinned.clone()], &[], &catalog)
        .unwrap()
        .unwrap();
    assert_eq!(
        captured.skills[0].descriptor.extension.as_deref(),
        Some("browser")
    );
    let other_only = Catalog {
        packages: &packages,
        enabled: &both[1..],
    };
    assert_eq!(
        capture_from(None, None, vec![pinned], &[], &other_only)
            .unwrap_err()
            .code,
        "selected_skill_unavailable"
    );
}
