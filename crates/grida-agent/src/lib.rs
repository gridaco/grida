//! Native Grida Agent composition and process adapters.

pub mod acp;
mod chatgpt_subscription;
pub mod command;
pub mod configuration;
mod configuration_tools;
mod custody;
pub mod file_tools;
pub mod gg;
pub mod host;
mod http;
pub mod launch_permissions;
pub mod mcp;
pub mod permissions;
pub mod process;
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

pub use configuration_tools::ConfigurationPermission;
pub use grida_agent_master::OperatingRegime;
