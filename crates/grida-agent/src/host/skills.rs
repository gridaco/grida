//! GRIDA-SEC-007 discovery and capture within an explicitly readable project.

use super::*;
use crate::skills::{CapturedGuidance, ProjectRoot, SkillDescription};

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

    pub async fn skill_catalog(&self, session: SessionId) -> Result<Vec<SkillDescription>> {
        self.owned_control(move |host| async move {
            let view = host.store.inspect(session).await?;
            let root = host.guidance_scope(&view)?;
            tokio::task::spawn_blocking(move || crate::skills::catalog(root.as_ref()))
                .await
                .map_err(|_| problem(ErrorKind::Unavailable, "skill_discovery_interrupted"))?
        })
        .await
    }
}

pub(super) async fn capture_guidance(
    root: Option<ProjectRoot>,
    parts: &[PromptPart],
) -> Result<Option<CapturedGuidance>> {
    let selected = parts
        .iter()
        .filter_map(|part| match part {
            PromptPart::Skill { reference } => Some(reference.clone()),
            _ => None,
        })
        .collect();
    tokio::task::spawn_blocking(move || crate::skills::capture(root.as_ref(), selected))
        .await
        .map_err(|_| problem(ErrorKind::Unavailable, "skill_capture_interrupted"))?
}
