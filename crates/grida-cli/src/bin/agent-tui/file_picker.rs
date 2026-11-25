//! Completion over workspace-relative paths in the terminal composer.

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use grida_agent::workspace_search::{WorkspaceSearch, WorkspaceSearchEntry};

#[derive(PartialEq, Eq)]
struct Query {
    start: usize,
    text: String,
}

impl Query {
    fn at_end(draft: &str) -> Option<Self> {
        let token = draft.rsplit(char::is_whitespace).next()?;
        let text = token.strip_prefix('@')?;
        (!text.is_empty()).then(|| Self {
            start: draft.len() - token.len(),
            text: text.into(),
        })
    }
}

#[derive(Default)]
pub(super) struct FilePicker {
    query: Option<Query>,
    paths: Option<WorkspaceSearch>,
    matches: Vec<WorkspaceSearchEntry>,
    selected: usize,
    dismissed: bool,
}

impl FilePicker {
    pub fn update(&mut self, draft: Option<&str>) {
        let query = draft.and_then(Query::at_end);
        if self.query == query {
            return;
        }
        if self.query.as_ref().map(|query| query.start) != query.as_ref().map(|query| query.start) {
            self.paths = None;
        }
        self.query = query;
        self.dismissed = false;
        self.rank();
    }

    fn open(&self) -> bool {
        self.query.is_some() && !self.dismissed
    }

    pub fn needs_paths(&self) -> bool {
        self.open() && self.paths.is_none()
    }

    pub fn set_paths(&mut self, paths: WorkspaceSearch) {
        if self.open() {
            self.paths = Some(paths);
            self.rank();
        }
    }

    fn rank(&mut self) {
        self.matches.clear();
        self.selected = 0;
        let (Some(query), Some(paths)) = (&self.query, &self.paths) else {
            return;
        };
        self.matches = paths.search(&query.text);
    }

    pub fn height(&self) -> u16 {
        if !self.open() {
            return 0;
        }
        (self.matches.len() as u16).max(u16::from(self.needs_paths()))
    }

    pub fn visible_paths(
        &self,
        height: u16,
    ) -> impl Iterator<Item = (&WorkspaceSearchEntry, bool)> {
        let height = usize::from(height);
        let start = (self.selected + 1).saturating_sub(height);
        self.matches
            .iter()
            .enumerate()
            .skip(start)
            .take(height)
            .map(|(index, path)| (path, index == self.selected))
    }

    pub fn key(&mut self, key: KeyEvent, insert: impl FnOnce(usize, &str)) -> bool {
        if !self.open() || key.modifiers != KeyModifiers::NONE {
            return false;
        }
        let count = self.matches.len();
        match key.code {
            KeyCode::Esc => self.dismissed = true,
            KeyCode::Tab | KeyCode::Enter | KeyCode::Up | KeyCode::Down if self.needs_paths() => {}
            _ if count == 0 => return false,
            KeyCode::Up => self.selected = (self.selected + count - 1) % count,
            KeyCode::Down => self.selected = (self.selected + 1) % count,
            KeyCode::Tab | KeyCode::Enter => {
                let query = self.query.as_ref().expect("open query");
                insert(query.start, &self.matches[self.selected].path);
                *self = Self::default();
            }
            _ => return false,
        }
        true
    }
}
