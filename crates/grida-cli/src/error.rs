// GRIDA-SEC-010 / GRIDA-SEC-013 / GRIDA-SEC-014 — safe public failures only.
use serde_json::{Value, json};
#[derive(Debug, Clone, Copy)]
pub(crate) enum Origin {
    Command,
    File,
    Ai,
    Auth,
    Account,
}
#[derive(Debug)]
pub struct Error {
    pub value: Value,
    pub exit: u8,
    origin: Origin,
}
impl Error {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            value: json!({"code":code,"message":message.into()}),
            exit: if code == "invalid_usage" { 2 } else { 1 },
            origin: Origin::Command,
        }
    }
    pub(crate) fn origin(mut self, origin: Origin) -> Self {
        self.origin = origin;
        self
    }
    /// Keep command-family guidance at the presentation boundary while retaining
    /// the producer's safe code, organization choices and observed task receipt.
    pub(crate) fn media(mut self, mesh: bool) -> Self {
        let code = self.value["code"].as_str().unwrap_or("unavailable");
        let message = match self.origin {
            Origin::Auth => Some(if mesh {
                "GG needs an available Grida session. Run grida auth login."
            } else if matches!(code, "signed_out" | "token_rejected") {
                "GG needs a Grida session. Run grida auth login."
            } else {
                "Grida account access failed. Inspect auth status and credential storage before retrying."
            }),
            Origin::Account => Some("Select an available organization with --org or --org-id."),
            Origin::File if mesh => Some(match code {
                "input_unavailable" => {
                    "Cannot read the explicit input. GLB files are limited to 60,000,000 bytes; JSON input to 16 MiB."
                }
                "invalid_input" => {
                    "Supply a GLB file or a JSON object matching grida ai rigging inspect. Input URLs are not fetched."
                }
                "save_failed" => {
                    "Rigging returned bytes, but saving failed. Inspect the output before retrying; rigging was not repeated."
                }
                "cancelled" => {
                    "Command interrupted. An accepted request may still complete or be charged; it was not repeated."
                }
                _ => return self,
            }),
            Origin::Ai if mesh => Some(match code {
                "invalid_input" => {
                    "Input does not match this operation. Run grida ai rigging inspect for its schema."
                }
                "operation_unavailable" => {
                    "This rigging operation is unavailable. Run grida ai rigging list."
                }
                "provider_key_required" => {
                    "Configure Tripo with grida ai providers configure tripo, or supply TRIPO_API_KEY or --key-stdin."
                }
                "insufficient_credits" => {
                    "Credits are insufficient for the selected funding account."
                }
                _ => {
                    "Mesh operation failed. An accepted request may still be charged; no automatic retry was made."
                }
            }),
            _ => None,
        };
        if let Some(message) = message {
            self.value["message"] = json!(message);
        }
        self
    }
    pub fn usage(message: impl Into<String>) -> Self {
        Self::new("invalid_usage", message)
    }
    pub fn cancelled() -> Self {
        Self::new(
            "cancelled",
            "Command interrupted. An accepted upstream request may still complete or be charged; it was not repeated.",
        ).origin(Origin::File)
    }
}
impl From<crate::files::Error> for Error {
    fn from(e: crate::files::Error) -> Self {
        let message = match e.code {
            "input_unavailable" => "Cannot read the explicit JSON input (16 MiB maximum).",
            "invalid_input" => {
                "Input must be one valid UTF-8 JSON object matching the model schema."
            }
            "output_unavailable" => {
                "Output must be a new writable directory under an existing parent, with support for safe file publication."
            }
            "save_failed" => {
                "Generation returned bytes, but saving failed. Inspect the output directory before retrying; generation was not repeated."
            }
            _ => {
                "Command interrupted. An accepted upstream request may still complete or be charged; it was not repeated."
            }
        };
        let mut result = Self::new(e.code, message).origin(Origin::File);
        if let Some(path) = e.directory {
            result.value["directory"] = json!(path);
            result.value["saved"] = json!(e.saved);
        }
        result
    }
}
impl From<grida_ai::Failure> for Error {
    fn from(e: grida_ai::Failure) -> Self {
        let message = match e.code.as_str() {
            "invalid_input" => {
                "Input does not match the selected operation. Run grida ai models inspect for its schema."
            }
            "operation_unavailable" => {
                "This provider/model/input variant has no supported operation. Run grida ai models list."
            }
            "provider_key_required" => {
                "Configure the selected provider with grida ai providers configure, or supply its environment key or --key-stdin."
            }
            "insufficient_credits" => "Credits are insufficient for the selected funding account.",
            _ => {
                "Media operation failed. An accepted request may still be charged; no automatic retry was made."
            }
        };
        let mut result = Self::new(&e.code, message).origin(Origin::Ai);
        if let Some(id) = e.task_id {
            result.value["task_id"] = json!(id);
        }
        result
    }
}
pub type Result<T> = std::result::Result<T, Error>;
