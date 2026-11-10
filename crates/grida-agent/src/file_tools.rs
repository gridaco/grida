//! GRIDA-SEC-004 / GRIDA-SEC-014 — read-only tools with live workspace authority.

use crate::workspace::{DirectoryGrant, ProtectedRoots, WorkspaceSnapshot};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
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
const MAX_QUERY_BYTES: usize = 128;
const MAX_INPUT_BYTES: usize = 8192;
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

/// Captures directory selection for one turn and checks live grants at use.
pub struct FileTools {
    captured: Arc<WorkspaceSnapshot>,
    current: Arc<InvocationAuthority>,
    workers: Arc<Semaphore>,
}

impl FileTools {
    /// The authority callback must be a bounded synchronous snapshot read.
    /// Native execution requires macOS or Linux and supported filesystems.
    pub fn new(
        captured: Arc<WorkspaceSnapshot>,
        current: Arc<CurrentFileAuthority>,
    ) -> Result<Self> {
        Self::with_authority(captured, Arc::new(move |_| current()))
    }

    pub(crate) fn with_authority(
        captured: Arc<WorkspaceSnapshot>,
        current: Arc<InvocationAuthority>,
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
            workers: Arc::new(Semaphore::new(WORKERS)),
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
}

#[derive(Clone, Copy)]
enum Operation {
    Read,
    List,
    Search,
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
            Operation::List => (
                "list_files",
                "List bounded direct child files and folders. Use an optional relative folder path and directory ID. Omitting the path lists the selected directory. Symlinks are omitted.",
                vec![],
            ),
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
                max_input_bytes: MAX_INPUT_BYTES,
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
}

pub(crate) fn read_request(invocation: &Invocation) -> Result<Request> {
    let operation = match invocation.definition().id.as_str() {
        "read_file" => Operation::Read,
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
        {
            return Err(invalid());
        }
        let request: Request = serde_json::from_value(value.clone()).map_err(|_| invalid())?;
        if let Some(path) = &request.path {
            validate_path(path)?;
        }
        match (self, request.path.as_deref(), request.query.as_deref()) {
            (Self::Read, Some(path), None) if !path.as_os_str().is_empty() => {}
            (Self::List, _, None) => {}
            (Self::Search, _, Some(query))
                if !query.is_empty()
                    && query.len() <= MAX_QUERY_BYTES
                    && !query.contains(['\n', '\r', '\0']) => {}
            _ => return Err(invalid()),
        }
        Ok(request)
    }
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
