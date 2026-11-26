//! Bounded, ranked path discovery for a local workspace.

use serde::Serialize;
use std::fs;
use std::io;
use std::path::Path;

const MAX_RESULTS: usize = 8;
const MAX_CANDIDATES: usize = 800;
const MAX_DEPTH: usize = 4;
const MAX_DIRECTORIES: usize = 64;
pub(crate) const MAX_DIRECTORY_ENTRIES: usize = 8_192;
pub(crate) const MAX_DIRECTORY_NAME_BYTES: usize = 2 * 1024 * 1024;
const MAX_PATH_BYTES: usize = 4096;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceSearchKind {
    Directory,
    File,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct WorkspaceSearchEntry {
    pub path: String,
    pub kind: WorkspaceSearchKind,
}

impl WorkspaceSearchEntry {
    /// Return the basename and its workspace-relative parent.
    pub fn parts(&self) -> (&str, &str) {
        let (parent, name) = self.path.rsplit_once('/').unwrap_or(("", &self.path));
        (name, parent)
    }
}

pub(crate) struct Child {
    pub name: String,
    pub kind: WorkspaceSearchKind,
}

/// Ephemeral inventory of file and folder paths. A caller may reuse it while
/// refining one query and rescan to observe subsequent changes to the workspace.
#[derive(Default)]
pub struct WorkspaceSearch {
    entries: Vec<WorkspaceSearchEntry>,
}

impl WorkspaceSearch {
    /// Discover names under a local workspace the caller already has access to.
    /// The supplied path is the root for the scan. Symbolic links are omitted.
    pub fn scan(root: &Path) -> io::Result<Self> {
        let root = root.canonicalize()?;
        Self::from_directories(|parent| {
            let directory = root.join(parent);
            if directory.canonicalize()? != directory {
                return Err(io::Error::other("Workspace search directory changed"));
            }
            let mut entries = Vec::new();
            let mut name_bytes = 0;
            for (index, entry) in fs::read_dir(&directory)?.enumerate() {
                let entry = entry?;
                let name = entry.file_name();
                name_bytes += name.to_string_lossy().len();
                if index >= MAX_DIRECTORY_ENTRIES || name_bytes >= MAX_DIRECTORY_NAME_BYTES {
                    return Err(io::Error::other("Workspace search directory limit"));
                }
                let Some(name) = name.into_string().ok() else {
                    continue;
                };
                let kind = entry.file_type()?;
                if kind.is_dir() {
                    entries.push(Child {
                        name,
                        kind: WorkspaceSearchKind::Directory,
                    });
                } else if kind.is_file() {
                    entries.push(Child {
                        name,
                        kind: WorkspaceSearchKind::File,
                    });
                }
            }
            if directory.canonicalize()? != directory {
                return Err(io::Error::other("Workspace search directory changed"));
            }
            Ok(entries)
        })
    }

    pub(crate) fn from_directories<E>(
        mut read: impl FnMut(&Path) -> std::result::Result<Vec<Child>, E>,
    ) -> std::result::Result<Self, E> {
        let mut search = Self::default();
        let mut directories = vec![(String::new(), 0)];
        let mut index = 0;
        while let Some((parent, depth)) = directories.get(index).cloned() {
            index += 1;
            let mut children = match read(Path::new(&parent)) {
                Ok(children) => children,
                Err(error) if parent.is_empty() => return Err(error),
                Err(_) => continue,
            };
            children.retain(|entry| listable_name(&entry.name));
            // Spend the traversal budget reproducibly, with directories first.
            children.sort_by_cached_key(|entry| {
                (entry.kind, entry.name.to_lowercase(), entry.name.clone())
            });
            for Child { name, kind } in children {
                if kind == WorkspaceSearchKind::Directory
                    && (depth >= MAX_DEPTH
                        || directories.len() >= MAX_DIRECTORIES
                        || hidden_directory(&name))
                {
                    continue;
                }
                let path = if parent.is_empty() {
                    name
                } else {
                    format!("{parent}/{name}")
                };
                if path.len() > MAX_PATH_BYTES {
                    continue;
                }
                if kind == WorkspaceSearchKind::Directory {
                    directories.push((path.clone(), depth + 1));
                }
                search.entries.push(WorkspaceSearchEntry { path, kind });
                if search.entries.len() == MAX_CANDIDATES {
                    return Ok(search);
                }
            }
        }
        Ok(search)
    }

    /// Find up to eight results, ordered by case-insensitive exact name, name
    /// prefix, name substring, then path substring. Ties use the full path.
    pub fn search(&self, query: &str) -> Vec<WorkspaceSearchEntry> {
        if !valid_query(query) || query.trim().is_empty() {
            return Vec::new();
        }
        let query = query.to_lowercase();
        let mut matches = self
            .entries
            .iter()
            .filter_map(|entry| {
                let name = entry.parts().0.to_lowercase();
                let rank = if name == query {
                    0
                } else if name.starts_with(&query) {
                    1
                } else if name.contains(&query) {
                    2
                } else if entry.path.to_lowercase().contains(&query) {
                    3
                } else {
                    return None;
                };
                Some((rank, entry))
            })
            .collect::<Vec<_>>();
        matches.sort_by(|(left_rank, left), (right_rank, right)| {
            left_rank.cmp(right_rank).then(left.path.cmp(&right.path))
        });
        matches
            .into_iter()
            .take(MAX_RESULTS)
            .map(|(_, entry)| entry.clone())
            .collect()
    }
}

pub(crate) fn valid_query(query: &str) -> bool {
    query.len() <= MAX_PATH_BYTES && !query.chars().any(char::is_control)
}

fn listable_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with("._")
        && !name.contains(['/', '\\'])
        && !name.chars().any(char::is_control)
        && !matches!(
            name.to_ascii_lowercase().as_str(),
            "." | ".."
                | ".ds_store"
                | ".git"
                | ".hg"
                | ".svn"
                | "__macosx"
                | "cvs"
                | "desktop.ini"
                | "thumbs.db"
        )
}

fn hidden_directory(name: &str) -> bool {
    name.starts_with('.') || matches!(name, "node_modules" | "dist" | "build" | "target")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn traversal_budgets_are_independent_of_entry_enumeration_order() {
        let scan = |reverse: bool| {
            WorkspaceSearch::from_directories(|directory| {
                let mut children = if directory.as_os_str().is_empty() {
                    (0..70)
                        .map(|index| Child {
                            name: format!("dir-{index:02}"),
                            kind: WorkspaceSearchKind::Directory,
                        })
                        .chain(std::iter::once(Child {
                            name: ".DS_Store".into(),
                            kind: WorkspaceSearchKind::File,
                        }))
                        .collect::<Vec<_>>()
                } else {
                    vec![Child {
                        name: "result.txt".into(),
                        kind: WorkspaceSearchKind::File,
                    }]
                };
                if reverse {
                    children.reverse();
                }
                Ok::<_, ()>(children)
            })
            .unwrap()
        };
        let forward = scan(false);
        let reverse = scan(true);
        assert_eq!(forward.search("result"), reverse.search("result"));
        assert_eq!(forward.search("result").len(), MAX_RESULTS);
        assert_eq!(forward.search("result")[0].path, "dir-00/result.txt");
        assert_eq!(forward.search("dir-62/result").len(), 1);
        assert!(forward.search("dir-63/result").is_empty());
        assert!(forward.search(".DS_Store").is_empty());
        assert!(forward.search("").is_empty());
    }
}
