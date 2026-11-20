//! GRIDA-SEC-004 — notifications reveal metadata only within current registry grants.
//! Filesystem and process-lifetime events are invalidations. List queries are
//! always authoritative. Each observer retains at most one bit per visible root.

use super::*;
use agent_kit_store_sqlite::catalog_reader::{CHANGE_FILE, LEASE_PREFIX};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::time::Duration;
use tokio::sync::Notify;

#[derive(Default)]
struct Pending {
    registry: bool,
    rescan: bool,
    sources: Vec<Workspace>,
    cwds: BTreeSet<PathBuf>,
}

struct Queue {
    registry: Arc<Path>,
    pending: Mutex<Pending>,
    ready: Notify,
}

impl Queue {
    fn watcher(self: &Arc<Self>) -> HostResult<RecommendedWatcher> {
        let queue = self.clone();
        notify::recommended_watcher(move |event| queue.event(event))
            .map_err(|_| problem("catalog_watch_unavailable"))
    }

    fn event(&self, event: notify::Result<Event>) {
        let mut dirty = self.pending.lock().unwrap();
        if let Ok(event) = event
            && !event.need_rescan()
        {
            if event.kind.is_access() {
                return;
            }
            let replaced = matches!(
                event.kind,
                EventKind::Remove(_) | EventKind::Modify(notify::event::ModifyKind::Name(_))
            );
            for path in event.paths.iter().take(MAX_WORKSPACES * 4) {
                if path == self.registry.as_ref() {
                    dirty.registry = true;
                }
                let sources = &mut *dirty;
                for w in &sources.sources {
                    let is_store = path == &w.state_dir || w.state_dir.starts_with(path);
                    // inotify follows the directory inode and drops its watch on
                    // deletion. The same path may already name a new directory
                    // by the time we coalesce this event.
                    if is_store && replaced {
                        sources.rescan = true;
                    }
                    let file = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
                    // WAL updates alone may precede commit. The post-commit marker
                    // closes this window; writer exit covers abrupt process loss.
                    if is_store
                        || path.parent() == Some(&w.state_dir)
                            && (file == CHANGE_FILE
                                || file.starts_with(LEASE_PREFIX)
                                || file == "agent.sqlite" && (event.kind.is_create() || replaced)
                                || file == "agent.sqlite.lock")
                    {
                        sources.cwds.insert(w.cwd.clone());
                    }
                }
            }
            if event.paths.len() > MAX_WORKSPACES * 4
                || event.kind == EventKind::Any && event.paths.is_empty()
            {
                dirty.rescan = true;
            }
        } else {
            dirty.rescan = true;
        }
        if dirty.registry || dirty.rescan || !dirty.cwds.is_empty() {
            self.ready.notify_one();
        }
    }
}

pub(super) struct Observer {
    catalog: Catalog,
    cwd: Option<PathBuf>,
    queue: Arc<Queue>,
    watcher: RecommendedWatcher,
    watching: BTreeSet<PathBuf>,
    sources: Vec<Workspace>,
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    owners: BTreeMap<PathBuf, (i32, tokio::task::JoinHandle<()>)>,
}

impl Observer {
    pub(super) fn new(catalog: Catalog, cwd: Option<PathBuf>) -> HostResult<Self> {
        let queue = Arc::new(Queue {
            registry: catalog.registry.clone(),
            pending: Default::default(),
            ready: Notify::new(),
        });
        let watcher = queue.watcher()?;
        let mut value = Self {
            catalog,
            cwd,
            queue,
            watcher,
            watching: BTreeSet::new(),
            sources: Vec::new(),
            #[cfg(any(target_os = "linux", target_os = "macos"))]
            owners: BTreeMap::new(),
        };
        value.sync()?;
        if value.cwd.is_some() && value.sources.is_empty() {
            return Err(problem("session_catalog_scope_mismatch"));
        }
        Ok(value)
    }

    fn sync(&mut self) -> HostResult<bool> {
        let root = self.catalog.registry.parent().unwrap();
        let mut changed = self.add_watches(&BTreeSet::from([root.to_owned()]))?;
        // Installing FSEvents roots may replace its underlying stream. Verify
        // the manifest and the closest existing ancestors again after installing
        // watches. A store created during installation cannot disappear into a gap.
        for _ in 0..4 {
            let (sources, paths) = self.scope()?;
            self.queue.pending.lock().unwrap().sources = sources.clone();
            changed |= self.add_watches(&paths)?;
            for path in self.watching.difference(&paths) {
                if let Err(error) = self.watcher.unwatch(path)
                    && !matches!(
                        error.kind,
                        notify::ErrorKind::WatchNotFound | notify::ErrorKind::PathNotFound
                    )
                {
                    return Err(problem("catalog_watch_unavailable"));
                }
                changed = true;
            }
            self.watching = paths;
            if changed && self.scope()? != (sources.clone(), self.watching.clone()) {
                continue;
            }
            self.sources = sources;
            #[cfg(any(target_os = "linux", target_os = "macos"))]
            self.sync_owners();
            return Ok(changed);
        }
        Err(problem("catalog_scope_changed"))
    }

    fn scope(&self) -> HostResult<(Vec<Workspace>, BTreeSet<PathBuf>)> {
        let mut paths = BTreeSet::from([self.catalog.registry.parent().unwrap().to_owned()]);
        let mut sources = self.catalog.workspaces()?;
        sources.retain(|w| self.cwd.as_ref().is_none_or(|cwd| *cwd == w.cwd));
        for w in &sources {
            if let Some(p) = w.state_dir.ancestors().find(|p| p.is_dir()) {
                paths.insert(p.to_owned());
            }
        }
        Ok((sources, paths))
    }

    fn add_watches(&mut self, paths: &BTreeSet<PathBuf>) -> HostResult<bool> {
        let mut changed = false;
        for p in paths.difference(&self.watching) {
            self.watcher
                .watch(p, RecursiveMode::NonRecursive)
                .map_err(|_| problem("catalog_watch_unavailable"))?;
            changed = true;
        }
        self.watching.extend(paths.iter().cloned());
        Ok(changed)
    }

    pub(super) fn current_notification(&self, cwds: Option<Vec<PathBuf>>) -> Option<Vec<PathBuf>> {
        let sources = self.catalog.workspaces().ok()?;
        cwds.and_then(|mut paths| {
            paths.retain(|p| sources.iter().any(|w| *p == w.cwd));
            // Even maximally escaped 4 KiB paths must fit the wire frame. A
            // wider burst is one full refresh, independent of registry size.
            (paths.len() <= 32).then_some(paths)
        })
    }

    /// A killed process cannot touch the marker in Drop. A process-exit fd
    /// gives every subscribed client a wake without periodic SQLite reads.
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    fn sync_owners(&mut self) {
        let mut live = BTreeSet::new();
        for w in &self.sources {
            let Some(pid) = agent_kit_store_sqlite::catalog_reader::writer_pid(
                &w.state_dir.join(crate::host::DATABASE_FILE),
            ) else {
                continue;
            };
            if !owner_exists(pid) {
                continue;
            }
            live.insert(w.cwd.clone());
            if self
                .owners
                .get(&w.cwd)
                .is_some_and(|(known, _)| *known == pid)
            {
                continue;
            }
            if let Some((_, task)) = self.owners.remove(&w.cwd) {
                task.abort();
            }
            let fd = exit_fd(pid)
                .ok()
                .and_then(|fd| tokio::io::unix::AsyncFd::new(fd).ok());
            let queue = self.queue.clone();
            let cwd = w.cwd.clone();
            let database = w.state_dir.join(crate::host::DATABASE_FILE);
            self.owners.insert(
                w.cwd.clone(),
                (
                    pid,
                    tokio::spawn(async move {
                        if let Some(fd) = fd {
                            let _ = fd.readable().await;
                        } else {
                            // Older kernels and sandbox configurations may decline a
                            // process handle. Only that live writer gets a liveness
                            // probe. No SQLite queries or periodic UI refreshes run.
                            while agent_kit_store_sqlite::catalog_reader::writer_pid(&database)
                                == Some(pid)
                                && owner_exists(pid)
                            {
                                tokio::time::sleep(Duration::from_secs(1)).await;
                            }
                        }
                        queue.pending.lock().unwrap().cwds.insert(cwd);
                        queue.ready.notify_one();
                    }),
                ),
            );
        }
        self.owners.retain(|cwd, (_, task)| {
            if live.contains(cwd) {
                true
            } else {
                task.abort();
                false
            }
        });
    }

    pub(super) async fn next(&mut self) -> HostResult<Option<Vec<PathBuf>>> {
        loop {
            self.queue.ready.notified().await;
            tokio::time::sleep(Duration::from_millis(20)).await;
            let (rescan, mut cwds) = {
                let mut d = self.queue.pending.lock().unwrap();
                d.registry = false;
                (std::mem::take(&mut d.rescan), std::mem::take(&mut d.cwds))
            };
            let before = self.sources.clone();
            if rescan {
                self.watcher = self.queue.watcher()?;
                self.watching.clear();
            }
            let rearmed = self.sync()?;
            if before != self.sources || rescan {
                return Ok(None);
            }
            if rearmed {
                cwds.extend(self.sources.iter().map(|w| w.cwd.clone()));
            }
            cwds.retain(|cwd| self.sources.iter().any(|w| w.cwd == *cwd));
            if !cwds.is_empty() {
                return Ok(Some(cwds.into_iter().collect()));
            }
            // An unrelated registry change does not invalidate a filtered observer.
        }
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
impl Drop for Observer {
    fn drop(&mut self) {
        for (_, task) in self.owners.values() {
            task.abort();
        }
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn owner_exists(pid: i32) -> bool {
    rustix::process::Pid::from_raw(pid)
        .is_some_and(|pid| rustix::process::test_kill_process(pid) != Err(rustix::io::Errno::SRCH))
}

#[cfg(target_os = "linux")]
fn exit_fd(pid: i32) -> std::io::Result<std::os::fd::OwnedFd> {
    let pid = rustix::process::Pid::from_raw(pid).ok_or(std::io::ErrorKind::InvalidInput)?;
    Ok(rustix::process::pidfd_open(
        pid,
        rustix::process::PidfdFlags::empty(),
    )?)
}

#[cfg(target_os = "macos")]
#[allow(
    unsafe_code,
    reason = "EVFILT_PROC uses a pid, no file descriptors or userdata borrowed by the kernel"
)]
fn exit_fd(pid: i32) -> std::io::Result<std::os::fd::OwnedFd> {
    use rustix::event::kqueue::{Event, EventFilter, EventFlags, ProcessEvents, kevent, kqueue};
    let pid = rustix::process::Pid::from_raw(pid).ok_or(std::io::ErrorKind::InvalidInput)?;
    let fd = kqueue()?;
    let registration = Event::new(
        EventFilter::Proc {
            pid,
            flags: ProcessEvents::EXIT,
        },
        EventFlags::ADD | EventFlags::ONESHOT,
        std::ptr::null_mut(),
    );
    let mut receipts: [Event; 0] = [];
    // SAFETY: this change registers a process identifier and a null user pointer.
    unsafe {
        kevent(
            &fd,
            &[registration],
            &mut receipts[..],
            Some(Duration::ZERO),
        )?;
    }
    Ok(fd)
}
