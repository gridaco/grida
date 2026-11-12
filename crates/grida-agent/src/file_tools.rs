//! GRIDA-SEC-004 / GRIDA-SEC-014 — file tools with live workspace authority.

use crate::workspace::{DirectoryGrant, ProtectedRoots, WorkspaceSnapshot};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{MediaRef, OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{
    Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition, ToolOutcome,
};
use agent_kit_core::{BindingId, BoxFuture, CancellationToken, Error, ErrorKind, Result, ToolId};
use serde::Deserialize;
use serde_json::{Map, json};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Semaphore;

const MAX_PATH_BYTES: usize = 4096;
const MAX_REFERENCE_PATH_BYTES: usize = 1024;
const MAX_QUERY_BYTES: usize = 128;
const MAX_INPUT_BYTES: usize = 8192;
/// Text writes and edits share the read bound (text-file mutation contract).
const MAX_TEXT_BYTES: usize = 64 * 1024;
const MAX_MUTATION_INPUT_BYTES: usize = 2 * MAX_TEXT_BYTES + MAX_INPUT_BYTES;
/// Top-level names that stay read-only under a writable root.
pub(crate) const PROTECTED_METADATA: [&str; 5] = [".git", ".agents", ".grida", ".codex", ".aws"];
/// Agent configuration names that commands may not create either. The other
/// names are protected for commands only once they exist, so a command can
/// start a new repository (permission policy, protected paths).
pub(crate) const PROTECTED_WHEN_MISSING: [&str; 2] = [".grida", ".codex"];
const MAX_OUTPUT_BYTES: usize = 64 * 1024;
const WORKERS: usize = 2;
const TIME_LIMIT: Duration = Duration::from_secs(3);

/// One coherent view of current host authority. Membership confers no grant.
#[derive(Clone)]
pub struct FileAuthority {
    pub workspace: Arc<WorkspaceSnapshot>,
    pub grants: Arc<[DirectoryGrant]>,
    pub protected: Arc<ProtectedRoots>,
}

pub type CurrentFileAuthority = dyn Fn() -> Result<FileAuthority> + Send + Sync;
type InvocationAuthority = dyn Fn(&Invocation) -> Result<FileAuthority> + Send + Sync;
pub(crate) type ImageCapture = dyn Fn(Vec<u8>) -> Result<MediaRef> + Send + Sync;
pub(crate) const VIEW_IMAGE: &str = "view_image";
pub(crate) const CAPTURE_IMAGE_REFERENCE: &str = "capture_image_reference";
pub(crate) const WORKSPACE_IMAGE_REFERENCE_SCHEMA: &str = "grida.agent.workspace-image-reference";

/// Captures directory selection for one turn and checks live grants at use.
pub struct FileTools {
    captured: Arc<WorkspaceSnapshot>,
    current: Arc<InvocationAuthority>,
    capture_image: Option<Arc<ImageCapture>>,
    capture_reference: Option<Arc<ImageCapture>>,
    workers: Arc<Semaphore>,
    /// Mutations are serialized so an edit always reads what it replaces.
    mutations: std::sync::Mutex<()>,
}

impl FileTools {
    /// The authority callback must be a bounded synchronous snapshot read.
    /// Native execution requires macOS or Linux and supported filesystems.
    pub fn new(
        captured: Arc<WorkspaceSnapshot>,
        current: Arc<CurrentFileAuthority>,
    ) -> Result<Self> {
        Self::with_authority(captured, Arc::new(move |_| current()), None, None)
    }

    pub(crate) fn with_authority(
        captured: Arc<WorkspaceSnapshot>,
        current: Arc<InvocationAuthority>,
        capture_image: Option<Arc<ImageCapture>>,
        capture_reference: Option<Arc<ImageCapture>>,
    ) -> Result<Self> {
        if !cfg!(any(target_os = "macos", target_os = "linux")) {
            return Err(problem(
                ErrorKind::Unsupported,
                "file_tools_platform_unsupported",
            ));
        }
        Ok(Self {
            captured,
            current,
            capture_image,
            capture_reference,
            workers: Arc::new(Semaphore::new(WORKERS)),
            mutations: std::sync::Mutex::new(()),
        })
    }

    /// These three adapters are read-only. The host selects offers and binds
    /// their execution grants separately.
    pub fn adapters(self: &Arc<Self>) -> Result<[Arc<dyn Tool>; 3]> {
        Ok([
            Arc::new(FileTool::new(self.clone(), Operation::Read)?),
            Arc::new(FileTool::new(self.clone(), Operation::List)?),
            Arc::new(FileTool::new(self.clone(), Operation::Search)?),
        ])
    }

    /// Text writes and edits. The host offers them only with a write rule.
    pub(crate) fn write_adapters(self: &Arc<Self>) -> Result<[Arc<dyn Tool>; 2]> {
        Ok([
            Arc::new(FileTool::new(self.clone(), Operation::Write)?),
            Arc::new(FileTool::new(self.clone(), Operation::Edit)?),
        ])
    }

    pub(crate) fn view_adapter(self: &Arc<Self>) -> Result<Option<Arc<dyn Tool>>> {
        self.capture_image
            .as_ref()
            .map(|_| {
                FileTool::new(self.clone(), Operation::View)
                    .map(|tool| Arc::new(tool) as Arc<dyn Tool>)
            })
            .transpose()
    }

    pub(crate) fn reference_adapter(self: &Arc<Self>) -> Result<Option<Arc<dyn Tool>>> {
        self.capture_reference
            .as_ref()
            .map(|_| {
                FileTool::new(self.clone(), Operation::CaptureReference)
                    .map(|tool| Arc::new(tool) as Arc<dyn Tool>)
            })
            .transpose()
    }
}

#[derive(Clone, Copy)]
enum Operation {
    Read,
    View,
    CaptureReference,
    List,
    Search,
    Write,
    Edit,
}

struct FileTool {
    scope: Arc<FileTools>,
    operation: Operation,
    definition: ToolDefinition,
}

impl FileTool {
    fn new(scope: Arc<FileTools>, operation: Operation) -> Result<Self> {
        let mut properties = Map::from_iter([
            ("directory".into(), json!({"type":"string","maxLength":256})),
            (
                "path".into(),
                json!({"type":"string","maxLength":MAX_PATH_BYTES}),
            ),
        ]);
        let (id, description, required) = match operation {
            Operation::Read => (
                "read_file",
                "Read one bounded UTF-8 text file. Use a relative path and an optional directory ID. The turn's primary directory is the default. Symlinks and binary files are refused.",
                vec!["path"],
            ),
            Operation::View => (
                VIEW_IMAGE,
                "See the pixels of one PNG in a readable workspace directory. Use a relative path and an optional directory ID. The primary directory is the default. The PNG must be at most 256 KiB. This tool leaves the source untouched.",
                vec!["path"],
            ),
            Operation::CaptureReference => {
                properties.remove("directory");
                properties.insert(
                    "path".into(),
                    json!({"type":"string","minLength":1,"maxLength":MAX_REFERENCE_PATH_BYTES}),
                );
                (
                    CAPTURE_IMAGE_REFERENCE,
                    "Capture one explicitly requested PNG in the primary workspace for image generation. Use its relative path. Pass the returned reference_id as workspace_reference_id to generate_image_from_workspace_reference in this turn. The PNG must be at most 256 KiB.",
                    vec!["path"],
                )
            }
            Operation::List => (
                "list_files",
                "List bounded direct child files and folders. Use an optional relative folder path and directory ID. Omitting the path lists the selected directory. Symlinks are omitted.",
                vec![],
            ),
            Operation::Write => {
                properties.insert(
                    "content".into(),
                    json!({"type":"string","maxLength":MAX_TEXT_BYTES}),
                );
                (
                    "write_file",
                    "Create a UTF-8 text file, or replace a whole existing one, at a relative path. Missing folders are created. Prefer edit_file for targeted changes. Version-control and agent metadata folders are read-only.",
                    vec!["path", "content"],
                )
            }
            Operation::Edit => {
                properties.insert(
                    "old_string".into(),
                    json!({"type":"string","minLength":1,"maxLength":MAX_TEXT_BYTES}),
                );
                properties.insert(
                    "new_string".into(),
                    json!({"type":"string","maxLength":MAX_TEXT_BYTES}),
                );
                properties.insert("replace_all".into(), json!({"type":"boolean"}));
                (
                    "edit_file",
                    "Replace exact text in a UTF-8 text file at a relative path. old_string must match the file's current content exactly once, unless replace_all is true. Include enough surrounding lines to make it unique. A missing or ambiguous match changes nothing; read the file and retry.",
                    vec!["path", "old_string", "new_string"],
                )
            }
            Operation::Search => {
                properties.insert(
                    "query".into(),
                    json!({
                        "type":"string","minLength":1,"maxLength":MAX_QUERY_BYTES
                    }),
                );
                (
                    "search_text",
                    "Find a case-sensitive literal in bounded UTF-8 text files under a relative directory path. Omitting the path searches the selected directory. Results give relative paths, line numbers, and snippets. A truncated result has partial coverage.",
                    vec!["query"],
                )
            }
        };
        Ok(Self {
            scope,
            operation,
            definition: ToolDefinition {
                id: ToolId::new(id)?,
                version: 1,
                description: description.into(),
                input: InputFormat::Json(json!({
                    "type": "object", "properties": properties,
                    "required": required, "additionalProperties": false
                })),
                max_input_bytes: if matches!(operation, Operation::Write | Operation::Edit) {
                    MAX_MUTATION_INPUT_BYTES
                } else {
                    MAX_INPUT_BYTES
                },
                max_output_bytes: MAX_OUTPUT_BYTES,
                recovery: RecoveryKind::Unavailable,
            },
        })
    }
}

impl Tool for FileTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        self.operation.parse(arguments).map(|_| ())
    }

    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            if invocation.definition() != &self.definition {
                return ToolOutcome::failed("file_definition_changed");
            }
            let request = match self.operation.parse(invocation.arguments()) {
                Ok(request) => request,
                Err(error) => return ToolOutcome::failed(&error.code),
            };
            let limit = Instant::now() + TIME_LIMIT;
            let deadline = context.deadline.unwrap_or(limit).min(limit);
            let cancellation = context.cancellation.child_token();
            let _stop_on_drop = cancellation.clone().drop_guard();
            let budget = Budget {
                output: context
                    .max_output_bytes
                    .min(self.definition.max_output_bytes),
                deadline,
                cancellation: cancellation.clone(),
                invocation,
            };
            if let Err(error) = budget.check() {
                return stopped(&error);
            }
            if budget.output == 0 {
                return ToolOutcome::failed("file_output_limit");
            }
            let Ok(runtime) = tokio::runtime::Handle::try_current() else {
                return ToolOutcome::failed("file_runtime_unavailable");
            };
            let Ok(permit) = self.scope.workers.clone().try_acquire_owned() else {
                return ToolOutcome::failed("file_workers_busy");
            };
            let scope = self.scope.clone();
            let operation = self.operation;
            let work = runtime.spawn_blocking(move || {
                let _permit = permit;
                let outcome = scope.execute(operation, request, &budget)?;
                budget.check()?;
                Ok(outcome)
            });
            tokio::select! {
                biased;
                _ = cancellation.cancelled() => cancelled("file_cancelled"),
                _ = tokio::time::sleep_until(deadline.into()) => cancelled("file_deadline"),
                result = work => match result {
                    Ok(Ok(outcome)) => outcome,
                    Ok(Err(error)) => stopped(&error),
                    Err(_) => ToolOutcome::failed("file_worker_failed"),
                }
            }
        })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Request {
    pub(crate) directory: Option<BindingId>,
    pub(crate) path: Option<PathBuf>,
    pub(crate) query: Option<String>,
    pub(crate) content: Option<String>,
    pub(crate) old_string: Option<String>,
    pub(crate) new_string: Option<String>,
    pub(crate) replace_all: Option<bool>,
}

/// Parse a write or edit invocation for permission evaluation.
pub(crate) fn write_request(invocation: &Invocation) -> Result<Request> {
    let operation = match invocation.definition().id.as_str() {
        "write_file" => Operation::Write,
        "edit_file" => Operation::Edit,
        _ => return Err(problem(ErrorKind::Unsupported, "file_tool_unavailable")),
    };
    operation.parse(invocation.arguments())
}

pub(crate) fn read_request(invocation: &Invocation) -> Result<Request> {
    let operation = match invocation.definition().id.as_str() {
        "read_file" => Operation::Read,
        VIEW_IMAGE => Operation::View,
        CAPTURE_IMAGE_REFERENCE => Operation::CaptureReference,
        "list_files" => Operation::List,
        "search_text" => Operation::Search,
        _ => return Err(problem(ErrorKind::Unsupported, "file_tool_unavailable")),
    };
    operation.parse(invocation.arguments())
}

impl Operation {
    fn parse(self, arguments: &ToolArguments) -> Result<Request> {
        let invalid = || problem(ErrorKind::InvalidInput, "file_arguments_invalid");
        let ToolArguments::Json(value) = arguments else {
            return Err(invalid());
        };
        let fields = value.as_object().ok_or_else(invalid)?;
        if fields.values().any(serde_json::Value::is_null)
            || (!matches!(self, Self::Search) && fields.contains_key("query"))
            || (!matches!(self, Self::Write) && fields.contains_key("content"))
            || (!matches!(self, Self::Edit)
                && ["old_string", "new_string", "replace_all"]
                    .iter()
                    .any(|field| fields.contains_key(*field)))
        {
            return Err(invalid());
        }
        let request: Request = serde_json::from_value(value.clone()).map_err(|_| invalid())?;
        if let Some(path) = &request.path {
            validate_path(path)?;
        }
        match (self, request.path.as_deref(), request.query.as_deref()) {
            (Self::Read | Self::View, Some(path), None) if !path.as_os_str().is_empty() => {}
            (Self::CaptureReference, Some(path), None)
                if request.directory.is_none()
                    && path.to_str().is_some_and(workspace_reference_path) => {}
            (Self::List, _, None) => {}
            (Self::Write, Some(path), None)
                if !path.as_os_str().is_empty()
                    && request
                        .content
                        .as_ref()
                        .is_some_and(|text| text.len() <= MAX_TEXT_BYTES) => {}
            (Self::Edit, Some(path), None)
                if !path.as_os_str().is_empty()
                    && request
                        .old_string
                        .as_ref()
                        .is_some_and(|text| !text.is_empty() && text.len() <= MAX_TEXT_BYTES)
                    && request
                        .new_string
                        .as_ref()
                        .is_some_and(|text| text.len() <= MAX_TEXT_BYTES) => {}
            (Self::Search, _, Some(query))
                if !query.is_empty()
                    && query.len() <= MAX_QUERY_BYTES
                    && !query.contains(['\n', '\r', '\0']) => {}
            _ => return Err(invalid()),
        }
        Ok(request)
    }
}

pub(crate) fn workspace_reference_path(path: &str) -> bool {
    path.len() <= MAX_REFERENCE_PATH_BYTES
        && path
            .split('/')
            .all(|part| !matches!(part, "" | "." | ".."))
        && !path.chars().any(|ch| {
            // Keep the relative name legible as a single line in the transfer review.
            ch.is_control()
                || matches!(ch, '\\' | '\u{061c}' | '\u{200e}' | '\u{200f}' | '\u{2028}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
        })
}

pub(crate) fn validate_path(path: &Path) -> Result<()> {
    if path.as_os_str().as_encoded_bytes().len() > MAX_PATH_BYTES
        || path
            .to_str()
            .is_none_or(|path| path.chars().any(char::is_control))
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(problem(
            ErrorKind::InvalidInput,
            "file_relative_path_invalid",
        ));
    }
    Ok(())
}

struct Budget {
    output: usize,
    deadline: Instant,
    cancellation: CancellationToken,
    invocation: Invocation,
}

impl Budget {
    fn check(&self) -> Result<()> {
        if self.cancellation.is_cancelled() {
            Err(problem(ErrorKind::Unavailable, "file_cancelled"))
        } else if Instant::now() >= self.deadline {
            Err(problem(ErrorKind::Unavailable, "file_deadline"))
        } else {
            Ok(())
        }
    }
}

fn stopped(error: &Error) -> ToolOutcome {
    match error.code.as_str() {
        "file_cancelled" | "file_deadline" => cancelled(&error.code),
        _ => ToolOutcome::failed(&error.code),
    }
}

fn cancelled(code: &str) -> ToolOutcome {
    ToolOutcome {
        status: OutcomeStatus::Cancelled,
        ..ToolOutcome::failed(code)
    }
}

fn problem(kind: ErrorKind, code: &'static str) -> Error {
    Error::new(kind, code)
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
impl FileTools {
    fn execute(&self, _: Operation, request: Request, budget: &Budget) -> Result<ToolOutcome> {
        let _ = (
            &self.captured,
            &self.current,
            &self.capture_image,
            &self.capture_reference,
            request.directory,
            &budget.invocation,
        );
        Err(problem(
            ErrorKind::Unsupported,
            "file_tools_platform_unsupported",
        ))
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod native;
#[cfg(any(target_os = "macos", target_os = "linux"))]
pub(crate) use native::{open_root_directory, open_root_file, verify_open_path};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generation_reference_requires_one_unambiguous_primary_path() {
        let parse = |value| Operation::CaptureReference.parse(&ToolArguments::Json(value));
        let request = parse(json!({"path":"images/Résumé.png"})).unwrap();
        assert_eq!(request.path.unwrap(), Path::new("images/Résumé.png"));
        assert!(request.directory.is_none());
        for path in [
            "",
            "/images/cover.png",
            "images//cover.png",
            "images/cover.png/",
            "images/./cover.png",
            "images/../cover.png",
            "images\\cover.png",
            "images/cover\n.png",
            "images/cover\u{202e}.png",
        ] {
            assert!(parse(json!({"path":path})).is_err(), "{path:?}");
        }
        assert!(parse(json!({"path":"é".repeat(513)})).is_err());
        assert!(parse(json!({"path":"cover.png", "directory":"primary"})).is_err());
    }
}
