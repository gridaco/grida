//! GRIDA-SEC-007 discovery and capture in admitted skill sources.

use super::*;
use crate::skills::{CapturedGuidance, ProjectRoot, SkillDescription};

#[cfg(unix)]
fn personal_skills() -> Option<crate::skills::PersonalSkills> {
    std::env::home_dir().and_then(|home| crate::skills::PersonalSkills::open(&home).ok())
}

/// Metadata for the local composer, before it has a session or provider.
/// The trusted launcher has already admitted the optional workspace.
pub fn discover_skill_metadata(
    workspace: Option<(&Path, u64, u64)>,
    bundled_fx: bool,
) -> Result<Vec<SkillDescription>> {
    #[cfg(not(unix))]
    if workspace.is_some() {
        return Err(problem(
            ErrorKind::Unsupported,
            "skill_workspace_unavailable",
        ));
    }
    #[cfg(unix)]
    let root = workspace
        .map(|(path, device, inode)| {
            let root = ProjectRoot::open(path)?;
            if !root.matches_identity(device, inode) {
                return Err(problem(ErrorKind::Conflict, "skill_workspace_changed"));
            }
            Ok(root)
        })
        .transpose()?;
    #[cfg(not(unix))]
    let root: Option<ProjectRoot> = None;
    let optional = if bundled_fx {
        vec!["desktop-fx".to_owned()]
    } else {
        Vec::new()
    };
    catalog(root.as_ref(), &optional)
}

fn catalog(root: Option<&ProjectRoot>, optional: &[String]) -> Result<Vec<SkillDescription>> {
    #[cfg(unix)]
    let personal = personal_skills();
    #[cfg(not(unix))]
    let personal = None;
    crate::skills::catalog_for(root, personal.as_ref(), optional)
}

#[cfg(unix)]
pub(super) struct HeadlessGuidance {
    cwd: PathBuf,
    root: ProjectRoot,
}

impl Host {
    #[cfg(unix)]
    pub(crate) fn with_headless_guidance(mut self, cwd: &Path) -> Result<Self> {
        if self.permissions.is_none() {
            let cwd = canonical_workspace(cwd)?;
            let root = ProjectRoot::open(&cwd)?;
            self.guidance_root = Some(Arc::new(HeadlessGuidance { cwd, root }));
        }
        Ok(self)
    }

    #[cfg(not(unix))]
    pub(crate) fn with_headless_guidance(self, _cwd: &Path) -> Result<Self> {
        Ok(self)
    }

    pub(super) fn guidance_scope(&self, session: &SessionView) -> Result<Option<ProjectRoot>> {
        #[cfg(unix)]
        {
            let cwd = session_configuration(session)?.cwd;
            if let Some(profile) = &self.permissions {
                return profile.guidance_root(&cwd);
            }
            if let Some(scope) = self.guidance_root.as_ref().filter(|scope| scope.cwd == cwd) {
                return scope.root.try_clone().map(Some);
            }
        }
        #[cfg(not(unix))]
        let _ = session;
        Ok(None)
    }

    pub(super) fn optional_bundled_skills(&self) -> Vec<String> {
        self.permissions
            .as_ref()
            .map(|profile| profile.bundled_skills().to_vec())
            .unwrap_or_default()
    }

    pub async fn skill_catalog(&self, session: SessionId) -> Result<Vec<SkillDescription>> {
        self.owned_control(move |host| async move {
            let view = host.store.inspect(session).await?;
            let root = host.guidance_scope(&view)?;
            let optional = host.optional_bundled_skills();
            tokio::task::spawn_blocking(move || catalog(root.as_ref(), &optional))
                .await
                .map_err(|_| problem(ErrorKind::Unavailable, "skill_discovery_interrupted"))?
        })
        .await
    }
}

pub(super) async fn capture_listing(
    root: Option<ProjectRoot>,
    optional: Vec<String>,
) -> Result<crate::skills::SkillListing> {
    tokio::task::spawn_blocking(move || {
        crate::skills::SkillListing::capture_with(root.as_ref(), &optional)
    })
    .await
    .map_err(|_| problem(ErrorKind::Unavailable, "skill_discovery_interrupted"))?
}

pub(super) async fn capture_guidance(
    root: Option<ProjectRoot>,
    parts: &[PromptPart],
    optional: Vec<String>,
) -> Result<Option<CapturedGuidance>> {
    let selected = parts
        .iter()
        .filter_map(|part| match part {
            PromptPart::Skill { reference } => Some(reference.clone()),
            _ => None,
        })
        .collect::<Vec<_>>();
    let plain = crate::skills::mentioned_names(parts.iter().filter_map(|part| match part {
        PromptPart::Text { text } => Some(text.as_str()),
        _ => None,
    }));
    tokio::task::spawn_blocking(move || {
        #[cfg(unix)]
        let personal = (!selected.is_empty() || !plain.is_empty())
            .then(personal_skills)
            .flatten();
        #[cfg(not(unix))]
        let personal = None;
        crate::skills::capture_for(
            root.as_ref(),
            personal.as_ref(),
            selected,
            &plain,
            &optional,
        )
    })
    .await
    .map_err(|_| problem(ErrorKind::Unavailable, "skill_capture_interrupted"))?
}
