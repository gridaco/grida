//! The standalone and extension skills admitted by the host for one catalog.

use super::extensions::Extension;
use super::*;

pub(super) struct Catalog<'a> {
    pub(super) packages: &'a [Extension],
    pub(super) enabled: &'a [String],
}

impl<'a> Catalog<'a> {
    pub(super) fn bundled(enabled: &'a [String]) -> Self {
        Self {
            packages: extensions::BUNDLED,
            enabled,
        }
    }

    fn eligible(&self) -> impl Iterator<Item = &Extension> {
        self.packages
            .iter()
            .filter(|package| self.enabled.iter().any(|id| id == package.id))
    }

    pub(super) fn descriptions(&self, root: Option<&ProjectRoot>) -> Result<Vec<SkillDescription>> {
        let mut descriptions = BTreeMap::new();
        #[cfg(unix)]
        if let Some(root) = root {
            for (directory, source) in root.layers()? {
                for name in directory.names()? {
                    if !valid_name(&name) || descriptions.contains_key(&name) {
                        continue;
                    }
                    if let Some(skill) = directory.skill(&name, source)? {
                        descriptions.insert(name, skill.descriptor);
                        if descriptions.len() > MAX_CATALOG {
                            return Err(problem(ErrorKind::LimitExceeded, "skill_catalog_limit"));
                        }
                    }
                }
            }
        }
        #[cfg(not(unix))]
        let _ = root;
        for &(name, text) in &BUILTIN {
            if !descriptions.contains_key(name) {
                descriptions.insert(name.to_owned(), bundled_skill(None, name, text)?.descriptor);
            }
        }
        for package in self.eligible() {
            for &(name, text) in package.skills {
                let owner = Some(package.id);
                descriptions.insert(
                    selector(owner, name),
                    bundled_skill(owner, name, text)?.descriptor,
                );
            }
        }
        if descriptions.len() > MAX_CATALOG {
            return Err(problem(ErrorKind::LimitExceeded, "skill_catalog_limit"));
        }
        Ok(descriptions.into_values().collect())
    }

    pub(super) fn listing(&self, root: Option<&ProjectRoot>) -> Result<SkillListing> {
        let (described, workspace_unavailable) = match self.descriptions(root) {
            Ok(described) => (described, false),
            Err(_) if root.is_some() => (self.descriptions(None)?, true),
            Err(error) => return Err(error),
        };
        let mut skills: Vec<_> = described
            .into_iter()
            .map(|skill| {
                let package = self
                    .packages
                    .iter()
                    .find(|p| Some(p.id) == skill.extension.as_deref());
                ListedSkill {
                    name: skill.name,
                    description: skill.description,
                    source: skill.source,
                    extension: skill.extension,
                    extension_summary: package.map(|p| p.description.to_owned()),
                    revision: package.map(|_| skill.revision),
                }
            })
            .collect();
        skills.sort_by_key(|skill| skill.source != SkillSource::Bundled);
        Ok(SkillListing {
            skills,
            workspace_unavailable,
        })
    }

    pub(super) fn resolve(&self, owner: Option<&str>, name: &str) -> Result<Option<CapturedSkill>> {
        if owner.is_none()
            && let Some(skill) = document(self.packages, None, name)?
        {
            return Ok(Some(skill));
        }
        let mut matches = self
            .eligible()
            .filter(|p| owner.is_none_or(|owner| p.id == owner))
            .filter_map(|p| {
                p.skills
                    .iter()
                    .find(|(local, _)| *local == name)
                    .map(|(_, text)| (p.id, *text))
            });
        let first = matches.next();
        if matches.next().is_some() {
            return Err(problem(ErrorKind::Conflict, "ambiguous_bundled_skill"));
        }
        first
            .map(|(owner, text)| bundled_skill(Some(owner), name, text))
            .transpose()
    }
}

pub(super) fn document(
    packages: &[Extension],
    owner: Option<&str>,
    name: &str,
) -> Result<Option<CapturedSkill>> {
    let documents = match owner {
        None => &BUILTIN[..],
        Some(owner) => match packages.iter().find(|p| p.id == owner) {
            Some(package) => package.skills,
            None => return Ok(None),
        },
    };
    documents
        .iter()
        .find(|(local, _)| *local == name)
        .map(|(_, text)| bundled_skill(owner, name, text))
        .transpose()
}

fn bundled_skill(owner: Option<&str>, name: &str, text: &str) -> Result<CapturedSkill> {
    let mut skill = parse(name, SkillSource::Bundled, text)?
        .ok_or_else(|| problem(ErrorKind::InvalidState, "invalid_bundled_skill"))?;
    if let Some(owner) = owner {
        let descriptor = &mut skill.descriptor;
        descriptor.extension = Some(owner.to_owned());
        descriptor.uri = format!("{URI_PREFIX}{owner}/{name}@{}", descriptor.revision);
    }
    Ok(skill)
}
