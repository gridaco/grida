//! GRIDA-SEC-004 / GRIDA-SEC-014 — private retained inputs and separate working copies.

use crate::workspace::ProtectedRoots;
use agent_kit_core::{ArtifactId, Error, ErrorKind, Result, SessionId};
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};

#[cfg(any(target_os = "macos", target_os = "linux"))]
const MAX_ASSETS: usize = 128;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ScratchLimits {
    pub max_assets: usize,
    pub max_asset_bytes: u64,
    pub max_source_bytes: u64,
    pub max_work_bytes: u64,
}

/// An exact retained version. File locations are host-owned and stay out of
/// this reference. The original bytes can be checked after a restart.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AssetRef {
    owner: SessionId,
    id: ArtifactId,
    version: u32,
    name: String,
    size: u64,
    digest: [u8; 32],
}

impl AssetRef {
    pub fn owner(&self) -> &SessionId {
        &self.owner
    }

    pub fn id(&self) -> &ArtifactId {
        &self.id
    }

    pub fn version(&self) -> u32 {
        self.version
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn size(&self) -> u64 {
        self.size
    }

    pub fn digest(&self) -> &[u8; 32] {
        &self.digest
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkingCopyReceipt {
    asset: AssetRef,
    id: ArtifactId,
}

impl WorkingCopyReceipt {
    pub fn asset(&self) -> &AssetRef {
        &self.asset
    }

    pub fn id(&self) -> &ArtifactId {
        &self.id
    }
}

/// A current host location for the exact working copy. Reopen through the
/// scope to validate it again. This is separate from a tool's execution grant.
pub struct WorkingCopy {
    receipt: WorkingCopyReceipt,
    path: PathBuf,
}

impl WorkingCopy {
    pub fn receipt(&self) -> &WorkingCopyReceipt {
        &self.receipt
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

/// Session-owned private storage. Opening acquires an exclusive owner lock.
/// Limits apply at managed-copy admission. Command disk quotas belong to the executor.
pub struct ScratchScope {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    inner: native::Scope,
}

/// Check for an exact owner entry without creating a scope or following it.
pub(crate) fn owner_scope_exists(parent: &Path, base: &str, owner: &SessionId) -> Result<bool> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    return native::owner_scope_exists(parent, base, owner);
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = (parent, base, owner);
        Err(unsupported())
    }
}

impl ScratchScope {
    /// The host supplies an existing, canonical private base disjoint from
    /// custody and authored workspaces. Only the working copy path is exposed.
    pub fn open(
        base: &Path,
        owner: SessionId,
        limits: ScratchLimits,
        protected: &ProtectedRoots,
    ) -> Result<Self> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        return Ok(Self {
            inner: native::Scope::open(base, owner, limits, protected)?,
        });
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let _ = (base, owner, limits, protected);
            Err(unsupported())
        }
    }

    pub fn retain(
        &mut self,
        id: ArtifactId,
        version: u32,
        name: &str,
        input: impl Read,
    ) -> Result<AssetRef> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        return self.inner.retain(id, version, name, input);
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let _ = (id, version, name, input);
            Err(unsupported())
        }
    }

    pub fn materialize(&mut self, asset: &AssetRef) -> Result<WorkingCopy> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        return self.inner.materialize(asset);
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let _ = asset;
            Err(unsupported())
        }
    }

    /// Read and verify the retained original without creating a working copy.
    pub fn read_retained(&self, asset: &AssetRef, maximum: usize) -> Result<Vec<u8>> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        return self.inner.read_retained(asset, maximum);
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let _ = (asset, maximum);
            Err(unsupported())
        }
    }

    pub(crate) fn replace_working(
        &mut self,
        receipt: &WorkingCopyReceipt,
        bytes: &[u8],
        before_publish: impl FnOnce() -> Result<()>,
    ) -> Result<()> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        return self.inner.replace_working(receipt, bytes, before_publish);
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let _ = (receipt, bytes, before_publish);
            Err(unsupported())
        }
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
pub(crate) fn check_private_directory(path: &Path) -> Result<()> {
    crate::workspace::validate_absolute(path)?;
    native::check_base(path)
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn unsupported() -> Error {
    Error::new(ErrorKind::Unsupported, "scratch_platform_unsupported")
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod native {
    use super::*;
    use crate::workspace::validate_absolute;
    use agent_kit_core::Fingerprint;
    use rustix::fs::{self as unix, AtFlags, Dir, Mode, OFlags};
    use rustix::io::Errno;
    use sha2::{Digest, Sha256};
    use std::ffi::OsStr;
    use std::fs::{self, File, Metadata};
    use std::io::{self, Seek, SeekFrom, Write};
    use std::os::unix::fs::MetadataExt;
    use uuid::Uuid;

    const HEADER_BYTES: usize = 2048;
    const MAGIC: &[u8; 8] = b"GRSRC001";

    pub(super) struct Scope {
        owner: SessionId,
        limits: ScratchLimits,
        protected: ProtectedRoots,
        base: Directory,
        scope: Directory,
        sources: Directory,
        work: Directory,
        lock: File,
    }

    struct Directory {
        path: PathBuf,
        file: File,
    }

    pub(super) fn owner_scope_exists(parent: &Path, base: &str, owner: &SessionId) -> Result<bool> {
        validate_absolute(parent)?;
        let parent = Directory::open(parent)?;
        let base = match unix::openat(&parent.file, base, directory_flags(), Mode::empty()) {
            Ok(file) => Directory {
                path: parent.path.join(base),
                file: file.into(),
            },
            Err(Errno::NOENT) => return Ok(false),
            Err(error) => return Err(io_failure(error)),
        };
        base.validate()?;
        match unix::statat(&base.file, key(owner)?, AtFlags::SYMLINK_NOFOLLOW) {
            Ok(_) => Ok(true),
            Err(Errno::NOENT) => Ok(false),
            Err(error) => Err(io_failure(error)),
        }
    }

    #[derive(Default)]
    struct Occupancy {
        files: usize,
        bytes: u64,
    }

    impl Scope {
        pub(super) fn open(
            base: &Path,
            owner: SessionId,
            limits: ScratchLimits,
            protected: &ProtectedRoots,
        ) -> Result<Self> {
            if limits.max_assets == 0
                || limits.max_assets > MAX_ASSETS
                || limits.max_asset_bytes == 0
                || limits.max_asset_bytes > limits.max_source_bytes
                || limits.max_work_bytes == 0
            {
                return Err(Error::new(
                    ErrorKind::InvalidInput,
                    "scratch_limits_invalid",
                ));
            }
            validate_absolute(base)?;
            protected.check(base)?;
            check_base(base)?;
            let base = Directory::open(base)?;
            let scope = base.child(&key(&owner)?)?;
            let lock = scope.lock()?;
            let sources = scope.child("sources")?;
            let work = scope.child("work")?;
            let scope = Self {
                owner,
                limits,
                protected: protected.clone(),
                base,
                scope,
                sources,
                work,
                lock,
            };
            scope.validate()?;
            scope.sources.remove_staging()?;
            scope.work.remove_staging()?;
            scope.occupancy()?;
            Ok(scope)
        }

        pub(super) fn retain(
            &mut self,
            id: ArtifactId,
            version: u32,
            name: &str,
            mut input: impl Read,
        ) -> Result<AssetRef> {
            validate_asset(version, name)?;
            self.validate()?;
            let (sources, _) = self.occupancy()?;
            let key = self.asset_key(&id, version)?;
            let source_name = format!("{key}.asset");
            if let Some(mut source) = self.sources.read(&source_name)? {
                let asset = self.read_asset(&mut source, &key)?;
                if asset.name != name {
                    return Err(conflict());
                }
                verify(&mut source, &asset, &mut io::sink())?;
                let (size, digest) =
                    transfer(&mut input, &mut io::sink(), asset.size).map_err(|error| {
                        if error.kind == ErrorKind::LimitExceeded {
                            conflict()
                        } else {
                            error
                        }
                    })?;
                if size != asset.size || digest != asset.digest {
                    return Err(conflict());
                }
                self.sources.sync()?;
                self.validate()?;
                return Ok(asset);
            }
            if self.sources.read(&format!("{key}.working"))?.is_some() {
                return Err(source_unavailable());
            }
            if sources.files >= self.limits.max_assets {
                return Err(limit());
            }
            let allowed =
                (self.limits.max_source_bytes - sources.bytes).min(self.limits.max_asset_bytes);
            let asset = self.sources.publish(&source_name, |file| {
                file.write_all(&[0; HEADER_BYTES]).map_err(io_failure)?;
                let (size, digest) = transfer(&mut input, file, allowed)?;
                let asset = AssetRef {
                    owner: self.owner.clone(),
                    id,
                    version,
                    name: name.to_owned(),
                    size,
                    digest,
                };
                write_header(file, &asset)?;
                Ok(asset)
            })?;
            self.validate().map_err(|_| uncertain())?;
            Ok(asset)
        }

        pub(super) fn read_retained(&self, asset: &AssetRef, maximum: usize) -> Result<Vec<u8>> {
            let size = usize::try_from(asset.size).map_err(|_| limit())?;
            if size > maximum || asset.size > self.limits.max_asset_bytes {
                return Err(limit());
            }
            let (_, mut source) = self.open_asset(asset)?;
            let mut bytes = Vec::with_capacity(size);
            verify(&mut source, asset, &mut bytes)?;
            self.validate()?;
            Ok(bytes)
        }

        fn open_asset(&self, asset: &AssetRef) -> Result<(String, File)> {
            validate_asset(asset.version, &asset.name)?;
            if asset.owner != self.owner {
                return Err(source_unavailable());
            }
            self.validate()?;
            let key = self.asset_key(&asset.id, asset.version)?;
            let mut source = self
                .sources
                .read(&format!("{key}.asset"))?
                .ok_or_else(source_unavailable)?;
            if self.read_asset(&mut source, &key)? != *asset {
                return Err(conflict());
            }
            Ok((key, source))
        }

        pub(super) fn materialize(&mut self, asset: &AssetRef) -> Result<WorkingCopy> {
            let (key, mut source) = self.open_asset(asset)?;
            let (_, work) = self.occupancy()?;
            let work_name = working_name(&key, &asset.name);
            let marker_name = format!("{key}.working");
            let marker = self.sources.read(&marker_name)?;
            let existing = self.work.read(&work_name)?;
            match (marker, existing) {
                (Some(marker), Some(_)) => {
                    if marker.metadata().map_err(io_failure)?.len() != 0 {
                        return Err(invalid_storage());
                    }
                    verify(&mut source, asset, &mut io::sink())?;
                    self.work.sync()?;
                    self.sources.sync()?;
                }
                (Some(_), None) => return Err(working_unavailable()),
                (None, Some(mut existing)) => {
                    // A crash can leave the copy before its first receipt.
                    // Only an exact original is safe to adopt.
                    verify(&mut source, asset, &mut io::sink())?;
                    verify(&mut existing, asset, &mut io::sink())?;
                    existing.sync_all().map_err(io_failure)?;
                    self.work.sync()?;
                    self.sources.publish(&marker_name, |_| Ok(()))?;
                }
                (None, None) => {
                    if work.files >= self.limits.max_assets
                        || asset.size > self.limits.max_work_bytes - work.bytes
                    {
                        return Err(limit());
                    }
                    self.work
                        .publish(&work_name, |file| verify(&mut source, asset, file))?;
                    self.sources.publish(&marker_name, |_| Ok(()))?;
                }
            }
            self.validate()?;
            self.work
                .read(&work_name)?
                .ok_or_else(working_unavailable)?;
            Ok(WorkingCopy {
                receipt: WorkingCopyReceipt {
                    asset: asset.clone(),
                    id: ArtifactId::new(format!("working/{key}"))?,
                },
                path: self.work.path.join(work_name),
            })
        }

        pub(super) fn replace_working(
            &mut self,
            receipt: &WorkingCopyReceipt,
            bytes: &[u8],
            before_publish: impl FnOnce() -> Result<()>,
        ) -> Result<()> {
            let (key, mut source) = self.open_asset(&receipt.asset)?;
            if receipt.id.as_str() != format!("working/{key}") {
                return Err(working_unavailable());
            }
            let marker = self
                .sources
                .read(&format!("{key}.working"))?
                .ok_or_else(working_unavailable)?;
            if marker.metadata().map_err(io_failure)?.len() != 0 {
                return Err(invalid_storage());
            }
            verify(&mut source, &receipt.asset, &mut io::sink())?;
            let name = working_name(&key, &receipt.asset.name);
            let current = self.work.read(&name)?.ok_or_else(working_unavailable)?;
            let (_, usage) = self.occupancy()?;
            let current_size = current.metadata().map_err(io_failure)?.len();
            let other_bytes = usage
                .bytes
                .checked_sub(current_size)
                .ok_or_else(invalid_storage)?;
            if bytes.len() as u64 > self.limits.max_work_bytes - other_bytes {
                return Err(limit());
            }
            self.work.stage(
                |file| file.write_all(bytes).map_err(io_failure),
                |temp| {
                    self.validate()?;
                    self.work.check_file(&name, &current)?;
                    before_publish()?;
                    unix::renameat(&self.work.file, temp, &self.work.file, name.as_str())
                        .map_err(io_failure)
                },
            )
        }

        fn validate(&self) -> Result<()> {
            self.protected.check(&self.base.path)?;
            check_base(&self.base.path)?;
            self.base.validate()?;
            self.scope.validate()?;
            self.sources.validate()?;
            self.work.validate()?;
            let current = self.scope.read("owner.lock")?.ok_or_else(invalid_storage)?;
            if !same(
                &current.metadata().map_err(io_failure)?,
                &self.lock.metadata().map_err(io_failure)?,
            ) {
                return Err(invalid_storage());
            }
            Ok(())
        }

        fn occupancy(&self) -> Result<(Occupancy, Occupancy)> {
            let source = self.sources.occupancy(self.limits, true)?;
            let work = self.work.occupancy(self.limits, false)?;
            Ok((source, work))
        }

        fn asset_key(&self, id: &ArtifactId, version: u32) -> Result<String> {
            key(&(&self.owner, id, version))
        }

        fn read_asset(&self, file: &mut File, expected_key: &str) -> Result<AssetRef> {
            let mut header = [0; HEADER_BYTES];
            file.read_exact(&mut header)
                .map_err(|_| invalid_storage())?;
            if &header[..8] != MAGIC {
                return Err(invalid_storage());
            }
            let size = u32::from_be_bytes(header[8..12].try_into().map_err(|_| invalid_storage())?)
                as usize;
            let data = header[12..].get(..size).ok_or_else(invalid_storage)?;
            let asset: AssetRef = serde_json::from_slice(data).map_err(|_| invalid_storage())?;
            if asset.owner != self.owner
                || validate_asset(asset.version, &asset.name).is_err()
                || self.asset_key(&asset.id, asset.version)? != expected_key
                || asset.size > self.limits.max_asset_bytes
                || Some(file.metadata().map_err(io_failure)?.len())
                    != (HEADER_BYTES as u64).checked_add(asset.size)
            {
                return Err(invalid_storage());
            }
            Ok(asset)
        }
    }

    impl Directory {
        fn open(path: &Path) -> Result<Self> {
            let file = unix::open(path, directory_flags(), Mode::empty())
                .map_err(io_failure)?
                .into();
            let directory = Self {
                path: path.to_owned(),
                file,
            };
            directory.validate()?;
            Ok(directory)
        }

        fn child(&self, name: &str) -> Result<Self> {
            match unix::mkdirat(&self.file, name, Mode::from_bits_truncate(0o700)) {
                Ok(()) => unix::fsync(&self.file).map_err(io_failure)?,
                Err(Errno::EXIST) => {}
                Err(error) => return Err(io_failure(error)),
            }
            let file = unix::openat(&self.file, name, directory_flags(), Mode::empty())
                .map_err(io_failure)?
                .into();
            let directory = Self {
                path: self.path.join(name),
                file,
            };
            directory.validate()?;
            Ok(directory)
        }

        fn validate(&self) -> Result<()> {
            let observed = fs::symlink_metadata(&self.path).map_err(io_failure)?;
            let held = self.file.metadata().map_err(io_failure)?;
            if !same(&held, &observed) {
                return Err(invalid_storage());
            }
            private_metadata(&observed, true)?;
            check_acl(&self.path)
        }

        fn lock(&self) -> Result<File> {
            let flags = OFlags::RDWR | file_flags();
            let file: File = match unix::openat(
                &self.file,
                "owner.lock",
                flags | OFlags::CREATE | OFlags::EXCL,
                Mode::from_bits_truncate(0o600),
            ) {
                Ok(fd) => {
                    unix::fsync(&self.file).map_err(io_failure)?;
                    fd.into()
                }
                Err(Errno::EXIST) => unix::openat(&self.file, "owner.lock", flags, Mode::empty())
                    .map_err(io_failure)?
                    .into(),
                Err(error) => return Err(io_failure(error)),
            };
            self.check_file("owner.lock", &file)?;
            file.try_lock().map_err(|error| match error {
                fs::TryLockError::WouldBlock => {
                    Error::new(ErrorKind::Conflict, "scratch_owner_in_use")
                }
                fs::TryLockError::Error(error) => io_failure(error),
            })?;
            Ok(file)
        }

        fn read(&self, name: &str) -> Result<Option<File>> {
            match unix::openat(
                &self.file,
                name,
                OFlags::RDONLY | file_flags(),
                Mode::empty(),
            ) {
                Ok(fd) => {
                    let file = fd.into();
                    self.check_file(name, &file)?;
                    Ok(Some(file))
                }
                Err(Errno::NOENT) => Ok(None),
                Err(error) => Err(io_failure(error)),
            }
        }

        fn check_file(&self, name: &str, file: &File) -> Result<()> {
            let metadata = file.metadata().map_err(io_failure)?;
            private_metadata(&metadata, false)?;
            let path = self.path.join(name);
            let observed = fs::symlink_metadata(&path).map_err(io_failure)?;
            if !same(&metadata, &observed) {
                return Err(invalid_storage());
            }
            check_acl(&path)
        }

        fn publish<T>(&self, name: &str, write: impl FnOnce(&mut File) -> Result<T>) -> Result<T> {
            self.stage(write, |temp| {
                unix::linkat(&self.file, temp, &self.file, name, AtFlags::empty()).map_err(
                    |error| {
                        if error == Errno::EXIST {
                            conflict()
                        } else {
                            io_failure(error)
                        }
                    },
                )
            })
        }

        fn stage<T>(
            &self,
            write: impl FnOnce(&mut File) -> Result<T>,
            publish: impl FnOnce(&str) -> Result<()>,
        ) -> Result<T> {
            let temp = format!(".stage-{}", Uuid::new_v4());
            let mut file: File = unix::openat(
                &self.file,
                temp.as_str(),
                OFlags::RDWR | OFlags::CREATE | OFlags::EXCL | file_flags(),
                Mode::from_bits_truncate(0o600),
            )
            .map_err(io_failure)?
            .into();
            let prepared = (|| {
                self.check_file(&temp, &file)?;
                let value = write(&mut file)?;
                file.sync_all().map_err(io_failure)?;
                Ok(value)
            })();
            let published = prepared.and_then(|value| {
                publish(&temp)?;
                Ok(value)
            });
            let cleanup = unix::unlinkat(&self.file, temp.as_str(), AtFlags::empty());
            match published {
                Ok(value) => {
                    if let Err(error) = cleanup
                        && error != Errno::NOENT
                    {
                        return Err(uncertain());
                    }
                    unix::fsync(&self.file).map_err(|_| uncertain())?;
                    Ok(value)
                }
                Err(error) => {
                    cleanup.map_err(io_failure)?;
                    Err(error)
                }
            }
        }

        fn remove_staging(&self) -> Result<()> {
            let mut removed = false;
            self.entries(|name| {
                if let Some(suffix) = name.strip_prefix(".stage-") {
                    Uuid::parse_str(suffix).map_err(|_| invalid_storage())?;
                    let stat = unix::statat(&self.file, name, AtFlags::SYMLINK_NOFOLLOW)
                        .map_err(io_failure)?;
                    if stat.st_uid != uid()
                        || unix::FileType::from_raw_mode(stat.st_mode)
                            != unix::FileType::RegularFile
                        || stat.st_mode & 0o7777 != 0o600
                    {
                        return Err(invalid_storage());
                    }
                    unix::unlinkat(&self.file, name, AtFlags::empty()).map_err(io_failure)?;
                    removed = true;
                }
                Ok(())
            })?;
            if removed {
                unix::fsync(&self.file).map_err(io_failure)?;
            }
            Ok(())
        }

        fn sync(&self) -> Result<()> {
            unix::fsync(&self.file).map_err(|_| uncertain())
        }

        fn occupancy(&self, limits: ScratchLimits, sources: bool) -> Result<Occupancy> {
            let mut usage = Occupancy::default();
            let mut markers = 0;
            self.entries(|name| {
                let stat = unix::statat(&self.file, name, AtFlags::SYMLINK_NOFOLLOW)
                    .map_err(io_failure)?;
                if stat.st_uid != uid()
                    || unix::FileType::from_raw_mode(stat.st_mode) != unix::FileType::RegularFile
                    || stat.st_mode & 0o7777 != 0o600
                    || stat.st_nlink != 1
                {
                    return Err(invalid_storage());
                }
                let len = u64::try_from(stat.st_size).map_err(|_| invalid_storage())?;
                let (key, suffix) = name.split_once('.').unwrap_or((name, ""));
                if !is_key(key) {
                    return Err(invalid_storage());
                }
                let size = if sources {
                    match suffix {
                        "asset" => len
                            .checked_sub(HEADER_BYTES as u64)
                            .filter(|size| *size <= limits.max_asset_bytes)
                            .ok_or_else(invalid_storage)?,
                        "working" if len == 0 => {
                            markers += 1;
                            if markers > limits.max_assets {
                                return Err(limit());
                            }
                            return Ok(());
                        }
                        _ => return Err(invalid_storage()),
                    }
                } else {
                    if !suffix.is_empty() && !safe_extension(suffix) {
                        return Err(invalid_storage());
                    }
                    len
                };
                usage.files += 1;
                usage.bytes = usage.bytes.checked_add(size).ok_or_else(limit)?;
                let max_bytes = if sources {
                    limits.max_source_bytes
                } else {
                    limits.max_work_bytes
                };
                if usage.files > limits.max_assets || usage.bytes > max_bytes {
                    return Err(limit());
                }
                Ok(())
            })?;
            Ok(usage)
        }

        fn entries(&self, mut handle: impl FnMut(&str) -> Result<()>) -> Result<()> {
            let entries = Dir::read_from(&self.file).map_err(io_failure)?;
            for (index, entry) in entries.enumerate() {
                if index >= MAX_ASSETS * 3 + 2 {
                    return Err(limit());
                }
                let entry = entry.map_err(io_failure)?;
                let name = entry.file_name().to_str().map_err(|_| invalid_storage())?;
                if name != "." && name != ".." {
                    handle(name)?;
                }
            }
            Ok(())
        }
    }

    fn write_header(file: &mut File, asset: &AssetRef) -> Result<()> {
        let data = serde_json::to_vec(asset).map_err(|_| invalid_storage())?;
        if data.len() > HEADER_BYTES - 12 {
            return Err(invalid_storage());
        }
        file.seek(SeekFrom::Start(0)).map_err(io_failure)?;
        file.write_all(MAGIC).map_err(io_failure)?;
        file.write_all(&(data.len() as u32).to_be_bytes())
            .map_err(io_failure)?;
        file.write_all(&data).map_err(io_failure)
    }

    fn verify(read: &mut File, asset: &AssetRef, output: &mut impl Write) -> Result<()> {
        let (size, digest) = transfer(read, output, asset.size).map_err(|error| {
            if error.kind == ErrorKind::LimitExceeded {
                invalid_storage()
            } else {
                error
            }
        })?;
        if size != asset.size || digest != asset.digest {
            return Err(invalid_storage());
        }
        Ok(())
    }

    fn transfer(
        input: &mut impl Read,
        output: &mut impl Write,
        max: u64,
    ) -> Result<(u64, [u8; 32])> {
        let mut hash = Sha256::new();
        let mut total = 0;
        let mut buffer = [0; 16 * 1024];
        loop {
            let want = (max - total).saturating_add(1).min(buffer.len() as u64) as usize;
            let size = match input.read(&mut buffer[..want]) {
                Ok(size) => size,
                Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                Err(error) => return Err(io_failure(error)),
            };
            if size == 0 {
                return Ok((total, hash.finalize().into()));
            }
            if size > want || size as u64 > max - total {
                return Err(limit());
            }
            output.write_all(&buffer[..size]).map_err(io_failure)?;
            hash.update(&buffer[..size]);
            total += size as u64;
        }
    }

    fn key(value: &impl Serialize) -> Result<String> {
        use std::fmt::Write as _;
        let digest = Fingerprint::of(value)?;
        let mut key = String::with_capacity(64);
        for byte in digest.bytes() {
            write!(key, "{byte:02x}").map_err(|_| invalid_storage())?;
        }
        Ok(key)
    }

    fn is_key(key: &str) -> bool {
        key.len() == 64
            && key
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    }

    fn working_name(key: &str, name: &str) -> String {
        match Path::new(name)
            .extension()
            .and_then(OsStr::to_str)
            .filter(|ext| safe_extension(ext))
        {
            Some(ext) => format!("{key}.{ext}"),
            None => key.to_owned(),
        }
    }

    fn safe_extension(ext: &str) -> bool {
        !ext.is_empty() && ext.len() <= 16 && ext.bytes().all(|byte| byte.is_ascii_alphanumeric())
    }

    fn validate_asset(version: u32, name: &str) -> Result<()> {
        if version == 0
            || name.trim().is_empty()
            || name.len() > 255
            || name == "."
            || name == ".."
            || name.contains(['/', '\\'])
            || name.chars().any(char::is_control)
        {
            return Err(Error::new(ErrorKind::InvalidInput, "scratch_asset_invalid"));
        }
        Ok(())
    }

    pub(super) fn check_base(base: &Path) -> Result<()> {
        if base.parent().is_none() || fs::canonicalize(base).map_err(io_failure)? != base {
            return Err(invalid_storage());
        }
        for path in base.ancestors() {
            let metadata = fs::symlink_metadata(path).map_err(io_failure)?;
            if path == base {
                private_metadata(&metadata, true)?;
            } else if !metadata.is_dir()
                || (metadata.uid() != uid() && metadata.uid() != 0)
                || (metadata.mode() & 0o022 != 0
                    && !(metadata.uid() == 0 && metadata.mode() & 0o1000 != 0))
            {
                return Err(invalid_storage());
            }
            check_acl(path)?;
        }
        Ok(())
    }

    fn directory_flags() -> OFlags {
        OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC
    }

    fn file_flags() -> OFlags {
        OFlags::NOFOLLOW | OFlags::CLOEXEC | OFlags::NONBLOCK
    }

    fn same(left: &Metadata, right: &Metadata) -> bool {
        left.dev() == right.dev() && left.ino() == right.ino()
    }

    fn uid() -> u32 {
        rustix::process::geteuid().as_raw()
    }

    fn private_metadata(metadata: &Metadata, directory: bool) -> Result<()> {
        if metadata.uid() != uid()
            || metadata.mode() & 0o7777 != if directory { 0o700 } else { 0o600 }
            || if directory {
                !metadata.is_dir()
            } else {
                !metadata.is_file() || metadata.nlink() != 1
            }
        {
            return Err(invalid_storage());
        }
        Ok(())
    }

    #[cfg(target_os = "linux")]
    fn check_acl(_: &Path) -> Result<()> {
        // POSIX ACL user/group permissions are bounded by the group mask,
        // which is included in the mode checks on private directories/files.
        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn check_acl(path: &Path) -> Result<()> {
        use std::process::{Command, Stdio};
        use std::time::{Duration, Instant};

        let mut child = Command::new("/bin/ls")
            .args(["-lde"])
            .arg(path)
            .env_clear()
            .env("LC_ALL", "C")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(io_failure)?;
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(5))
                }
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(invalid_storage());
                }
            }
        }
        let output = child.wait_with_output().map_err(io_failure)?;
        let listing = std::str::from_utf8(&output.stdout).map_err(io_failure)?;
        if !output.status.success()
            || listing.len() > 65_536
            || listing.lines().any(|line| {
                line.trim_start()
                    .split_once(':')
                    .is_some_and(|(index, acl)| {
                        !index.is_empty()
                            && index.bytes().all(|c| c.is_ascii_digit())
                            && acl.split_whitespace().any(|word| word == "allow")
                    })
            })
        {
            return Err(invalid_storage());
        }
        Ok(())
    }

    fn source_unavailable() -> Error {
        Error::new(ErrorKind::Unavailable, "scratch_source_unavailable")
    }

    fn working_unavailable() -> Error {
        Error::new(ErrorKind::Unavailable, "scratch_working_copy_unavailable")
    }

    fn invalid_storage() -> Error {
        Error::new(ErrorKind::InvalidState, "scratch_storage_invalid")
    }

    fn conflict() -> Error {
        Error::new(ErrorKind::Conflict, "scratch_identity_conflict")
    }

    fn limit() -> Error {
        Error::new(ErrorKind::LimitExceeded, "scratch_limit")
    }

    fn uncertain() -> Error {
        Error::new(ErrorKind::Uncertain, "scratch_publication_uncertain")
    }

    fn io_failure(_: impl std::fmt::Display) -> Error {
        Error::new(ErrorKind::Unavailable, "scratch_storage_unavailable")
    }
}
