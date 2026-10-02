// GRIDA-SEC-013 — explicit bounded file grants and exclusive artifact publication.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
#[cfg(unix)]
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt};
use std::{
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

pub const TEXT_LIMIT: usize = 16 * 1024 * 1024;
pub const IMAGE_LIMIT: usize = 8 * 1024 * 1024;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    pub data: Vec<u8>,
    pub media_type: String,
}
#[derive(Debug, Clone, Serialize)]
pub struct Saved {
    pub path: PathBuf,
    pub media_type: String,
    pub bytes: usize,
    pub sha256: String,
}
#[derive(Debug)]
pub struct Error {
    pub code: &'static str,
    pub directory: Option<PathBuf>,
    pub saved: Vec<Saved>,
}
impl Error {
    fn new(code: &'static str) -> Self {
        Self {
            code,
            directory: None,
            saved: vec![],
        }
    }
}

pub async fn read_input(source: &str, token: &CancellationToken) -> Result<Value, Error> {
    if token.is_cancelled() {
        return Err(Error::new("cancelled"));
    }
    let (path, stdin) = if source == "-" {
        (source, true)
    } else {
        (
            source
                .strip_prefix('@')
                .filter(|s| !s.is_empty())
                .ok_or_else(|| Error::new("invalid_input"))?,
            false,
        )
    };
    let bytes = read_bytes(path, stdin, TEXT_LIMIT, token).await?;
    let text = std::str::from_utf8(&bytes)
        .map_err(|_| Error::new("invalid_input"))?
        .strip_prefix('\u{feff}')
        .unwrap_or(std::str::from_utf8(&bytes).unwrap());
    let value: Value = serde_json::from_str(text).map_err(|_| Error::new("invalid_input"))?;
    if !value.is_object() {
        return Err(Error::new("invalid_input"));
    }
    Ok(value)
}
pub async fn read_text(source: &str, token: &CancellationToken) -> Result<String, Error> {
    check_source(source)?;
    String::from_utf8(read_bytes(source, source == "-", TEXT_LIMIT, token).await?)
        .map_err(|_| Error::new("invalid_input"))
}
pub async fn read_image(
    source: &str,
    maximum: usize,
    token: &CancellationToken,
) -> Result<Artifact, Error> {
    check_source(source)?;
    if source == "-" || maximum == 0 {
        return Err(Error::new("invalid_input"));
    }
    let data = read_bytes(source, false, maximum.min(IMAGE_LIMIT), token).await?;
    let media_type = image_type(&data)
        .ok_or_else(|| Error::new("invalid_input"))?
        .to_owned();
    Ok(Artifact { data, media_type })
}
pub async fn read_mesh(
    source: &str,
    maximum: usize,
    token: &CancellationToken,
) -> Result<Artifact, Error> {
    check_source(source)?;
    if source == "-" || maximum == 0 || maximum > 64 * 1024 * 1024 {
        return Err(Error::new("invalid_input"));
    }
    let data = read_bytes(source, false, maximum, token).await?;
    if data.len() < 20
        || &data[..4] != b"glTF"
        || le32(&data, 4) != 2
        || le32(&data, 8) as usize != data.len()
    {
        return Err(Error::new("invalid_input"));
    }
    Ok(Artifact {
        data,
        media_type: "model/gltf-binary".into(),
    })
}
fn check_source(source: &str) -> Result<(), Error> {
    let lower = source.to_ascii_lowercase();
    let scheme = lower.split_once("://").is_some_and(|(s, _)| {
        !s.is_empty()
            && s.as_bytes()[0].is_ascii_alphabetic()
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"+.-".contains(&b))
    });
    if source.is_empty() || scheme || lower.starts_with("data:") || lower.starts_with("file:") {
        Err(Error::new("invalid_input"))
    } else {
        Ok(())
    }
}
/// Detached bounded reader: even open/stat on a stalled mount is covered by the
/// caller deadline. A late completion drops its owned descriptor and bytes.
/// A blocked stdin worker never holds the async runtime alive during shutdown.
pub async fn read_bytes(
    source: &str,
    stdin: bool,
    limit: usize,
    token: &CancellationToken,
) -> Result<Vec<u8>, Error> {
    if token.is_cancelled() {
        return Err(Error::new("cancelled"));
    }
    let path = PathBuf::from(source);
    let stop = token.child_token();
    let worker_stop = stop.clone();
    let (send, receive) = tokio::sync::oneshot::channel();
    std::thread::Builder::new()
        .name("grida-input".into())
        .spawn(move || {
            let result = (|| {
                let mut reader: Box<dyn Read> = if stdin {
                    Box::new(io::stdin())
                } else {
                    let mut options = OpenOptions::new();
                    options.read(true);
                    #[cfg(unix)]
                    options.custom_flags(rustix::fs::OFlags::NONBLOCK.bits() as i32);
                    let file = options
                        .open(path)
                        .map_err(|_| Error::new("input_unavailable"))?;
                    let info = file
                        .metadata()
                        .map_err(|_| Error::new("input_unavailable"))?;
                    if !info.is_file() || info.len() > limit as u64 {
                        return Err(Error::new("input_unavailable"));
                    }
                    Box::new(file)
                };
                let mut bytes = Vec::new();
                let mut chunk = [0; 64 * 1024];
                loop {
                    if worker_stop.is_cancelled() {
                        return Err(Error::new("cancelled"));
                    }
                    let n = reader
                        .read(&mut chunk)
                        .map_err(|_| Error::new("input_unavailable"))?;
                    if n == 0 {
                        return Ok(bytes);
                    }
                    if bytes.len() + n > limit {
                        return Err(Error::new("invalid_input"));
                    }
                    bytes.extend_from_slice(&chunk[..n]);
                }
            })();
            let _ = send.send(result);
        })
        .map_err(|_| Error::new("input_unavailable"))?;
    let result = tokio::select! {
        biased;
        _=token.cancelled()=>Err(Error::new("cancelled")),
        _=tokio::time::sleep(Duration::from_secs(30))=>Err(Error::new("input_unavailable")),
        result=receive=>result.unwrap_or_else(|_|Err(Error::new("input_unavailable"))),
    };
    stop.cancel();
    result
}
fn le32(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes(b[i..i + 4].try_into().unwrap())
}
fn be32(b: &[u8], i: usize) -> u32 {
    u32::from_be_bytes(b[i..i + 4].try_into().unwrap())
}
fn be16(b: &[u8], i: usize) -> u16 {
    u16::from_be_bytes(b[i..i + 2].try_into().unwrap())
}
/// Container/header admission, without pixel decoding or extension inference.
pub fn image_type(b: &[u8]) -> Option<&'static str> {
    if b.len() >= 33
        && &b[..8] == b"\x89PNG\r\n\x1a\n"
        && be32(b, 8) == 13
        && &b[12..16] == b"IHDR"
        && (1..=0x7fffffff).contains(&be32(b, 16))
        && (1..=0x7fffffff).contains(&be32(b, 20))
        && b[26] == 0
        && b[27] == 0
        && b[28] <= 1
    {
        let valid = match b[25] {
            0 => [1, 2, 4, 8, 16].contains(&b[24]),
            2 | 4 | 6 => [8, 16].contains(&b[24]),
            3 => [1, 2, 4, 8].contains(&b[24]),
            _ => false,
        };
        if valid {
            return Some("image/png");
        }
    }
    if b.len() >= 4 && b[..2] == [0xff, 0xd8] {
        let mut offset = 2;
        let mut frame = false;
        while offset < b.len() {
            if b[offset] != 0xff {
                return None;
            }
            offset += 1;
            while b.get(offset) == Some(&0xff) {
                offset += 1;
            }
            let marker = *b.get(offset)?;
            offset += 1;
            if offset + 2 > b.len() {
                return None;
            }
            let length = be16(b, offset) as usize;
            if length < 2 || offset + length > b.len() {
                return None;
            }
            if (0xc0..=0xcf).contains(&marker) && ![0xc4, 0xc8, 0xcc].contains(&marker) {
                if length < 8
                    || !(2..=16).contains(&b[offset + 2])
                    || be16(b, offset + 3) == 0
                    || be16(b, offset + 5) == 0
                    || b[offset + 7] == 0
                    || length != 8 + 3 * b[offset + 7] as usize
                {
                    return None;
                }
                frame = true;
            }
            if marker == 0xda {
                return (frame
                    && length >= 6
                    && b[offset + 2] > 0
                    && length == 6 + 2 * b[offset + 2] as usize
                    && offset + length < b.len() - 2
                    && b[b.len() - 2..] == [0xff, 0xd9])
                .then_some("image/jpeg");
            }
            offset += length;
        }
    }
    if b.len() >= 20
        && &b[..4] == b"RIFF"
        && le32(b, 4) as usize == b.len() - 8
        && &b[8..12] == b"WEBP"
    {
        let mut offset = 12;
        let mut image = false;
        while offset + 8 <= b.len() {
            let kind = &b[offset..offset + 4];
            let length = le32(b, offset + 4) as usize;
            let start = offset + 8;
            if length > b.len() - start {
                return None;
            }
            match kind {
                b"VP8 " => {
                    if length < 10
                        || b[start] & 1 != 0
                        || b[start + 3..start + 6] != [0x9d, 1, 0x2a]
                        || u16::from_le_bytes(b[start + 6..start + 8].try_into().unwrap()) & 0x3fff
                            == 0
                        || u16::from_le_bytes(b[start + 8..start + 10].try_into().unwrap()) & 0x3fff
                            == 0
                    {
                        return None;
                    }
                    image = true;
                }
                b"VP8L" => {
                    if length < 5 || b[start] != 0x2f || b[start + 4] >> 5 != 0 {
                        return None;
                    }
                    image = true;
                }
                b"VP8X"
                    if length != 10
                        || b[start] & 0xc1 != 0
                        || b[start + 1..start + 4] != [0, 0, 0] =>
                {
                    return None;
                }
                _ => {}
            }
            offset = start + length + (length & 1);
        }
        if image && offset == b.len() {
            return Some("image/webp");
        }
    }
    None
}

pub struct Directory {
    pub path: PathBuf,
    identity: Identity,
    used: bool,
}
#[cfg(unix)]
type Identity = (u64, u64);
#[cfg(not(unix))]
type Identity = std::time::SystemTime;
fn identity(info: &fs::Metadata) -> io::Result<Identity> {
    #[cfg(unix)]
    {
        Ok((info.dev(), info.ino()))
    }
    #[cfg(not(unix))]
    {
        info.created()
    }
}
impl Directory {
    pub fn prepare(target: &Path) -> Result<Self, Error> {
        let result = (|| -> io::Result<Self> {
            let selected = std::path::absolute(target)?;
            let parent = selected
                .parent()
                .ok_or_else(|| io::Error::other("parent"))?
                .canonicalize()?;
            let path = parent.join(
                selected
                    .file_name()
                    .ok_or_else(|| io::Error::other("name"))?,
            );
            #[cfg(unix)]
            fs::DirBuilder::new().mode(0o700).create(&path)?;
            #[cfg(not(unix))]
            fs::create_dir(&path)?;
            let identity = identity(&fs::symlink_metadata(&path)?)?;
            let dir = Self {
                path,
                identity,
                used: false,
            };
            let probe = format!(".grida-probe-{}", Uuid::new_v4());
            if dir
                .publish(&probe, &[0])
                .and_then(|_| dir.check())
                .and_then(|_| fs::remove_file(dir.path.join(&probe)))
                .is_err()
            {
                if dir.check().is_ok() {
                    let _ = fs::remove_file(dir.path.join(&probe));
                }
                dir.abandon();
                return Err(io::Error::other("probe"));
            }
            Ok(dir)
        })();
        result.map_err(|_| Error::new("output_unavailable"))
    }
    fn check(&self) -> io::Result<()> {
        let info = fs::symlink_metadata(&self.path)?;
        if !info.is_dir() || info.file_type().is_symlink() || identity(&info)? != self.identity {
            return Err(io::Error::other("changed output"));
        }
        Ok(())
    }
    fn publish(&self, name: &str, bytes: &[u8]) -> io::Result<()> {
        self.check()?;
        let temporary = self.path.join(format!(".grida-{}.tmp", Uuid::new_v4()));
        let result = (|| {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            options
                .mode(0o600)
                .custom_flags(rustix::fs::OFlags::NOFOLLOW.bits() as i32);
            let mut file = options.open(&temporary)?;
            file.write_all(bytes)?;
            file.sync_all()?;
            drop(file);
            self.check()?;
            fs::hard_link(&temporary, self.path.join(name))
        })();
        // A changed directory may belong to someone else. Do not clean paths in it.
        if self.check().is_ok() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }
    /// Once paid bytes exist, this synchronous publication must finish despite signals.
    pub fn save(&mut self, metadata: &Value, artifacts: &[Artifact]) -> Result<Value, Error> {
        let mut saved = Vec::new();
        let result = (|| -> io::Result<Value> {
            if self.used || artifacts.is_empty() || artifacts.len() > 16 {
                return Err(io::Error::other("artifacts"));
            }
            self.used = true;
            let total = artifacts
                .iter()
                .try_fold(0usize, |n, a| {
                    if a.data.is_empty() {
                        None
                    } else {
                        n.checked_add(a.data.len())
                    }
                })
                .ok_or_else(|| io::Error::other("bytes"))?;
            if total > 64 * 1024 * 1024 {
                return Err(io::Error::other("bytes"));
            }
            let created = crate::runtime::iso_ms(
                (time::OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000) as i64,
            )
            .map_err(|_| io::Error::other("timestamp"))?;
            let mut receipt = json!({"version":1,"id":Uuid::new_v4().to_string(),"created_at":created,"directory":self.path});
            for field in ["kind", "model_id", "provider_id", "binding_id", "variant"] {
                receipt[field] = metadata[field].clone();
            }
            if metadata["feature"] == "rigging" {
                receipt["feature"] = json!("rigging");
            }
            if let Some(task) = metadata.get("task") {
                receipt["task"] = task.clone();
            }
            for (i, a) in artifacts.iter().enumerate() {
                let extension = match a.media_type.as_str() {
                    "image/png" => "png",
                    "image/jpeg" => "jpg",
                    "image/webp" => "webp",
                    "image/avif" => "avif",
                    "image/gif" => "gif",
                    "video/mp4" => "mp4",
                    "video/webm" => "webm",
                    "audio/mpeg" => "mp3",
                    "audio/wav" => "wav",
                    "audio/ogg" => "ogg",
                    "model/gltf-binary" => "glb",
                    _ => "bin",
                };
                let name = format!("output-{}.{}", i + 1, extension);
                self.publish(&name, &a.data)?;
                saved.push(Saved {
                    path: self.path.join(name),
                    media_type: a.media_type.clone(),
                    bytes: a.data.len(),
                    sha256: format!("{:x}", Sha256::digest(&a.data)),
                });
            }
            receipt["artifacts"] = serde_json::to_value(&saved)?;
            let mut bytes = serde_json::to_vec_pretty(&receipt)?;
            bytes.push(b'\n');
            self.publish("receipt.json", &bytes)?;
            Ok(receipt)
        })();
        result.map_err(|_| Error {
            code: "save_failed",
            directory: Some(self.path.clone()),
            saved,
        })
    }
    pub fn abandon(&self) {
        if self.check().is_ok() {
            let _ = fs::remove_dir(&self.path);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use std::fs;
    fn png() -> Vec<u8> {
        base64::engine::general_purpose::STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=").unwrap()
    }
    fn metadata() -> Value {
        serde_json::json!({"kind":"image","model_id":"test","provider_id":"fal","binding_id":"test","variant":"text"})
    }
    #[test]
    fn content_admission_checks_dimensions_and_ignores_extensions() {
        assert_eq!(image_type(&png()), Some("image/png"));
        let mut invalid = png();
        invalid[16..20].fill(0);
        assert_eq!(image_type(&invalid), None);
        for end in 0..33 {
            assert_eq!(image_type(&png()[..end]), None);
        }
    }
    #[tokio::test]
    async fn explicit_text_json_and_image_contracts() {
        let root = tempfile::tempdir().unwrap();
        let p = root.path().join("source.bin");
        fs::write(&p, b"\xef\xbb\xbf{\"a\":1}").unwrap();
        let token = CancellationToken::new();
        assert_eq!(
            read_text(p.to_str().unwrap(), &token).await.unwrap(),
            "\u{feff}{\"a\":1}"
        );
        assert_eq!(
            read_input(&format!("@{}", p.display()), &token)
                .await
                .unwrap(),
            serde_json::json!({"a":1})
        );
        fs::write(&p, png()).unwrap();
        assert_eq!(
            read_image(p.to_str().unwrap(), IMAGE_LIMIT, &token)
                .await
                .unwrap()
                .media_type,
            "image/png"
        );
        token.cancel();
        assert_eq!(
            read_text(p.to_str().unwrap(), &token)
                .await
                .unwrap_err()
                .code,
            "cancelled"
        );
    }
    #[tokio::test]
    async fn invalid_sources_and_non_regular_files_fail() {
        let t = CancellationToken::new();
        for p in [
            "data:image/png;base64,AA==",
            "https://example.com/a",
            "file:/x",
            "",
        ] {
            assert_eq!(read_text(p, &t).await.unwrap_err().code, "invalid_input");
        }
        let root = tempfile::tempdir().unwrap();
        assert_eq!(
            read_text(root.path().to_str().unwrap(), &t)
                .await
                .unwrap_err()
                .code,
            "input_unavailable"
        );
    }
    #[test]
    fn exclusive_publication_hashes_and_partial_receipt() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("output");
        let mut d = Directory::prepare(&path).unwrap();
        assert!(Directory::prepare(&path).is_err());
        fs::write(path.join("output-2.png"), b"existing").unwrap();
        let artifact = Artifact {
            data: png(),
            media_type: "image/png".into(),
        };
        let error = d
            .save(&metadata(), &[artifact.clone(), artifact])
            .unwrap_err();
        assert_eq!(error.code, "save_failed");
        assert_eq!(error.saved.len(), 1);
        assert_eq!(fs::read(path.join("output-2.png")).unwrap(), b"existing");
        assert!(!path.join("receipt.json").exists());
        assert_eq!(error.saved[0].sha256.len(), 64);
        d.abandon();
        assert!(path.exists());
    }
    #[test]
    fn successful_receipt_and_empty_reservation_cleanup() {
        let root = tempfile::tempdir().unwrap();
        let mut d = Directory::prepare(&root.path().join("output")).unwrap();
        let receipt = d
            .save(
                &metadata(),
                &[Artifact {
                    data: png(),
                    media_type: "image/png".into(),
                }],
            )
            .unwrap();
        assert_eq!(receipt["version"], 1);
        assert!(receipt.get("feature").is_none());
        assert_eq!(
            serde_json::from_slice::<Value>(&fs::read(d.path.join("receipt.json")).unwrap())
                .unwrap(),
            receipt
        );
        assert!(d.save(&metadata(), &[]).is_err());
        let empty = Directory::prepare(&root.path().join("empty")).unwrap();
        empty.abandon();
        assert!(!empty.path.exists());
    }
    #[cfg(unix)]
    #[test]
    fn replaced_directory_is_never_followed() {
        use std::os::unix::fs::symlink;
        let root = tempfile::tempdir().unwrap();
        let mut d = Directory::prepare(&root.path().join("output")).unwrap();
        fs::rename(&d.path, root.path().join("old")).unwrap();
        fs::create_dir(root.path().join("victim")).unwrap();
        symlink(root.path().join("victim"), &d.path).unwrap();
        assert!(
            d.save(
                &metadata(),
                &[Artifact {
                    data: png(),
                    media_type: "image/png".into()
                }]
            )
            .is_err()
        );
        d.abandon();
        assert_eq!(fs::read_dir(root.path().join("victim")).unwrap().count(), 0);
    }
}
