//! Retained project instruction sources and their model and reviewer context.

use super::*;
use std::borrow::Cow;
#[cfg(unix)]
use std::path::Path;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct ProjectDocument {
    source: String,
    revision: String,
    body: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    scope: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub(super) enum ProjectGuidance {
    Scoped {
        directory: String,
        revision: String,
        sources: Vec<ProjectDocument>,
    },
    // Preserve the stored shape and revision of a root-only capture.
    Root(ProjectDocument),
}

impl ProjectGuidance {
    #[cfg(unix)]
    pub(super) fn capture(root: &ProjectRoot, directory: &Path) -> Result<Option<Self>> {
        let scoped = !directory.as_os_str().is_empty();
        let sources = root
            .project_guidance(directory)?
            .into_iter()
            .map(|(scope, body)| {
                let source = scope.join("AGENTS.md").to_string_lossy().into_owned();
                let revision = Fingerprint::of(&(&source, &body))?.to_hex();
                let scope = scoped.then(|| {
                    if scope.as_os_str().is_empty() {
                        ".".into()
                    } else {
                        scope.to_string_lossy().into_owned()
                    }
                });
                Ok(ProjectDocument {
                    source,
                    revision,
                    body,
                    scope,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        if !scoped {
            return Ok(sources.into_iter().next().map(Self::Root));
        }
        let directory = directory.to_string_lossy().into_owned();
        let revision = Fingerprint::of(&(&directory, &sources))?.to_hex();
        Ok(Some(Self::Scoped {
            directory,
            revision,
            sources,
        }))
    }

    pub(super) fn revision(&self) -> &str {
        match self {
            Self::Scoped { revision, .. } => revision,
            Self::Root(document) => &document.revision,
        }
    }

    pub(super) fn instructions(&self) -> Cow<'_, str> {
        match self {
            Self::Root(document) => Cow::Borrowed(&document.body),
            Self::Scoped {
                directory, sources, ..
            } => {
                let mut instructions = format!("Starting directory: {directory}");
                for document in sources {
                    instructions.push_str(&format!(
                        "\n\n{} (scope: {})\n{}",
                        document.source,
                        document.scope.as_deref().unwrap_or("."),
                        document.body
                    ));
                }
                Cow::Owned(instructions)
            }
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::os::unix::fs::symlink;

    #[test]
    fn root_capture_preserves_the_original_encoding_and_revision() {
        let temporary = tempfile::tempdir().unwrap();
        let path = temporary.path().canonicalize().unwrap();
        let root = ProjectRoot::open(&path).unwrap();
        let body = "# Project instructions\n\nDevelopment workflow.";
        fs::write(path.join("AGENTS.md"), body).unwrap();
        let capture = ProjectGuidance::capture(&root, Path::new(""))
            .unwrap()
            .unwrap();
        let value = json!({
            "source": "AGENTS.md",
            "revision": Fingerprint::of(&("AGENTS.md", &body)).unwrap().to_hex(),
            "body": body,
        });
        let restored: ProjectGuidance = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(restored, capture);
        assert_eq!(serde_json::to_value(&capture).unwrap(), value);
        assert_eq!(capture.instructions(), body);
    }

    #[test]
    fn a_known_starting_directory_is_retained_even_without_documents() {
        let temporary = tempfile::tempdir().unwrap();
        let path = temporary.path().canonicalize().unwrap();
        fs::create_dir(path.join("nested")).unwrap();
        fs::write(path.join("AGENTS.md"), " \n\t").unwrap();
        let root = ProjectRoot::open(&path).unwrap();
        assert!(
            ProjectGuidance::capture(&root, Path::new(""))
                .unwrap()
                .is_none()
        );
        let capture = ProjectGuidance::capture(&root, Path::new("nested"))
            .unwrap()
            .unwrap();
        assert_eq!(capture.instructions(), "Starting directory: nested");
        assert_eq!(serde_json::to_value(capture).unwrap()["sources"], json!([]));
    }

    #[test]
    fn a_project_chain_enforces_one_document_budget() {
        let temporary = tempfile::tempdir().unwrap();
        let path = temporary.path().canonicalize().unwrap();
        fs::create_dir(path.join("nested")).unwrap();
        fs::write(path.join("AGENTS.md"), "a".repeat(MAX_SOURCE_BYTES - 1)).unwrap();
        let nested = path.join("nested/AGENTS.md");
        fs::write(&nested, "b").unwrap();
        let root = ProjectRoot::open(&path).unwrap();
        assert!(
            ProjectGuidance::capture(&root, Path::new("nested"))
                .unwrap()
                .is_some()
        );
        fs::write(&nested, "bc").unwrap();
        let error = ProjectGuidance::capture(&root, Path::new("nested")).unwrap_err();
        assert_eq!(error.kind, ErrorKind::LimitExceeded);
        assert_eq!(error.code, "project_instruction_limit_exceeded");
    }

    #[test]
    fn a_deep_chain_with_short_documents_still_bounds_retained_paths() {
        let temporary = tempfile::tempdir().unwrap();
        let project = temporary.path().canonicalize().unwrap();
        let mut scope = std::path::PathBuf::new();
        for _ in 0..90 {
            scope.push("packages");
            let path = project.join(&scope);
            fs::create_dir(&path).unwrap();
            fs::write(path.join("AGENTS.md"), "Scope").unwrap();
        }
        let root = ProjectRoot::open(&project).unwrap();
        let error = ProjectGuidance::capture(&root, &scope).unwrap_err();
        assert_eq!(error.kind, ErrorKind::LimitExceeded);
        assert_eq!(error.code, "project_instruction_limit_exceeded");
    }

    #[test]
    fn linked_project_directories_and_instruction_files_are_refused() {
        let temporary = tempfile::tempdir().unwrap();
        let path = temporary.path().canonicalize().unwrap();
        let project = path.join("project");
        fs::create_dir_all(project.join("nested")).unwrap();
        let external = path.join("AGENTS.md");
        fs::write(&external, "Outside project.").unwrap();
        symlink(&path, project.join("linked")).unwrap();
        symlink(&external, project.join("nested/AGENTS.md")).unwrap();
        let root = ProjectRoot::open(&project).unwrap();
        for directory in [Path::new("linked"), Path::new("../")] {
            assert_eq!(
                ProjectGuidance::capture(&root, directory).unwrap_err().code,
                "project_instruction_directory_invalid"
            );
        }
        assert_eq!(
            ProjectGuidance::capture(&root, Path::new("nested"))
                .unwrap_err()
                .code,
            "project_instruction_unavailable"
        );
    }
}
