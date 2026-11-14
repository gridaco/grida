//! GRIDA-SEC-004 — a file reference names a local file and grants nothing.

use super::approvals::{Fixture, Stdio as PrivateStdio};
use super::*;
use std::fs;

const CAPABILITY: &str = "co.grida/session/file-reference";
const DETAILS: &str = "co.grida/file-reference";
const POSTER: &str = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
const CONTENT: &str = "referenced workspace content";

fn serve(fixture: &Fixture, endpoint: &str) -> PrivateStdio {
    PrivateStdio::from_child(
        fixture
            .process(endpoint, "serve")
            .arg("--stdio")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap(),
    )
}

async fn negotiated(fixture: &Fixture, endpoint: &str) -> PrivateStdio {
    let mut client = serve(fixture, endpoint);
    let mut initialize = extension_initialize();
    initialize["clientCapabilities"]["_meta"][CAPABILITY] = 1.into();
    let ready = client.request("initialize", initialize).await;
    assert_eq!(ready["result"]["agentCapabilities"]["_meta"][CAPABILITY], 1);
    client
}

async fn read(client: &mut PrivateStdio, method: &str, parameters: Value) -> Value {
    let response = client.request(method, parameters).await;
    response
        .get("result")
        .unwrap_or_else(|| panic!("{response}"))
        .clone()
}

async fn completed(client: &mut PrivateStdio, session: &Value, input: &str) {
    let request = json!({"sessionId":session,"inputId":input});
    timeout(WAIT, async {
        loop {
            let inspected = read(client, "_co.grida/session/input", request.clone()).await;
            if inspected["receipt"]["disposition"] == "completed" {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
}

fn link(path: &Path, details: Value) -> Value {
    json!({
        "type":"resource_link","name":path.file_name().unwrap().to_str().unwrap(),
        "uri":reqwest::Url::from_file_path(path).unwrap().as_str(),
        "mimeType":"text/plain","size":CONTENT.len(),"_meta":{DETAILS:details},
    })
}

fn submit(session: &Value, input: &str, prompt: Value) -> Value {
    json!({"sessionId":session,"inputId":input,"prompt":prompt})
}

fn tool_result(request: &Value) -> String {
    request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .rev()
        .find(|message| message["role"] == "tool")
        .unwrap_or_else(|| panic!("no tool result in {request}"))["content"]
        .to_string()
}

#[tokio::test]
async fn a_workspace_reference_is_read_by_file_tools_and_replays_as_the_same_link() {
    let fixture = Fixture::new(false);
    fs::create_dir(fixture.primary.join("media")).unwrap();
    let file = fixture.primary.join("media/notes.txt");
    fs::write(&file, CONTENT).unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("read_file", r#"{"path":"media/notes.txt"}"#),
        Reply::Finished("Read the referenced file."),
    ])
    .await;
    let mut client = negotiated(&fixture, &endpoint.url).await;
    let session = read(
        &mut client,
        "session/new",
        json!({"cwd":fixture.primary,"mcpServers":[]}),
    )
    .await["sessionId"]
        .clone();
    let preview = json!({"poster":POSTER,"durationMs":1500,"width":640,"height":360});
    let reference = link(
        &file,
        json!({"workspacePath":"media/notes.txt","preview":preview}),
    );
    read(
        &mut client,
        "_co.grida/session/submit",
        submit(
            &session,
            "reference",
            json!([{"type":"text","text":"Summarize this file."}, reference]),
        ),
    )
    .await;

    // The model reads the path and facts; the bytes and the poster stay out.
    let first = endpoint.request().await.to_string();
    assert!(first.contains("Attached file by reference"), "{first}");
    assert!(first.contains("media/notes.txt"));
    assert!(first.contains(file.to_str().unwrap()));
    assert!(!first.contains(CONTENT));
    assert!(!first.contains("data:image"));
    // The file tools reach it under the workspace's own permission.
    let followup = endpoint.request().await;
    assert!(tool_result(&followup).contains(CONTENT), "{followup}");
    completed(&mut client, &session, "reference").await;
    client.close().await;

    let mut reopened = negotiated(&fixture, &endpoint.url).await;
    let id = reopened
        .send(
            "session/load",
            json!({"sessionId":session,"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await;
    let mut links = Vec::new();
    loop {
        let frame = reopened.read_frame().await;
        if frame["id"] == id {
            assert!(frame["result"].is_object(), "{frame}");
            break;
        }
        let update = &frame["params"]["update"];
        if update["sessionUpdate"] == "user_message_chunk" {
            assert!(!frame.to_string().contains("Attached file by reference"));
            if update["content"]["type"] == "resource_link" {
                links.push(update["content"].clone());
            }
        }
    }
    assert_eq!(links.len(), 1, "{links:?}");
    assert_eq!(links[0]["name"], "notes.txt");
    assert_eq!(links[0]["mimeType"], "text/plain");
    assert_eq!(links[0]["size"], CONTENT.len());
    assert_eq!(
        links[0]["_meta"][DETAILS],
        json!({"workspacePath":"media/notes.txt","preview":preview})
    );
    let queued = read(
        &mut reopened,
        "_co.grida/session/input",
        json!({"sessionId":session,"inputId":"reference"}),
    )
    .await;
    assert_eq!(queued["prompt"][1]["type"], "resource_link");
    reopened.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn a_reference_outside_the_workspace_does_not_extend_file_access() {
    let fixture = Fixture::new(false);
    let elsewhere = TempDir::new().unwrap();
    let file = elsewhere.path().canonicalize().unwrap().join("outside.txt");
    fs::write(&file, CONTENT).unwrap();
    let arguments: &'static str = Box::leak(json!({"path":file}).to_string().into_boxed_str());
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("read_file", arguments),
        Reply::Finished("The file tools could not open it."),
    ])
    .await;
    let mut client = negotiated(&fixture, &endpoint.url).await;
    let session = read(
        &mut client,
        "session/new",
        json!({"cwd":fixture.primary,"mcpServers":[]}),
    )
    .await["sessionId"]
        .clone();
    read(
        &mut client,
        "_co.grida/session/submit",
        submit(
            &session,
            "outside",
            json!([{"type":"text","text":"Look at this."}, link(&file, json!({}))]),
        ),
    )
    .await;
    let first = endpoint.request().await.to_string();
    assert!(first.contains(file.to_str().unwrap()));
    assert!(!first.contains("workspacePath"));
    let followup = endpoint.request().await;
    assert!(!tool_result(&followup).contains(CONTENT), "{followup}");
    completed(&mut client, &session, "outside").await;
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn file_references_are_refused_unless_negotiated_and_well_formed() {
    let fixture = Fixture::new(false);
    let file = fixture.primary.join("notes.txt");
    fs::write(&file, CONTENT).unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Finished("Plain context.")]).await;

    // Without the capability a `file:` link stays ordinary context text.
    let mut plain = serve(&fixture, &endpoint.url);
    let ready = plain.request("initialize", extension_initialize()).await;
    assert_eq!(ready["result"]["agentCapabilities"]["_meta"][CAPABILITY], 1);
    let session = read(
        &mut plain,
        "session/new",
        json!({"cwd":fixture.primary,"mcpServers":[]}),
    )
    .await["sessionId"]
        .clone();
    let text = json!({"type":"text","text":"Use this."});
    read(
        &mut plain,
        "_co.grida/session/submit",
        submit(&session, "plain", json!([text, link(&file, json!({}))])),
    )
    .await;
    let request = endpoint.request().await.to_string();
    assert!(!request.contains("Attached file by reference"));
    assert!(request.contains("notes.txt"));
    completed(&mut plain, &session, "plain").await;
    plain.close().await;

    let mut client = negotiated(&fixture, &endpoint.url).await;
    read(
        &mut client,
        "session/load",
        json!({"sessionId":session,"cwd":fixture.primary,"mcpServers":[]}),
    )
    .await;
    let valid = link(&file, json!({"workspacePath":"notes.txt"}));
    let with = |change: fn(&mut Value)| {
        let mut changed = valid.clone();
        change(&mut changed);
        json!([text, changed])
    };
    for (prompt, code) in [
        (json!([valid]), "file_reference_requires_text"),
        (json!([text, valid, valid]), "file_reference_count_limit"),
        (
            with(|link| link["uri"] = json!("file://remote-host/notes.txt")),
            "file_reference_path_invalid",
        ),
        (
            with(|link| link["mimeType"] = json!("Text/Plain")),
            "file_reference_media_type_invalid",
        ),
        (
            with(|link| link["size"] = json!(-1)),
            "file_reference_size_invalid",
        ),
        (
            with(|link| link["_meta"][DETAILS]["workspacePath"] = json!("other/notes.txt")),
            "file_reference_workspace_mismatch",
        ),
        (
            with(|link| link["_meta"][DETAILS]["unexpected"] = json!(true)),
            "file_reference_details_invalid",
        ),
        (
            with(|link| {
                link["_meta"][DETAILS]["preview"] = json!({"poster":"data:text/html;base64,AA"})
            }),
            "file_reference_preview_invalid",
        ),
    ] {
        let refused = client
            .request(
                "_co.grida/session/submit",
                submit(&session, "refused", prompt),
            )
            .await;
        assert_eq!(refused["error"]["data"], code, "{refused}");
    }
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;
    endpoint.done().await;
}
