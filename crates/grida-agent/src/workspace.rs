//! GRIDA-SEC-004 / GRIDA-SEC-014 — selected workspace roots and protected paths.

use agent_kit_core::{BindingId, Error, ErrorKind, Fingerprint, Result};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Component, Path, PathBuf};

const MAX_ROOTS: usize = 32;
const MAX_PROTECTED_ROOTS: usize = 128;
const MAX_PATH_BYTES: usize = 4096;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DirectorySpec {
    pub id: BindingId,
    pub name: String,
    pub path: PathBuf,
    pub generation: BindingId,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DirectoryGrant {
    workspace: BindingId,
    directory: BindingId,
    generation: BindingId,
    identity: DirectoryIdentity,
    root: PathBuf,
    read: bool,
    write: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileAccess {
    Read,
    Write,
}

/// Host-owned workspace membership and defaults captured for a task.
/// Selection requires an independent, current directory grant. Native
/// directories must supply a stable creation time for durable identity.
pub struct WorkspaceSnapshot {
    id: BindingId,
    revision: u64,
    directories: BTreeMap<BindingId, DirectoryBinding>,
    primary: Option<BindingId>,
}

pub struct DirectoryBinding {
    spec: DirectorySpec,
    root: PathBuf,
    identity: DirectoryIdentity,
    #[cfg(unix)]
    _pin: std::fs::File,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct DirectoryIdentity {
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
    #[cfg(unix)]
    created: std::time::SystemTime,
}

/// A persistable location selection. Revalidate the receipt against live
/// grants, workspace membership, and denials before use. The concrete tool
/// owns safe file opening and content checks.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FileTarget {
    workspace: BindingId,
    revision: u64,
    directory: BindingId,
    generation: BindingId,
    identity: DirectoryIdentity,
    root: PathBuf,
    relative: PathBuf,
    path: PathBuf,
    access: FileAccess,
}

/// Fixed host denials, including protected trees that have not been created.
#[derive(Clone)]
pub struct ProtectedRoots {
    roots: Vec<(PathBuf, PathBuf)>,
}

impl ProtectedRoots {
    pub fn new(roots: Vec<PathBuf>) -> Result<Self> {
        if roots.len() > MAX_PROTECTED_ROOTS {
            return Err(problem(ErrorKind::LimitExceeded, "protected_root_limit"));
        }
        let roots = roots
            .into_iter()
            .map(|root| {
                validate_absolute(&root)?;
                let captured = canonical_nearest(&root)?;
                Ok((root, captured))
            })
            .collect::<Result<_>>()?;
        Ok(Self { roots })
    }

    pub fn check(&self, path: &Path) -> Result<()> {
        validate_absolute(path)?;
        let resolved = canonical_nearest(path)?;
        self.check_resolved(path, &resolved)
    }

    pub(crate) fn scope_paths(&self) -> Vec<PathBuf> {
        self.roots
            .iter()
            .flat_map(|(path, captured)| [path.clone(), captured.clone()])
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect()
    }

    fn check_resolved(&self, path: &Path, resolved: &Path) -> Result<()> {
        for (root, captured) in &self.roots {
            if overlaps(path, root)
                || overlaps(resolved, captured)
                || overlaps(resolved, &canonical_nearest(root)?)
            {
                return Err(problem(ErrorKind::Unavailable, "protected_root_overlap"));
            }
        }
        Ok(())
    }
}

impl DirectoryGrant {
    /// Bind a host-approved grant to this exact native directory. Workspace
    /// membership alone supplies no grant.
    pub fn bind(
        snapshot: &WorkspaceSnapshot,
        directory: &BindingId,
        read: bool,
        write: bool,
    ) -> Result<Self> {
        if !read && !write {
            return Err(problem(ErrorKind::InvalidInput, "workspace_grant_empty"));
        }
        let binding = snapshot.directory(directory)?;
        Ok(Self {
            workspace: snapshot.id.clone(),
            directory: directory.clone(),
            generation: binding.spec.generation.clone(),
            identity: binding.identity,
            root: binding.root.clone(),
            read,
            write,
        })
    }
}

impl WorkspaceSnapshot {
    pub fn capture(
        id: BindingId,
        revision: u64,
        directories: Vec<DirectorySpec>,
        primary: Option<BindingId>,
        protected: &ProtectedRoots,
    ) -> Result<Self> {
        if directories.len() > MAX_ROOTS {
            return Err(problem(ErrorKind::LimitExceeded, "workspace_root_limit"));
        }
        let mut entries = BTreeMap::new();
        let mut names = BTreeSet::new();
        let mut identities = Vec::new();
        for spec in directories {
            if spec.name.trim().is_empty()
                || spec.name.len() > 128
                || spec.name.chars().any(char::is_control)
                || !names.insert(spec.name.clone())
                || entries.contains_key(&spec.id)
            {
                return Err(problem(
                    ErrorKind::InvalidInput,
                    "workspace_directory_ambiguous",
                ));
            }
            let entry = DirectoryBinding::capture(spec, protected)?;
            if identities.contains(&entry.identity) {
                return Err(problem(ErrorKind::Conflict, "workspace_directory_alias"));
            }
            identities.push(entry.identity);
            entries.insert(entry.spec.id.clone(), entry);
        }
        if primary
            .as_ref()
            .is_some_and(|primary| !entries.contains_key(primary))
        {
            return Err(problem(
                ErrorKind::InvalidInput,
                "workspace_primary_missing",
            ));
        }
        Ok(Self {
            id,
            revision,
            directories: entries,
            primary,
        })
    }

    pub fn id(&self) -> &BindingId {
        &self.id
    }
    pub fn revision(&self) -> u64 {
        self.revision
    }
    pub fn primary(&self) -> Option<&BindingId> {
        self.primary.as_ref()
    }
    pub fn directories(&self) -> impl Iterator<Item = &DirectoryBinding> {
        self.directories.values()
    }

    /// An empty relative path addresses the selected directory itself.
    pub fn select(
        &self,
        directory: Option<&BindingId>,
        relative: &Path,
        access: FileAccess,
        grants: &[DirectoryGrant],
        protected: &ProtectedRoots,
    ) -> Result<FileTarget> {
        let directory = directory
            .or(self.primary.as_ref())
            .ok_or_else(|| problem(ErrorKind::Unavailable, "workspace_directory_required"))?;
        let binding = self.directory(directory)?;
        binding.check_grant(&self.id, access, grants)?;
        let path = binding.resolve(relative, protected)?;
        Ok(FileTarget {
            workspace: self.id.clone(),
            revision: self.revision,
            directory: directory.clone(),
            generation: binding.spec.generation.clone(),
            identity: binding.identity,
            root: binding.root.clone(),
            relative: relative.to_path_buf(),
            path,
            access,
        })
    }

    /// Resolve context for permission evaluation without issuing a grant.
    pub(crate) fn permission_directory(
        &self,
        directory: Option<&BindingId>,
        protected: &ProtectedRoots,
    ) -> Result<&DirectoryBinding> {
        let directory = directory
            .or(self.primary.as_ref())
            .ok_or_else(|| problem(ErrorKind::Unavailable, "workspace_directory_required"))?;
        let binding = self.directory(directory)?;
        binding.check_root(protected)?;
        Ok(binding)
    }

    pub(crate) fn permission_identity(&self, protected: &ProtectedRoots) -> Result<Fingerprint> {
        let roots = self
            .directories
            .values()
            .map(|binding| {
                binding.check_root(protected)?;
                binding.permission_identity()
            })
            .collect::<Result<Vec<_>>>()?;
        Fingerprint::of(&(&self.id, self.revision, &self.primary, roots))
    }

    fn directory(&self, id: &BindingId) -> Result<&DirectoryBinding> {
        self.directories
            .get(id)
            .ok_or_else(|| problem(ErrorKind::Unavailable, "workspace_directory_unavailable"))
    }
}

impl DirectoryBinding {
    pub fn spec(&self) -> &DirectorySpec {
        &self.spec
    }
    pub fn root(&self) -> &Path {
        &self.root
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    pub(crate) fn pinned_directory(&self) -> &fs::File {
        &self._pin
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    pub(crate) fn matches_native_identity(
        &self,
        device: &str,
        inode: &str,
        birth_time_ns: &str,
    ) -> bool {
        self.identity.device.to_string() == device
            && self.identity.inode.to_string() == inode
            && self
                .identity
                .created
                .duration_since(std::time::UNIX_EPOCH)
                .is_ok_and(|created| created.as_nanos().to_string() == birth_time_ns)
    }

    pub(crate) fn permission_identity(&self) -> Result<Fingerprint> {
        Fingerprint::of(&(
            &self.spec.id,
            &self.spec.generation,
            &self.root,
            self.identity,
        ))
    }

    #[cfg(unix)]
    fn capture(spec: DirectorySpec, protected: &ProtectedRoots) -> Result<Self> {
        use rustix::fs::{Mode, OFlags, open};
        validate_absolute(&spec.path)?;
        let root = fs::canonicalize(&spec.path)
            .map_err(|_| problem(ErrorKind::Unavailable, "workspace_directory_unavailable"))?;
        validate_absolute(&root)?;
        protected.check_resolved(&spec.path, &root)?;
        let file: std::fs::File = open(
            &root,
            OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::empty(),
        )
        .map_err(|_| problem(ErrorKind::Unavailable, "workspace_directory_unavailable"))?
        .into();
        let metadata = file
            .metadata()
            .map_err(|_| problem(ErrorKind::Unavailable, "workspace_directory_unavailable"))?;
        let entry = Self {
            spec,
            root,
            identity: directory_identity(&metadata)?,
            _pin: file,
        };
        entry.check_root(protected)?;
        Ok(entry)
    }

    #[cfg(not(unix))]
    fn capture(_: DirectorySpec, _: &ProtectedRoots) -> Result<Self> {
        Err(problem(
            ErrorKind::Unsupported,
            "workspace_binding_platform_unsupported",
        ))
    }

    fn check_grant(
        &self,
        workspace: &BindingId,
        access: FileAccess,
        grants: &[DirectoryGrant],
    ) -> Result<()> {
        if grants.iter().any(|grant| {
            grant.workspace == *workspace
                && grant.directory == self.spec.id
                && grant.generation == self.spec.generation
                && grant.identity == self.identity
                && grant.root == self.root
                && match access {
                    FileAccess::Read => grant.read,
                    FileAccess::Write => grant.write,
                }
        }) {
            Ok(())
        } else {
            Err(problem(ErrorKind::Unavailable, "workspace_access_denied"))
        }
    }

    fn check_root(&self, protected: &ProtectedRoots) -> Result<()> {
        let current = fs::canonicalize(&self.spec.path)
            .map_err(|_| problem(ErrorKind::Unavailable, "workspace_directory_unavailable"))?;
        protected.check_resolved(&self.spec.path, &current)?;
        if current != self.root {
            return Err(problem(ErrorKind::Conflict, "workspace_directory_changed"));
        }
        #[cfg(unix)]
        {
            let metadata = fs::symlink_metadata(&current)
                .map_err(|_| problem(ErrorKind::Unavailable, "workspace_directory_unavailable"))?;
            if !metadata.is_dir() || directory_identity(&metadata)? != self.identity {
                return Err(problem(ErrorKind::Conflict, "workspace_directory_changed"));
            }
        }
        Ok(())
    }

    fn resolve(&self, relative: &Path, protected: &ProtectedRoots) -> Result<PathBuf> {
        validate_relative(relative)?;
        self.check_root(protected)?;
        let requested = self.root.join(relative);
        let resolved = canonical_nearest(&requested)?;
        validate_absolute(&resolved)?;
        protected.check_resolved(&requested, &resolved)?;
        if !resolved.starts_with(&self.root) {
            return Err(problem(
                ErrorKind::Unavailable,
                "workspace_path_outside_root",
            ));
        }
        Ok(resolved)
    }
}

impl FileTarget {
    pub fn directory(&self) -> &BindingId {
        &self.directory
    }
    pub fn captured_revision(&self) -> u64 {
        self.revision
    }
    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn path(&self) -> &Path {
        &self.path
    }
    pub fn relative(&self) -> &Path {
        &self.relative
    }
    pub fn access(&self) -> FileAccess {
        self.access
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    pub(crate) fn read_root<'a>(
        &self,
        current: &'a WorkspaceSnapshot,
        grants: &[DirectoryGrant],
        protected: &ProtectedRoots,
    ) -> Result<&'a fs::File> {
        if self.access != FileAccess::Read || !self.relative.as_os_str().is_empty() {
            return Err(problem(
                ErrorKind::InvalidInput,
                "workspace_read_root_required",
            ));
        }
        self.revalidate(current, grants, protected)?;
        Ok(&current.directory(&self.directory)?._pin)
    }

    pub fn revalidate(
        &self,
        current: &WorkspaceSnapshot,
        grants: &[DirectoryGrant],
        protected: &ProtectedRoots,
    ) -> Result<()> {
        if current.id != self.workspace || current.revision < self.revision {
            return Err(problem(ErrorKind::Conflict, "workspace_snapshot_changed"));
        }
        let binding = current.directory(&self.directory)?;
        if binding.spec.generation != self.generation
            || binding.identity != self.identity
            || binding.root != self.root
        {
            return Err(problem(ErrorKind::Conflict, "workspace_directory_changed"));
        }
        binding.check_grant(&current.id, self.access, grants)?;
        if binding.resolve(&self.relative, protected)? != self.path {
            return Err(problem(ErrorKind::Conflict, "workspace_path_changed"));
        }
        Ok(())
    }
}

#[cfg(unix)]
fn directory_identity(metadata: &fs::Metadata) -> Result<DirectoryIdentity> {
    use std::os::unix::fs::MetadataExt;

    Ok(DirectoryIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
        created: metadata.created().map_err(|_| {
            problem(
                ErrorKind::Unsupported,
                "workspace_directory_identity_unsupported",
            )
        })?,
    })
}

fn validate_relative(relative: &Path) -> Result<()> {
    if relative.to_str().is_none()
        || relative.as_os_str().as_encoded_bytes().len() > MAX_PATH_BYTES
        || relative.as_os_str().as_encoded_bytes().contains(&0)
        || relative
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(problem(
            ErrorKind::InvalidInput,
            "workspace_relative_path_invalid",
        ));
    }
    Ok(())
}

fn overlaps(left: &Path, right: &Path) -> bool {
    left.starts_with(right) || right.starts_with(left)
}

pub(crate) fn validate_absolute(path: &Path) -> Result<()> {
    if !path.is_absolute()
        || path.to_str().is_none()
        || path.as_os_str().as_encoded_bytes().len() > MAX_PATH_BYTES
        || path.as_os_str().as_encoded_bytes().contains(&0)
        || path
            .components()
            .any(|part| matches!(part, Component::ParentDir))
    {
        return Err(problem(ErrorKind::InvalidInput, "host_path_invalid"));
    }
    Ok(())
}

pub(crate) fn canonical_nearest(path: &Path) -> Result<PathBuf> {
    let unavailable = || problem(ErrorKind::Unavailable, "path_authority_unavailable");
    let mut current = path;
    let mut suffix = Vec::new();
    loop {
        match fs::canonicalize(current) {
            Ok(mut canonical) => {
                for name in suffix.into_iter().rev() {
                    canonical.push(name);
                }
                return Ok(canonical);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                match fs::symlink_metadata(current) {
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    _ => return Err(unavailable()),
                }
                suffix.push(current.file_name().ok_or_else(unavailable)?);
                current = current.parent().ok_or_else(unavailable)?;
            }
            Err(_) => return Err(unavailable()),
        }
    }
}

fn problem(kind: ErrorKind, code: &'static str) -> Error {
    Error::new(kind, code)
}
