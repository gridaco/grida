//! GRIDA-SEC-007 descriptor-relative reads for project and personal guidance.

use super::*;
use rustix::fs::{self, AtFlags, Dir, FileType, Mode, OFlags, Stat};
use rustix::io::Errno;
use std::fs::File;
use std::io::Read as _;
use std::os::unix::fs::MetadataExt as _;
use std::path::{Component, Path, PathBuf};

pub(super) const MAX_LAYER_ENTRIES: usize = 256;

pub(crate) struct Root {
    directory: File,
    identity: (u64, u64),
}

pub(crate) struct PersonalSkills(Root);

pub(super) struct Layer {
    directory: File,
    scope: (u64, u64),
    source: SkillSource,
}

impl PersonalSkills {
    pub(crate) fn open(home: &Path) -> Result<Self> {
        Root::open(home).map(Self)
    }
}

/// Only the declared project and personal locations contribute names.
pub(super) fn layers(
    project: Option<&Root>,
    personal: Option<&PersonalSkills>,
) -> Vec<Result<Layer>> {
    let mut layers = Vec::new();
    if let Some(root) = project {
        layers.extend(
            root.layer(".agents", SkillSource::ProjectAgents)
                .transpose(),
        );
        layers.extend(
            root.layer(".claude", SkillSource::ProjectClaude)
                .transpose(),
        );
    }
    if let Some(personal) = personal {
        // A separately installed personal directory may be unavailable. Keep
        // other choices usable; a reference to that source cannot resolve.
        layers.extend(
            personal
                .0
                .layer(".agents", SkillSource::Personal)
                .ok()
                .flatten()
                .map(Ok),
        );
    }
    layers
}

impl Root {
    pub(crate) fn open(path: &Path) -> Result<Self> {
        let mut components = path.components();
        if components.next() != Some(Component::RootDir) {
            return Err(problem(
                ErrorKind::InvalidInput,
                "workspace_must_be_absolute",
            ));
        }
        let mut root: File = fs::open("/", dir_flags(), Mode::empty())
            .map_err(|_| problem(ErrorKind::Unavailable, "skill_workspace_unavailable"))?
            .into();
        for component in components {
            let Component::Normal(name) = component else {
                return Err(problem(
                    ErrorKind::InvalidInput,
                    "skill_workspace_path_invalid",
                ));
            };
            root = fs::openat(&root, name, dir_flags(), Mode::empty())
                .map_err(|_| problem(ErrorKind::Unavailable, "skill_workspace_unavailable"))?
                .into();
        }
        Self::from_file(root)
    }

    fn from_file(directory: File) -> Result<Self> {
        let metadata = directory.metadata().map_err(|_| unavailable())?;
        Ok(Self {
            directory,
            identity: (metadata.dev(), metadata.ino()),
        })
    }

    pub(crate) fn from_pinned(file: &File) -> Result<Self> {
        Self::from_file(file.try_clone().map_err(|_| unavailable())?)
    }

    pub(crate) fn try_clone(&self) -> Result<Self> {
        Ok(Self {
            directory: self.directory.try_clone().map_err(|_| unavailable())?,
            identity: self.identity,
        })
    }

    pub(crate) fn matches_identity(&self, device: u64, inode: u64) -> bool {
        self.identity == (device, inode)
    }

    fn layer(&self, parent: &str, source: SkillSource) -> Result<Option<Layer>> {
        let Some(owner) = child_directory(&self.directory, parent)? else {
            return Ok(None);
        };
        Ok(child_directory(&owner, "skills")?.map(|directory| Layer {
            directory,
            scope: self.identity,
            source,
        }))
    }

    pub(crate) fn validate_instruction_directory(&self, directory: &Path) -> Result<()> {
        self.instruction_directories(directory, |_, _| Ok(()))
    }

    pub(super) fn project_guidance(&self, directory: &Path) -> Result<Vec<(PathBuf, String)>> {
        let mut documents = Vec::new();
        let mut document_bytes = MAX_SOURCE_BYTES;
        // Scope names can accumulate even when all documents are small.
        let mut path_bytes = MAX_SOURCE_BYTES
            .checked_sub(directory.as_os_str().len())
            .ok_or_else(instruction_limit)?;
        self.instruction_directories(directory, |descriptor, scope| {
            let text = read_document(descriptor, "AGENTS.md").map_err(|error| {
                if error.kind == ErrorKind::LimitExceeded {
                    instruction_limit()
                } else {
                    problem(error.kind, "project_instruction_unavailable")
                }
            })?;
            if let Some(body) = text.filter(|text| !text.trim().is_empty()) {
                document_bytes = document_bytes
                    .checked_sub(body.len())
                    .ok_or_else(instruction_limit)?;
                path_bytes = path_bytes
                    .checked_sub(scope.as_os_str().len())
                    .ok_or_else(instruction_limit)?;
                documents.push((scope.to_path_buf(), body));
            }
            Ok(())
        })?;
        Ok(documents)
    }

    fn instruction_directories(
        &self,
        directory: &Path,
        mut visit: impl FnMut(&File, &Path) -> Result<()>,
    ) -> Result<()> {
        if directory.to_str().is_none() {
            return Err(invalid_instruction_directory());
        }
        let mut descriptor = self.directory.try_clone().map_err(|_| unavailable())?;
        let mut scope = PathBuf::new();
        visit(&descriptor, &scope)?;
        for component in directory.components() {
            let Component::Normal(name) = component else {
                return Err(invalid_instruction_directory());
            };
            descriptor = fs::openat(&descriptor, name, dir_flags(), Mode::empty())
                .map_err(|_| invalid_instruction_directory())?
                .into();
            scope.push(name);
            visit(&descriptor, &scope)?;
        }
        Ok(())
    }
}

fn invalid_instruction_directory() -> Error {
    problem(
        ErrorKind::InvalidInput,
        "project_instruction_directory_invalid",
    )
}

fn instruction_limit() -> Error {
    problem(
        ErrorKind::LimitExceeded,
        "project_instruction_limit_exceeded",
    )
}

impl Layer {
    pub(super) fn names(&self) -> Result<Vec<String>> {
        let mut names = Vec::new();
        let entries = Dir::read_from(&self.directory).map_err(|_| unavailable())?;
        for (index, entry) in entries.enumerate() {
            if index >= MAX_LAYER_ENTRIES {
                return Err(problem(ErrorKind::LimitExceeded, "skill_layer_limit"));
            }
            let entry = entry.map_err(|_| unavailable())?;
            if let Ok(name) = entry.file_name().to_str()
                && valid_name(name)
            {
                names.push(name.to_owned());
            }
        }
        names.sort();
        Ok(names)
    }

    pub(super) fn skill(&self, name: &str) -> Result<Option<CapturedSkill>> {
        validate_name(name)?;
        let Some(directory) = child_directory(&self.directory, name)? else {
            return Ok(None);
        };
        let Ok(Some(document)) = read_document(&directory, "SKILL.md") else {
            return Ok(None);
        };
        let Some(mut skill) = parse(name, self.source, &document)? else {
            return Ok(None);
        };
        let descriptor = &mut skill.descriptor;
        descriptor.revision = Fingerprint::of(&(self.scope, &descriptor.revision))?.to_hex();
        descriptor.uri = format!("{URI_PREFIX}{name}@{}", descriptor.revision);
        Ok(Some(skill))
    }
}

fn child_directory(parent: &File, name: &str) -> Result<Option<File>> {
    match fs::openat(parent, name, dir_flags(), Mode::empty()) {
        Ok(file) => Ok(Some(file.into())),
        Err(Errno::NOENT | Errno::NOTDIR | Errno::LOOP) => Ok(None),
        Err(_) => Err(unavailable()),
    }
}

fn dir_flags() -> OFlags {
    OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC
}

fn read_document(parent: &File, name: &str) -> Result<Option<String>> {
    let before = match fs::statat(parent, name, AtFlags::SYMLINK_NOFOLLOW) {
        Ok(stat) if single_regular(&stat) => stat,
        Err(Errno::NOENT) => return Ok(None),
        _ => return Err(unavailable()),
    };
    let mut file: File = match fs::openat(
        parent,
        name,
        OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
        Mode::empty(),
    ) {
        Ok(file) => file.into(),
        Err(Errno::NOENT) => return Ok(None),
        Err(_) => return Err(unavailable()),
    };
    let stat = fs::fstat(&file).map_err(|_| unavailable())?;
    if !single_regular(&stat) || stat.st_dev != before.st_dev || stat.st_ino != before.st_ino {
        return Err(unavailable());
    }
    if stat.st_size > MAX_SOURCE_BYTES as i64 {
        return Err(problem(ErrorKind::LimitExceeded, "skill_source_too_large"));
    }
    let mut bytes = Vec::new();
    (&mut file)
        .take(MAX_SOURCE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| unavailable())?;
    if bytes.len() > MAX_SOURCE_BYTES {
        return Err(problem(ErrorKind::LimitExceeded, "skill_source_too_large"));
    }
    if bytes.contains(&0) {
        return Err(unavailable());
    }
    let after = fs::fstat(&file).map_err(|_| unavailable())?;
    if !single_regular(&after)
        || after.st_size != stat.st_size
        || after.st_mtime != stat.st_mtime
        || after.st_mtime_nsec != stat.st_mtime_nsec
    {
        return Err(unavailable());
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| unavailable())
}

fn single_regular(stat: &Stat) -> bool {
    FileType::from_raw_mode(stat.st_mode) == FileType::RegularFile && stat.st_nlink == 1
}

fn unavailable() -> Error {
    problem(ErrorKind::Unavailable, "skill_source_unavailable")
}
