//! Eligibility of optional features on the foreground inference a person selected.

use agent_kit_core::inference::{RequestOptions, ResponseSpeed, WebSearchMode};
use agent_kit_core::{Error, ErrorKind, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Offer {
    status: Availability,
    speeds: Vec<ResponseSpeed>,
    web_search: bool,
    #[serde(default)]
    fast_mode_disabled: bool,
    #[serde(default)]
    web_search_mode: WebSearchMode,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum Availability {
    Available,
    Unsupported,
    Unavailable,
    ReauthenticationRequired,
}

impl Offer {
    pub fn resolve(&self, mut requested: RequestOptions) -> Result<RequestOptions> {
        if self.fast_mode_disabled {
            requested.speed = ResponseSpeed::Standard;
        }
        if requested.web_search {
            requested.web_search_mode = self.web_search_mode;
        }
        if requested.is_default() {
            return Ok(requested);
        }
        match self.status {
            Availability::Unsupported => {
                return Err(Error::new(
                    ErrorKind::Unsupported,
                    "chat_turn_options_unsupported",
                ));
            }
            Availability::Unavailable => {
                return Err(Error::new(
                    ErrorKind::Unavailable,
                    "chat_turn_capabilities_unavailable",
                ));
            }
            Availability::ReauthenticationRequired => {
                return Err(Error::new(
                    ErrorKind::Unavailable,
                    "chatgpt_reauthentication_required",
                ));
            }
            Availability::Available => {}
        }
        if !requested.speed.is_standard() && !self.speeds.contains(&requested.speed) {
            return Err(Error::new(ErrorKind::Unsupported, "chat_speed_unavailable"));
        }
        if requested.web_search && !self.web_search {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "chat_web_search_unavailable",
            ));
        }
        Ok(requested)
    }
}
