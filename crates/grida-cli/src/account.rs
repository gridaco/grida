// GRIDA-SEC-010 / GRIDA-SEC-015 — fixed account operations and scoped GG grants.
use crate::{
    Selector, Storage,
    error::{Error, Result},
    host::Host,
    http,
};
use grida_auth::{AuthClient, Backend, Organization, OrganizationsPage};
use serde_json::{Value, json};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
struct Transport {
    http: http::Transport,
    runtime: tokio::runtime::Handle,
}
impl grida_auth::Transport for Transport {
    fn send(&self, request: grida_auth::Request) -> grida_auth::Result<grida_auth::Response> {
        let failure = || grida_auth::Error::new("unavailable");
        let mut wire = http::Request::new(
            request.method.parse().map_err(|_| failure())?,
            request.url.clone(),
            request.body.clone().unwrap_or_default(),
        );
        wire.max_response_bytes = 65_536;
        wire.completion = if request.response_empty {
            http::ResponseCompletion::Empty
        } else {
            http::ResponseCompletion::Body
        };
        wire.headers.insert(
            "accept",
            ::http::HeaderValue::from_static("application/json"),
        );
        for (name, value) in &request.headers {
            wire.headers.insert(
                ::http::HeaderName::from_bytes(name.as_bytes()).map_err(|_| failure())?,
                value.parse().map_err(|_| failure())?,
            );
        }
        let response = self
            .runtime
            .block_on(
                self.http
                    .send(http::Lane::Account, wire, &CancellationToken::new()),
            )
            .map_err(|error| match error {
                http::Error::InvalidResponse => grida_auth::Error::new("invalid_response"),
                _ => failure(),
            })?;
        let body = if request.response_empty
            || response.status == 204
            || !(200..300).contains(&response.status)
        {
            Value::Null
        } else {
            serde_json::from_str(&String::from_utf8_lossy(&response.body))
                .map_err(|_| grida_auth::Error::new("invalid_response"))?
        };
        Ok(grida_auth::Response {
            status: response.status,
            body,
        })
    }
}
pub fn open(
    host: &Host,
    storage: Option<Storage>,
    runtime: tokio::runtime::Handle,
) -> Result<AuthClient> {
    let http =
        http::Transport::account(&host.config.issuer, &host.config.api_origin).map_err(|_| {
            Error::new(
                "invalid_config",
                "The CLI authentication configuration is invalid.",
            )
        })?;
    AuthClient::open(
        host.config.clone(),
        host.home.clone(),
        storage.map(backend),
        Arc::new(Transport { http, runtime }),
    )
    .map_err(failure)
}
pub fn backend(s: Storage) -> Backend {
    match s {
        Storage::File => Backend::File,
        Storage::Keyring => Backend::Keyring,
    }
}
pub fn failure(e: grida_auth::Error) -> Error {
    let hint = match e.code() {
        "signed_out" | "token_rejected" => " Run grida auth login.",
        "custody_failed" => {
            " Check auth storage show and OS keyring access; file storage requires an explicit choice."
        }
        _ => "",
    };
    Error::new(
        e.code(),
        if e.code() == "cancelled" {
            "Command interrupted. An in-flight operation may have completed; inspect the session or storage state before retrying.".into()
        } else {
            format!("Grida authentication or account access failed.{hint}")
        },
    ).origin(crate::error::Origin::Auth)
}
fn selection_error(code: &str, choices: &[Organization], truncated: bool) -> Error {
    let mut e = Error::new(
        code,
        if code == "organization_required" {
            "Select an organization with --org <slug> or --org-id <id>."
        } else {
            "Grida could not complete the organization read."
        },
    );
    e.value["choices"] = json!(choices.iter().take(10).collect::<Vec<_>>());
    e.value["choices_truncated"] = json!(truncated || choices.len() > 10);
    e.origin(crate::error::Origin::Account)
}
pub fn select(client: &AuthClient, selected: Option<&Selector>) -> Result<Organization> {
    select_from(selected, |after| {
        client.organizations(after).map_err(failure)
    })
}
fn select_from(
    selected: Option<&Selector>,
    mut page: impl FnMut(Option<i64>) -> Result<OrganizationsPage>,
) -> Result<Organization> {
    let mut after = None;
    for _ in 0..100 {
        let page = page(after)?;
        if let Some(selected) = selected {
            if let Some(found) = page.organizations.iter().find(|o| match selected {
                Selector::Name(n) => &o.name == n,
                Selector::Id(id) => o.id as u64 == *id,
            }) {
                return Ok(found.clone());
            }
            if page.next_cursor.is_none() {
                return Err(selection_error("organization_not_found", &[], false));
            }
        } else {
            if page.organizations.is_empty() {
                return Err(selection_error("no_organizations", &[], false));
            }
            if page.organizations.len() == 1 && page.next_cursor.is_none() {
                return Ok(page.organizations[0].clone());
            }
            return Err(selection_error(
                "organization_required",
                &page.organizations,
                page.next_cursor.is_some(),
            ));
        }
        after = page.next_cursor;
    }
    Err(selection_error("selection_unavailable", &[], false))
}
pub fn credits(client: &AuthClient, selected: Option<&Selector>) -> Result<Value> {
    let organization = select(client, selected)?;
    client.credits(organization.id).map_err(failure)
}
pub fn view(client: &AuthClient) -> Result<Value> {
    let verified = client.verify().map_err(failure)?;
    let identity = match verified {
        grida_auth::Status::SignedOut => return Err(failure(grida_auth::Error::new("signed_out"))),
        grida_auth::Status::SignedIn { identity, .. }
        | grida_auth::Status::RefreshNeeded { identity, .. } => identity,
    };
    let organizations = organizations_from(|after| client.organizations(after).map_err(failure))?;
    Ok(json!({"identity":identity,"organizations":organizations}))
}
fn organizations_from(
    mut page: impl FnMut(Option<i64>) -> Result<OrganizationsPage>,
) -> Result<Vec<Organization>> {
    let mut after = None;
    let mut organizations = vec![];
    for _ in 0..100 {
        let page = page(after)?;
        organizations.extend(page.organizations);
        if page.next_cursor.is_none() {
            return Ok(organizations);
        }
        after = page.next_cursor;
    }
    Err(selection_error("selection_unavailable", &[], false))
}

#[cfg(test)]
#[path = "account_tests.rs"]
mod tests;
