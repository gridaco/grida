//! A restricted view of a live or closed store. This never acquires the session
//! writer, admits work, opens a transcript, or creates an empty database.
//! GRIDA-SEC-004 — a catalog connection can update only a visible chat's read position.

use super::*;
use catalog::{
    ConversationAnchor, ConversationOrder, ConversationPage, ConversationReadState, ReadStateUpdate,
};
use rusqlite::OpenFlags;
use std::io::ErrorKind as IoErrorKind;
use std::time::SystemTime;

pub const CHANGE_FILE: &str = "catalog.changed";
pub const LEASE_PREFIX: &str = "catalog.lease-";

struct LeaseFiles {
    directory: PathBuf,
    prefix: String,
}

impl LeaseFiles {
    fn new(database: &Path) -> Result<Self> {
        let name = database
            .file_name()
            .ok_or_else(|| error(ErrorKind::InvalidInput, "store_filename_missing"))?;
        let namespace = Fingerprint::of(&name.as_encoded_bytes())?.to_hex();
        Ok(Self {
            directory: database.parent().unwrap().to_owned(),
            prefix: format!("{LEASE_PREFIX}{namespace}-"),
        })
    }

    fn staging(&self) -> PathBuf {
        self.directory.join(format!("{}pending", self.prefix))
    }

    fn path(&self, binding: &TurnBinding) -> Result<PathBuf> {
        let identity = Fingerprint::of(binding)?.to_hex();
        Ok(self.directory.join(format!("{}{identity}", self.prefix)))
    }

    /// Called while the database has a new exclusive writer. Any remaining
    /// lease in this database's namespace belonged to its previous process.
    fn discard_abandoned(&self) -> std::io::Result<()> {
        for entry in std::fs::read_dir(&self.directory)? {
            let entry = entry?;
            let lease = entry
                .file_name()
                .to_str()
                .and_then(|name| name.strip_prefix(&self.prefix))
                .and_then(Fingerprint::from_hex)
                .is_some();
            if (lease || entry.path() == self.staging()) && entry.file_type()?.is_file() {
                std::fs::remove_file(entry.path())?;
            }
        }
        Ok(())
    }
}

pub(super) struct Marker {
    leases: LeaseFiles,
    file: File,
}

impl Marker {
    pub(super) fn open_for_writer(database: &Path) -> Result<Self> {
        let leases = LeaseFiles::new(database)?;
        leases
            .discard_abandoned()
            .map_err(|_| error(ErrorKind::Unavailable, "catalog_lease_unavailable"))?;
        let file = open_private_file(&leases.directory.join(CHANGE_FILE))?;
        Ok(Self { leases, file })
    }

    /// The writer's private transaction state. Track only fields exposed by
    /// the catalog; an aborted write rolls its invalidation back with the data.
    pub(super) fn track(connection: &Connection) -> Result<()> {
        connection.execute_batch("
            CREATE TEMP TABLE catalog_dirty (id INTEGER PRIMARY KEY);
            CREATE TEMP TRIGGER catalog_insert AFTER INSERT ON main.sessions
                WHEN NEW.conversation_group IS NOT NULL
                BEGIN INSERT OR IGNORE INTO catalog_dirty VALUES(1); END;
            CREATE TEMP TRIGGER catalog_delete AFTER DELETE ON main.sessions
                WHEN OLD.conversation_group IS NOT NULL
                BEGIN INSERT OR IGNORE INTO catalog_dirty VALUES(1); END;
            CREATE TEMP TRIGGER catalog_update
                AFTER UPDATE OF catalog_revision,active_turn,last_message_ms,reply_id ON main.sessions
                WHEN NEW.conversation_group IS NOT NULL AND
                    (OLD.catalog_revision IS NOT NEW.catalog_revision OR
                     OLD.active_turn IS NOT NEW.active_turn OR
                     OLD.last_message_ms IS NOT NEW.last_message_ms OR
                     OLD.read_revision IS NOT NEW.read_revision)
                BEGIN INSERT OR IGNORE INTO catalog_dirty VALUES(1); END;
        ").map_err(database_error)
    }

    /// Turn-head fields and OS ownership are projected separately from the
    /// session row. Stage their wake in the same transaction as the new head.
    pub(super) fn stage_turn(tx: &Transaction<'_>, session: &SessionId) -> Result<()> {
        tx.prepare_cached(
            "INSERT OR IGNORE INTO temp.catalog_dirty SELECT 1 FROM sessions
             WHERE id=?1 AND conversation_group IS NOT NULL",
        )
        .map_err(database_error)?
        .execute([session.as_str()])
        .map_err(database_error)?;
        Ok(())
    }

    pub(super) fn take_change(tx: &Transaction<'_>) -> Result<bool> {
        Ok(tx
            .prepare_cached("DELETE FROM temp.catalog_dirty")
            .map_err(database_error)?
            .execute([])
            .map_err(database_error)?
            != 0)
    }

    pub(super) fn changed(&self) {
        signal_change(&self.file);
    }
}

/// SQLite is authoritative. Losing a best-effort filesystem wake after
/// commit must never turn a successful write into an apparent rejection.
fn signal_change(file: &File) {
    let _ = file.set_modified(SystemTime::now());
}

/// Mirrors the lifetime of the journal handle across process boundaries. The
/// OS releases the lock on process death, even if the path survives the writer.
pub(super) struct TurnOwner(Option<(File, PathBuf)>);

impl TurnOwner {
    pub(super) fn acquire(
        inner: &Inner,
        tx: &Transaction<'_>,
        binding: &TurnBinding,
    ) -> Result<Self> {
        let Some(marker) = &inner.catalog_marker else {
            return Ok(Self(None));
        };
        let public: bool = tx
            .prepare_cached("SELECT conversation_group IS NOT NULL FROM sessions WHERE id=?1")
            .map_err(database_error)?
            .query_row([binding.session.as_str()], |row| row.get(0))
            .map_err(database_error)?;
        if !public {
            return Ok(Self(None));
        }
        // A recovered claim can keep the same active_turn. Wake after its
        // new binding is committed as well as when the lease disappears.
        Marker::stage_turn(tx, &binding.session)?;
        Self::publish(&marker.leases, binding)
    }

    fn publish(leases: &LeaseFiles, binding: &TurnBinding) -> Result<Self> {
        // The store serializes claims under its writer lock. Lock a private
        // staging inode first; an observer of an older SQLite snapshot can
        // never contend with a new claim, even if a deleted identity is reused.
        let staging = leases.staging();
        let path = leases.path(binding)?;
        let file = open_private_file(&staging)?;
        file.try_lock()
            .map_err(|_| error(ErrorKind::Conflict, "turn_still_owned"))?;
        std::fs::rename(staging, &path)
            .map_err(|_| error(ErrorKind::Unavailable, "catalog_lease_unavailable"))?;
        Ok(Self(Some((file, path))))
    }
}

impl Drop for TurnOwner {
    fn drop(&mut self) {
        if let Some((file, path)) = &self.0 {
            let _ = std::fs::remove_file(path);
            let _ = file.unlock();
        }
    }
}

fn live(leases: &LeaseFiles, binding: &TurnBinding) -> Result<bool> {
    let file = match File::open(leases.path(binding)?) {
        Ok(file) => file,
        Err(e) if e.kind() == IoErrorKind::NotFound => return Ok(false),
        Err(_) => return Err(error(ErrorKind::Unavailable, "catalog_lease_unavailable")),
    };
    match file.try_lock_shared() {
        Ok(()) => Ok(false),
        Err(std::fs::TryLockError::WouldBlock) => Ok(true),
        Err(_) => Err(error(ErrorKind::Unavailable, "catalog_lease_unavailable")),
    }
}

/// Last writer's PID, used only as a process-exit notification hint. The
/// owner clears it on graceful release. A reader must never briefly acquire
/// the writer lock: even a shared lock could reject a concurrent launch.
pub fn writer_pid(path: &Path) -> Option<i32> {
    use std::io::Read;
    let path = lock_path(path);
    if !std::fs::symlink_metadata(&path).ok()?.is_file() {
        return None;
    }
    let mut file = File::open(path).ok()?;
    let mut value = String::new();
    file.by_ref().take(16).read_to_string(&mut value).ok()?;
    value.trim().parse::<i32>().ok().filter(|p| *p > 0)
}

pub struct CatalogReader {
    connection: Connection,
    leases: LeaseFiles,
}

impl CatalogReader {
    /// Open only an existing, recognized database. A caller may separately
    /// ask the normal writer to migrate an older store once its owner closes.
    pub fn open(path: &Path, writable: bool) -> Result<Option<Self>> {
        let metadata = match std::fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(e) if e.kind() == IoErrorKind::NotFound => return Ok(None),
            Err(_) => {
                return Err(error(
                    ErrorKind::Unavailable,
                    "catalog_database_unavailable",
                ));
            }
        };
        let directory = path
            .parent()
            .ok_or_else(|| error(ErrorKind::InvalidInput, "store_directory_missing"))?
            .to_owned();
        require_private_directory(&directory)?;
        if !metadata.is_file() {
            return Err(error(ErrorKind::InvalidInput, "store_file_not_regular"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if metadata.mode() & 0o077 != 0 || metadata.nlink() != 1 {
                return Err(error(ErrorKind::InvalidInput, "store_file_not_private"));
            }
        }
        let flags = if writable {
            OpenFlags::SQLITE_OPEN_READ_WRITE
        } else {
            OpenFlags::SQLITE_OPEN_READ_ONLY
        };
        let connection = Connection::open_with_flags(
            path,
            flags | OpenFlags::SQLITE_OPEN_NO_MUTEX | OpenFlags::SQLITE_OPEN_NOFOLLOW,
        )
        .map_err(database_error)?;
        connection
            .busy_timeout(Duration::from_secs(2))
            .map_err(database_error)?;
        let identity: i64 = connection
            .pragma_query_value(None, "application_id", |r| r.get(0))
            .map_err(database_error)?;
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .map_err(database_error)?;
        if identity == schema::APPLICATION_ID && (1..schema::VERSION).contains(&version) {
            return Err(error(ErrorKind::Unsupported, "catalog_migration_required"));
        }
        if identity != schema::APPLICATION_ID || version != schema::VERSION {
            return Err(error(
                ErrorKind::Unsupported,
                "catalog_database_unsupported",
            ));
        }
        let supported: bool = connection
            .query_row(
                "SELECT catalog=1 AND conversations=1 FROM store_profile WHERE singleton=1",
                [],
                |r| r.get(0),
            )
            .map_err(database_error)?;
        if !supported {
            return Err(error(ErrorKind::Unsupported, "store_profile_mismatch"));
        }
        Ok(Some(Self {
            connection,
            leases: LeaseFiles::new(path)?,
        }))
    }

    /// Upgrade an existing legacy database only while its normal writer is
    /// idle. A simultaneously starting writer waits for that short upgrade.
    pub fn open_with_conversations(
        path: &Path,
        writable: bool,
        scope: catalog::ScopeProjection,
        links: Option<turn_links::TurnLinkProjection>,
        conversations: catalog::ConversationProjection,
    ) -> Result<Option<Self>> {
        let needs_upgrade = |err: &Error| err.code.as_str() == "catalog_migration_required";
        match Self::open(path, writable) {
            Err(err) if needs_upgrade(&err) => with_store_opening(path, |path| {
                // Another opener may have upgraded or removed the database.
                match Self::open(path, writable) {
                    Err(err) if needs_upgrade(&err) => {
                        drop(SqliteStore::open_writer(
                            path,
                            Some(scope),
                            links,
                            Some(conversations),
                        )?);
                        Self::open(path, writable)
                    }
                    result => result,
                }
            }),
            result => result,
        }
    }

    /// Read the index, row and turn head in one snapshot. Inspecting a running
    /// lease never acquires session execution ownership.
    pub fn list(
        &mut self,
        group: &str,
        order: ConversationOrder,
        after: Option<&ConversationAnchor>,
        inclusive: bool,
        limit: usize,
    ) -> Result<ConversationPage> {
        if !(1..=32).contains(&limit) || after.is_some_and(|a| a.value < -1) {
            return Err(error(ErrorKind::InvalidInput, "invalid_conversation_page"));
        }
        let tx = self.connection.transaction().map_err(database_error)?;
        let page = catalog::conversation_page(
            &tx,
            Some(group),
            0,
            order,
            (after, inclusive),
            limit,
            |entry| {
                catalog::record_with_view(&tx, entry, |session, turn| {
                    let facts = turn_layout::read_facts(&tx, session, turn)?;
                    let running = live(&self.leases, &facts.binding)?;
                    Ok(view_with_owner(facts, running))
                })
            },
        )?;
        tx.commit().map_err(database_error)?;
        Ok(page)
    }

    /// The read position is the only mutation available on a catalog connection.
    /// Revalidate the caller's grant once SQLite has granted the write transaction.
    pub fn update_read_state(
        &mut self,
        group: &str,
        session: &SessionId,
        update: &ReadStateUpdate,
        admit: impl FnOnce() -> Result<()>,
    ) -> Result<ConversationReadState> {
        let marker = open_private_file(&self.leases.directory.join(CHANGE_FILE))?;
        let (state, changed) = catalog::update_conversation_read(
            &mut self.connection,
            group,
            0,
            session,
            update,
            admit,
        )?;
        if changed {
            signal_change(&marker);
        }
        Ok(state)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reclaimed_leases_belong_only_to_the_reopened_database() {
        let directory = tempfile::tempdir().unwrap();
        let a = directory.path().join("a.sqlite");
        let b = directory.path().join("b.sqlite");
        let binding = TurnBinding {
            session: SessionId::new("session").unwrap(),
            turn: TurnId::new("turn").unwrap(),
            epoch: 1,
        };
        let a_path = LeaseFiles::new(&a).unwrap().path(&binding).unwrap();
        let b_path = LeaseFiles::new(&b).unwrap().path(&binding).unwrap();
        let _abandoned = File::create(&a_path).unwrap();
        let active = File::create(&b_path).unwrap();
        active.try_lock().unwrap();
        Marker::open_for_writer(&a).unwrap();
        assert!(!a_path.exists());
        let b_leases = LeaseFiles::new(&b).unwrap();
        assert!(live(&b_leases, &binding).unwrap());
        active.unlock().unwrap();

        // An old snapshot may still be checking the previous inode while the
        // store reuses an identity. Its short shared lock cannot reject a claim.
        active.try_lock_shared().unwrap();
        let _new_owner = TurnOwner::publish(&b_leases, &binding).unwrap();
        assert!(live(&b_leases, &binding).unwrap());
    }
}
