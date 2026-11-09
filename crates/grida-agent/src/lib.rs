//! Native Grida Agent composition and process adapters.

pub mod acp;
pub mod command;
pub mod configuration;
mod configuration_tools;
mod custody;
pub mod file_tools;
pub mod gg;
pub mod host;
mod http;
pub mod permissions;
pub mod process;
pub mod scratch;
pub mod surface_tools;
pub mod tool_host;
pub mod workspace;

pub use http::{CompatibleOutputLimitField, ProviderOptions, ProviderProtocol};

pub use configuration_tools::ConfigurationPermission;
