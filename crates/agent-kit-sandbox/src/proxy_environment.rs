use std::collections::BTreeMap;

/// Install the trusted endpoint in both spellings that clients use.
pub fn configure(environment: &mut BTreeMap<String, String>, port: u16, password: &str) {
    let url = format!("http://grida:{password}@127.0.0.1:{port}");
    environment.retain(|key, _| !key.to_ascii_lowercase().ends_with("_proxy"));
    for key in [
        "all_proxy",
        "ALL_PROXY",
        "http_proxy",
        "HTTP_PROXY",
        "https_proxy",
        "HTTPS_PROXY",
    ] {
        environment.insert(key.into(), url.clone());
    }
}
