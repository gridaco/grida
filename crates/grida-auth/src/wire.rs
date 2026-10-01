// GRIDA-SEC-010 — bounded account response validation and safe projections.
use crate::{Error, Result, config::opaque};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

pub(crate) const MAX_SAFE: i64 = 9_007_199_254_740_991;
pub(crate) fn integer(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .filter(|n| (-MAX_SAFE..=MAX_SAFE).contains(n))
        .or_else(|| {
            value
                .as_f64()
                .filter(|n| n.is_finite() && n.fract() == 0.0 && n.abs() <= MAX_SAFE as f64)
                .map(|n| n as i64)
        })
}
pub(crate) fn deserialize_integer<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<i64, D::Error> {
    integer(&Value::deserialize(deserializer)?)
        .ok_or_else(|| serde::de::Error::custom("invalid integer"))
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Identity {
    pub id: String,
    #[serde(deserialize_with = "required_nullable")]
    pub email: Option<String>,
    #[serde(deserialize_with = "required_nullable")]
    pub display_name: Option<String>,
}
pub(crate) fn required_nullable<'de, D, T>(
    deserializer: D,
) -> std::result::Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer)
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state")]
pub enum Status {
    #[serde(rename = "signed-out")]
    SignedOut,
    #[serde(rename = "signed-in")]
    SignedIn {
        identity: Identity,
        #[serde(rename = "expiresAt")]
        expires_at: i64,
    },
    #[serde(rename = "refresh-needed")]
    RefreshNeeded {
        identity: Identity,
        #[serde(rename = "expiresAt")]
        expires_at: i64,
    },
}
#[derive(Debug, Clone, Serialize)]
pub struct Logout {
    pub state: &'static str,
    pub revocation: &'static str,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Organization {
    #[serde(deserialize_with = "deserialize_integer")]
    pub id: i64,
    pub name: String,
    pub display_name: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizationsPage {
    pub organizations: Vec<Organization>,
    pub next_cursor: Option<i64>,
}

pub(crate) fn invalid() -> Error {
    Error::new("invalid_response")
}
pub(crate) fn positive(v: i64) -> bool {
    (1..=MAX_SAFE).contains(&v)
}
pub(crate) fn identity(v: Value) -> Result<Identity> {
    if !v.get("email").is_some_and(|x| x.is_null() || x.is_string())
        || !v
            .get("display_name")
            .is_some_and(|x| x.is_null() || x.is_string())
    {
        return Err(invalid());
    }
    let id: Identity = serde_json::from_value(v).map_err(|_| invalid())?;
    if !opaque(&id.id) {
        return Err(invalid());
    }
    Ok(id)
}
fn organization(v: &Value) -> Result<Organization> {
    let org: Organization = serde_json::from_value(v.clone()).map_err(|_| invalid())?;
    if !positive(org.id) || !(1..=39).contains(&org.name.encode_utf16().count()) {
        return Err(invalid());
    }
    Ok(org)
}
pub(crate) fn organizations(v: Value, after: Option<i64>) -> Result<OrganizationsPage> {
    let array = v
        .get("organizations")
        .and_then(Value::as_array)
        .ok_or_else(invalid)?;
    if array.len() > 100 {
        return Err(invalid());
    }
    let mut last = after.unwrap_or(0);
    let mut rows = Vec::with_capacity(array.len());
    for value in array {
        let org = organization(value)?;
        if org.id <= last {
            return Err(invalid());
        }
        last = org.id;
        rows.push(org);
    }
    let next_cursor = match v.get("next_cursor") {
        Some(Value::Null) => None,
        Some(v) => Some(
            integer(v)
                .filter(|n| positive(*n) && *n == last && !rows.is_empty())
                .ok_or_else(invalid)?,
        ),
        None => return Err(invalid()),
    };
    Ok(OrganizationsPage {
        organizations: rows,
        next_cursor,
    })
}
pub(crate) fn timestamp(v: &str) -> Option<i64> {
    let b = v.as_bytes();
    if !(20..=64).contains(&b.len())
        || b.get(4) != Some(&b'-')
        || b.get(7) != Some(&b'-')
        || b.get(10) != Some(&b'T')
        || b.get(13) != Some(&b':')
        || b.get(16) != Some(&b':')
    {
        return None;
    }
    for range in [0..4, 5..7, 8..10, 11..13, 14..16, 17..19] {
        if !b[range].iter().all(u8::is_ascii_digit) {
            return None;
        }
    }
    if &b[17..19] > b"59".as_slice() {
        return None;
    }
    let mut end = 19;
    if b.get(end) == Some(&b'.') {
        end += 1;
        let start = end;
        while b.get(end).is_some_and(u8::is_ascii_digit) {
            end += 1;
        }
        if end == start {
            return None;
        }
    }
    if &b[end..] != b"Z"
        && !(b.len() == end + 6
            && matches!(b[end], b'+' | b'-')
            && b[end + 3] == b':'
            && b[end + 1..end + 3].iter().all(u8::is_ascii_digit)
            && b[end + 4..end + 6].iter().all(u8::is_ascii_digit)
            && &b[end + 1..end + 3] <= b"23".as_slice()
            && &b[end + 4..end + 6] <= b"59".as_slice())
    {
        return None;
    }
    chrono::DateTime::parse_from_rfc3339(v)
        .ok()
        .map(|d| d.timestamp_millis())
}
pub(crate) fn credits(v: Value, id: i64) -> Result<Value> {
    let org = organization(v.get("organization").ok_or_else(invalid)?)?;
    if org.id != id
        || v.get("source") != Some(&json!("cache"))
        || v.get("currency") != Some(&json!("USD"))
    {
        return Err(invalid());
    }
    let present = v
        .get("account_present")
        .and_then(Value::as_bool)
        .ok_or_else(invalid)?;
    let state = v.get("state").and_then(Value::as_str).ok_or_else(invalid)?;
    let gate = v.get("billing_gate").ok_or_else(invalid)?;
    let allowed = gate
        .get("allowed")
        .and_then(Value::as_bool)
        .ok_or_else(invalid)?;
    let reason = gate.get("reason").ok_or_else(invalid)?;
    let balance = v.get("balance_cents").ok_or_else(invalid)?;
    let updated = v.get("cache_updated_at").ok_or_else(invalid)?;
    if state == "not_provisioned" {
        if !balance.is_null() || !updated.is_null() || allowed || reason != "not_provisioned" {
            return Err(invalid());
        }
    } else {
        if !present
            || !(allowed && reason.is_null()
                || !allowed && matches!(reason.as_str(), Some("below_floor" | "no_balance")))
        {
            return Err(invalid());
        }
        match state {
            "uncached" if balance.is_null() && updated.is_null() => (),
            "cached"
                if integer(balance).is_some_and(|n| (-MAX_SAFE..=MAX_SAFE).contains(&n))
                    && updated.as_str().and_then(timestamp).is_some() => {}
            _ => return Err(invalid()),
        }
    }
    Ok(
        json!({"organization":org,"source":"cache","currency":"USD","account_present":present,"state":state,"balance_cents":balance,"cache_updated_at":updated,"billing_gate":{"allowed":allowed,"reason":reason}}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn timestamp_rejects_normalized_and_relaxed_dates() {
        for value in [
            "2025-02-29T00:00:00Z",
            "2024-01-01t00:00:00z",
            "2024-01-01T00:00:60Z",
            "2024-01-01T00:00:00.Z",
            "2024-01-01T00:00:00+24:00",
        ] {
            assert_eq!(timestamp(value), None, "{value}");
        }
        assert!(timestamp("2024-02-29T00:00:00.123+01:00").is_some());
    }
    #[test]
    fn pages_cannot_repeat_or_skip_cursor() {
        let row = json!({"id":2,"name":"team","display_name":"Team","secret":"discard"});
        assert!(
            organizations(json!({"organizations":[row.clone()],"next_cursor":3}), None).is_err()
        );
        assert!(
            organizations(
                json!({"organizations":[row.clone()],"next_cursor":null}),
                Some(2)
            )
            .is_err()
        );
        let page = organizations(json!({"organizations":[row],"next_cursor":2}), Some(1)).unwrap();
        assert!(!serde_json::to_string(&page).unwrap().contains("secret"));
    }
}
