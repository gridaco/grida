//! Native Grida Agent composition and process adapters.

pub mod acp;
mod chatgpt_subscription;
pub mod command;
pub mod configuration;
mod custody;
mod editor_surfaces;
pub mod file_tools;
pub mod gg;
mod goal_verification;
pub mod host;
mod http;
pub mod launch_permissions;
pub mod loopback_bearer;
pub mod mcp;
pub mod mcp_client;
pub mod permissions;
pub mod process;
pub mod processes;
pub mod scratch;
pub mod skills;
mod supervised_provider;
pub mod surface_tools;
pub mod tool_host;
pub mod workspace;
#[cfg(any(target_os = "macos", target_os = "linux"))]
pub mod workspace_file;

pub use http::{CompatibleOutputLimitField, ProviderOptions, ProviderProtocol};
pub use supervised_provider::SupervisedProvider;

pub use grida_agent_master::OperatingRegime;
pub use grida_agent_master::effort::Preset as EffortPreset;
