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

    pub(super) fn descriptions(
        &self,
        root: Option<&ProjectRoot>,
        personal: Option<&PersonalSkills>,
        picker: bool,
    ) -> Result<Vec<SkillDescription>> {
        let mut descriptions = Vec::new();
        #[allow(unused_mut)] // The Unix build can insert names from filesystem sources.
        let mut names = BTreeSet::<String>::new();
        #[cfg(unix)]
        for layer in native::layers(root, personal) {
            let Some(layer) = accessible_for_listing(layer.map(Some), picker)? else {
                continue;
            };
            let Some(layer_names) = accessible_for_listing(layer.names().map(Some), picker)? else {
                continue;
            };
            for name in layer_names {
                if !picker && names.contains(&name) {
                    continue;
                }
                if let Some(skill) = accessible_for_listing(layer.skill(&name), picker)? {
                    descriptions.push(skill.descriptor);
                    if !picker {
                        names.insert(name);
                    }
                    if descriptions.len() > MAX_CATALOG {
                        return Err(problem(ErrorKind::LimitExceeded, "skill_catalog_limit"));
                    }
                }
            }
        }
        #[cfg(not(unix))]
        let _ = (root, personal);
        for &(name, text) in &BUILTIN {
            if picker || !names.contains(name) {
                descriptions.push(bundled_skill(None, name, text)?.descriptor);
            }
        }
        for package in self.eligible() {
            for &(name, text) in package.skills {
                descriptions.push(bundled_skill(Some(package.id), name, text)?.descriptor);
            }
        }
        if descriptions.len() > MAX_CATALOG {
            return Err(problem(ErrorKind::LimitExceeded, "skill_catalog_limit"));
        }
        // Earlier sources win bare-name lookup. A picker may explicitly select
        // another source, so preserve all entries and their order within a name.
        descriptions.sort_by_cached_key(|skill| selector(skill.extension.as_deref(), &skill.name));
        Ok(descriptions)
    }

    pub(super) fn listing(&self, root: Option<&ProjectRoot>) -> Result<SkillListing> {
        let (described, workspace_unavailable) = match self.descriptions(root, None, false) {
            Ok(described) => (described, false),
            Err(_) if root.is_some() => (self.descriptions(None, None, false)?, true),
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

    pub(super) fn select(
        &self,
        reference: &SkillReference,
        #[cfg(unix)] layers: &[Result<native::Layer>],
    ) -> Result<CapturedSkill> {
        let (owner, name) = split_selector(reference.name());
        let revision = reference.revision.as_deref();
        #[cfg(unix)]
        let mut found = false;
        #[cfg(not(unix))]
        let found = false;
        #[cfg(unix)]
        if owner.is_none() {
            if revision.is_none()
                && let Some(error) = layers.iter().find_map(|layer| layer.as_ref().err())
            {
                return Err(error.clone());
            }
            let mut legacy_precedence_known = true;
            for layer in layers {
                let candidate = layer
                    .as_ref()
                    .map_err(Clone::clone)
                    .and_then(|layer| layer.skill(name));
                let skill = match candidate {
                    Ok(Some(skill)) => skill,
                    Ok(None) => continue,
                    Err(error) if revision.is_some() && error.kind == ErrorKind::Unavailable => {
                        legacy_precedence_known = false;
                        continue;
                    }
                    Err(error) => return Err(error),
                };
                if revision.is_none_or(|revision| revision == skill.descriptor.revision) {
                    return Ok(skill);
                }
                // A historical link addresses the first workspace match by
                // content. An unreadable earlier source leaves that match unknown.
                if legacy_precedence_known
                    && matches!(
                        skill.descriptor.source,
                        SkillSource::ProjectAgents | SkillSource::ProjectClaude
                    )
                    && revision == Some(skill.content_revision()?.as_str())
                {
                    return Ok(skill);
                }
                legacy_precedence_known = false;
                found = true;
            }
        }
        let bundled = match (owner, revision) {
            // A former standalone name may identify one historical package.
            // An unrelated extension with byte-identical content cannot match.
            (None, Some(_)) => match legacy_owner(name) {
                Some(owner) => self.resolve(Some(owner), name)?,
                None => document(self.packages, None, name)?,
            },
            _ => self.resolve(owner, name)?,
        };
        match bundled {
            Some(skill)
                if revision.is_none_or(|revision| revision == skill.descriptor.revision) =>
            {
                Ok(skill)
            }
            Some(_) => Err(problem(ErrorKind::Conflict, "selected_skill_changed")),
            None if found => Err(problem(ErrorKind::Conflict, "selected_skill_changed")),
            None => Err(problem(
                ErrorKind::Unavailable,
                "selected_skill_unavailable",
            )),
        }
    }

    /// A text mention can select only one eligible source. Unlike a
    /// structured selection, it gives us no basis for choosing between them.
    pub(super) fn unambiguous(
        &self,
        name: &str,
        #[cfg(unix)] layers: &[Result<native::Layer>],
    ) -> Option<CapturedSkill> {
        let bundled = std::iter::once_with(|| document(self.packages, None, name)).chain(
            self.eligible()
                .map(|package| document(self.packages, Some(package.id), name)),
        );
        #[cfg(unix)]
        let candidates = layers
            .iter()
            .map(|layer| layer.as_ref().map_err(Clone::clone)?.skill(name))
            .chain(bundled);
        #[cfg(not(unix))]
        let candidates = bundled;
        let mut found = None;
        for candidate in candidates {
            if let Some(skill) = candidate.ok()? {
                if found.is_some() {
                    return None;
                }
                found = Some(skill);
            }
        }
        found
    }

    fn resolve(&self, owner: Option<&str>, name: &str) -> Result<Option<CapturedSkill>> {
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

#[cfg(unix)]
fn accessible_for_listing<T>(result: Result<Option<T>>, picker: bool) -> Result<Option<T>> {
    match result {
        Err(error) if picker && error.kind == ErrorKind::Unavailable => Ok(None),
        result => result,
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
