//! GRIDA-SEC-004 — exact headless attachment storage and recovery.

use super::approvals::Stdio as PrivateStdio;
use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

const TOOL: &str = "inspect_retained_file";
const TEXT: &[u8] = b"\xef\xbb\xbfThe selected text stays byte exact.\r\n";
const BINARY: &[u8] = b"\x89\x00\xff\x01opaque fixture\x00";

fn digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[tokio::test]
async fn standard_embedded_text_uses_supplied_bytes_without_opening_its_uri() {
    let root = TempDir::new().unwrap();
    let project = TempDir::new().unwrap();
    let state = root.path().join("state");
    let origin = root.path().join("notes.txt");
    fs::write(&origin, "Unselected local version.").unwrap();
    let uri = reqwest::Url::from_file_path(&origin).unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool(TOOL, r#"{"include_text":true}"#),
        Reply::Finished("Inspected the supplied copy."),
    ])
    .await;
    let mut client = PrivateStdio::from_child(spawn_serve(&state, &endpoint.url));
    let initialized = read(&mut client, "initialize", json!({"protocolVersion":1})).await;
    assert_eq!(
        initialized["agentCapabilities"]["promptCapabilities"]["embeddedContext"],
        true
    );
    let session = read(
        &mut client,
        "session/new",
        json!({"cwd":project.path(),"mcpServers":[]}),
    )
    .await;
    let text = std::str::from_utf8(TEXT).unwrap();
    let response = read(
        &mut client,
        "session/prompt",
        json!({
            "sessionId":session["sessionId"],
            "prompt":[{"type":"text","text":"Inspect this version."},
                      {"type":"resource","resource":{"uri":uri.as_str(),"text":text}}],
        }),
    )
    .await;
    assert_eq!(response["stopReason"], "end_turn");
    let first = endpoint.request().await;
    check_file_request(&first, "notes.txt", &origin, TEXT);
    assert!(
        !first
            .to_string()
            .contains("The selected text stays byte exact.")
    );
    let followup = endpoint.request().await;
    assert!(!followup.to_string().contains("Unselected local version."));
    let result = tool_result(&followup);
    assert_eq!(result["status"], "succeeded");
    assert_eq!(result["structured"]["bytes"], TEXT.len());
    assert_eq!(result["structured"]["sha256"], digest(TEXT));
    assert_eq!(result["structured"]["text"], text);
    assert_eq!(fs::read(&origin).unwrap(), b"Unselected local version.");
    client.close().await;
}

#[tokio::test]
async fn embedded_blob_queue_retains_the_exact_receipt_across_restart() {
    let root = TempDir::new().unwrap();
    let project = TempDir::new().unwrap();
    let state = root.path().join("state");
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool(TOOL, "{}"),
        Reply::Finished("Inspected the supplied blob."),
    ])
    .await;
    let mut client = reopen(&state, &endpoint.url).await;
    let session = read(
        &mut client,
        "session/new",
        json!({"cwd":project.path(),"mcpServers":[]}),
    )
    .await;
    let session_id = &session["sessionId"];
    let uri = "https://uncontacted.invalid/private/copy.bin?ignored=locator-secret";
    let request = json!({
        "sessionId":session_id,"inputId":"embedded-copy",
        "prompt":[{"type":"text","text":"Inspect the supplied binary."},
                  {"type":"resource","resource":{"uri":uri,"blob":STANDARD.encode(BINARY)}}],
    });
    let accepted = read(&mut client, "_co.grida/session/enqueue", request.clone()).await;
    let first = endpoint.request().await;
    assert!(first.to_string().contains("Attached file copy.bin."));
    assert!(!first.to_string().contains("locator-secret"));
    assert!(!first.to_string().contains("uncontacted.invalid"));
    assert!(!first.to_string().contains(&STANDARD.encode(BINARY)));
    let result = tool_result(&endpoint.request().await);
    assert_eq!(result["status"], "succeeded");
    assert_eq!(result["structured"]["bytes"], BINARY.len());
    assert_eq!(result["structured"]["sha256"], digest(BINARY));
    let receipt_request = json!({"sessionId":session_id,"inputId":"embedded-copy"});
    let retained = timeout(WAIT, async {
        loop {
            let inspected = read(
                &mut client,
                "_co.grida/session/input",
                receipt_request.clone(),
            )
            .await;
            if inspected["receipt"]["disposition"] == "completed" {
                break inspected;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        retained["receipt"]["inputPosition"],
        accepted["inputPosition"]
    );
    assert_eq!(
        retained["prompt"][1],
        json!({"type":"text","text":"Attached file copy.bin."})
    );
    client.close().await;

    let mut client = reopen(&state, &endpoint.url).await;
    read(
        &mut client,
        "session/load",
        json!({"sessionId":session_id,"cwd":project.path(),"mcpServers":[]}),
    )
    .await;
    let repeated = read(&mut client, "_co.grida/session/enqueue", request.clone()).await;
    assert_eq!(repeated, retained["receipt"]);
    let mut changed = request;
    changed["prompt"][1]["resource"]["blob"] = STANDARD.encode(b"Different bytes").into();
    let refused = client.request("_co.grida/session/enqueue", changed).await;
    assert_eq!(refused["error"]["data"], "submission_input_changed");
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;
}

#[tokio::test]
async fn unsupported_or_combined_embedded_inputs_are_refused_before_staging() {
    let root = TempDir::new().unwrap();
    let project = TempDir::new().unwrap();
    let state = root.path().join("state");
    let mut endpoint = Endpoint::start(vec![]).await;
    let mut client = PrivateStdio::from_child(spawn_serve(&state, &endpoint.url));
    let mut initialize = extension_initialize();
    initialize["clientCapabilities"]["_meta"]["co.grida/session/selected-file"] = 1.into();
    read(&mut client, "initialize", initialize).await;
    let session = read(
        &mut client,
        "session/new",
        json!({"cwd":project.path(),"mcpServers":[]}),
    )
    .await;
    let text = json!({"type":"text","text":"Inspect the supplied material."});
    let resource =
        json!({"type":"resource","resource":{"uri":"file:///notes.txt","text":"Supplied"}});
    for (prompt, code) in [
        (vec![resource.clone()], "selected_file_requires_text"),
        (
            vec![text.clone(), resource.clone(), resource.clone()],
            "file_attachment_count_limit",
        ),
        (
            vec![
                text.clone(),
                resource.clone(),
                json!({"type":"image","data":"invalid","mimeType":"image/png"}),
            ],
            "file_attachment_count_limit",
        ),
        (
            vec![
                text.clone(),
                json!({"type":"resource","resource":{"uri":"file:///notes.txt","text":"x".repeat(256 * 1024 + 1)}}),
            ],
            "file_size_limit",
        ),
        (
            vec![
                text.clone(),
                json!({"type":"resource","resource":{"uri":"file:///notes.bin","blob":"%%%"}}),
            ],
            "invalid_file_attachment",
        ),
        (
            vec![
                text.clone(),
                json!({"type":"resource","resource":{"uri":"not a URI","text":"Supplied"}}),
            ],
            "embedded_resource_uri_invalid",
        ),
    ] {
        let refused = client
            .request(
                "session/prompt",
                json!({"sessionId":session["sessionId"],"prompt":prompt}),
            )
            .await;
        assert_eq!(refused["error"]["data"], code, "{refused}");
    }
    let refused = client.request("_co.grida/session/submit", json!({
        "sessionId":session["sessionId"], "inputId":"two-attachments", "prompt":[text, resource],
        "selectedFile":{"name":"other.txt","data":STANDARD.encode(TEXT)},
    })).await;
    assert_eq!(refused["error"]["data"], "file_attachment_count_limit");
    assert!(!state.join("retained-inputs").exists());
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;
}

#[tokio::test]
async fn shared_clients_cannot_admit_embedded_files() {
    let root = TempDir::new().unwrap();
    let state = root.path().join("state");
    let project = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![]).await;
    let (child, url) = shared_server(&state, &endpoint.url).await;
    let mut client = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let initialized = ws_rpc(&mut client, 1, "initialize", json!({"protocolVersion":1})).await;
    assert!(
        initialized["result"]["agentCapabilities"]["promptCapabilities"]["embeddedContext"] != true
    );
    let session = ws_rpc(
        &mut client,
        2,
        "session/new",
        json!({"cwd":project.path(),"mcpServers":[]}),
    )
    .await;
    let refused = ws_rpc(
        &mut client,
        3,
        "session/prompt",
        json!({
            "sessionId":session["result"]["sessionId"],
            "prompt":[{"type":"text","text":"Inspect the supplied material."},
                      {"type":"resource","resource":{"uri":"file:///notes.txt","text":"Supplied"}}],
        }),
    )
    .await;
    assert_eq!(refused["error"]["data"], "embedded_context_unavailable");
    assert!(!state.join("retained-inputs").exists());
    assert!(endpoint.requests.try_recv().is_err());
    drop(client);
    super::lifecycle::terminate_shared_server(child).await;
}

#[tokio::test]
async fn responses_counts_the_admitted_resource_descriptor_and_tools_before_generation() {
    let root = TempDir::new().unwrap();
    let project = TempDir::new().unwrap();
    let state = root.path().join("state");
    super::responses::input_limit(&state, 64);
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::InputCount(32),
            Reply::Finished("The descriptor fits."),
            Reply::InputCount(65),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut command = executable();
    command.args(["serve", "--stdio", "--provider", "responses"]);
    configured(&mut command, &state, &endpoint.url);
    let mut client = PrivateStdio::from_child(
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    read(&mut client, "initialize", json!({"protocolVersion":1})).await;
    let session = read(
        &mut client,
        "session/new",
        json!({"cwd":project.path(),"mcpServers":[]}),
    )
    .await;
    let prompt = json!({
        "sessionId":session["sessionId"],
        "prompt":[{"type":"text","text":"Inspect the attached reference."},
                  {"type":"resource","resource":{"uri":"file:///unselected/notes.txt","text":"supplied-private-bytes"}}],
    });
    let first = read(&mut client, "session/prompt", prompt.clone()).await;
    assert_eq!(first["stopReason"], "end_turn");
    let count = endpoint.request().await;
    assert!(
        count["input"]
            .to_string()
            .contains("Attached file notes.txt.")
    );
    assert!(!count.to_string().contains("supplied-private-bytes"));
    assert!(!count.to_string().contains("file:///unselected/"));
    assert!(
        count["tools"]
            .as_array()
            .unwrap()
            .iter()
            .any(|tool| tool["name"] == TOOL)
    );
    let mut generation = endpoint.request().await;
    for field in ["stream", "store", "max_output_tokens", "include"] {
        generation.as_object_mut().unwrap().remove(field);
    }
    assert_eq!(count, generation);

    let refused = client.request("session/prompt", prompt).await;
    assert_eq!(refused["error"]["data"], "input_token_limit", "{refused}");
    let count = endpoint.request().await;
    assert!(
        count["input"]
            .to_string()
            .contains("Attached file notes.txt.")
    );
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn selected_file_wire_admits_only_negotiated_bounded_bytes_with_text() {
    const CAPABILITY: &str = "co.grida/session/selected-file";
    let root = TempDir::new().unwrap();
    let project = TempDir::new().unwrap();
    let state = root.path().join("state");
    let mut endpoint = Endpoint::start(vec![]).await;
    let mut client = PrivateStdio::from_child(spawn_serve(&state, &endpoint.url));
    let response = client.request("initialize", extension_initialize()).await;
    assert_eq!(
        response["result"]["agentCapabilities"]["_meta"][CAPABILITY],
        1
    );
    let session = read(
        &mut client,
        "session/new",
        json!({"cwd":project.path(),"mcpServers":[]}),
    )
    .await["sessionId"]
        .clone();
    let request = json!({
        "sessionId":session,"inputId":"file","prompt":[{"type":"text","text":"Inspect my file."}],
        "selectedFile":{"name":"notes.txt","data":STANDARD.encode(TEXT)},
    });
    let rejected = client
        .request("_co.grida/session/submit", request.clone())
        .await;
    assert!(rejected["error"].is_object(), "{rejected}");
    assert!(!state.join("retained-inputs").exists());
    client.close().await;

    let mut client = PrivateStdio::from_child(spawn_serve(&state, &endpoint.url));
    let mut initialize = extension_initialize();
    initialize["clientCapabilities"]["_meta"][CAPABILITY] = 1.into();
    let response = client.request("initialize", initialize).await;
    assert_eq!(
        response["result"]["agentCapabilities"]["_meta"][CAPABILITY],
        1
    );
    read(
        &mut client,
        "session/load",
        json!({"sessionId":session,"cwd":project.path(),"mcpServers":[]}),
    )
    .await;
    for (field, value, code) in [
        (
            "name",
            json!("other/notes.txt"),
            "retained_file_name_invalid",
        ),
        ("data", json!("%%%"), "invalid_file_attachment"),
        (
            "data",
            json!(STANDARD.encode(vec![0u8; 256 * 1024 + 1])),
            "file_size_limit",
        ),
    ] {
        let mut invalid = request.clone();
        invalid["selectedFile"][field] = value;
        let rejected = client.request("_co.grida/session/submit", invalid).await;
        assert_eq!(rejected["error"]["data"], code, "{rejected}");
    }
    let mut no_text = request;
    no_text["prompt"] = json!([]);
    let rejected = client.request("_co.grida/session/submit", no_text).await;
    assert_eq!(
        rejected["error"]["data"], "selected_file_requires_text",
        "{rejected}"
    );
    assert!(!state.join("retained-inputs").exists());
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;
}

fn run(state: &Path, endpoint: &str, selected: &Path) -> Command {
    let mut command = executable();
    command.arg("run");
    configured(&mut command, state, endpoint);
    command.arg("--input-file").arg(selected).args([
        "--questions",
        "--prompt",
        "Inspect the file I selected.",
    ]);
    command
}

async fn reopen(state: &Path, endpoint: &str) -> PrivateStdio {
    let mut client = PrivateStdio::from_child(spawn_serve(state, endpoint));
    let mut initialize = extension_initialize();
    for capability in [
        "questions",
        "answer-question",
        "turn-summary",
        "delete",
        "organize",
    ] {
        initialize["clientCapabilities"]["_meta"][format!("co.grida/session/{capability}")] =
            1.into();
    }
    let response = client.request("initialize", initialize).await;
    assert_eq!(response["result"]["protocolVersion"], 1, "{response}");
    client
}

async fn read(client: &mut PrivateStdio, method: &str, parameters: Value) -> Value {
    let response = client.request(method, parameters).await;
    response
        .get("result")
        .unwrap_or_else(|| panic!("{response}"))
        .clone()
}

fn only_path(directory: &Path) -> PathBuf {
    let entries = fs::read_dir(directory)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect::<Vec<_>>();
    let [entry] = entries.as_slice() else {
        panic!("{entries:?}")
    };
    entry.clone()
}

fn tool_result(request: &Value) -> Value {
    let result = request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .rev()
        .find(|message| {
            message["role"] == "tool"
                && message["content"]
                    .as_str()
                    .is_some_and(|value| value.contains("sha256"))
        })
        .unwrap_or_else(|| panic!("no retained result in {request}"));
    serde_json::from_str(result["content"].as_str().unwrap()).unwrap()
}

fn check_file_request(request: &Value, name: &str, path: &Path, bytes: &[u8]) {
    let encoded = request.to_string();
    assert!(
        encoded.contains(&format!("Attached file {name}.")),
        "{request}"
    );
    assert!(!encoded.contains(path.to_str().unwrap()));
    assert!(!encoded.contains(&STANDARD.encode(bytes)));
    assert!(!encoded.contains("opaque fixture"));
    let offers = request["tools"].as_array().unwrap();
    assert!(offers.iter().any(|offer| offer["function"]["name"] == TOOL));
    assert!(
        offers.iter().all(|offer| matches!(
            offer["function"]["name"].as_str(),
            Some(TOOL | "question" | "question_async")
        )),
        "{offers:?}"
    );
}

#[tokio::test]
async fn exact_text_and_binary_files_resume_or_report_missing_scratch_without_dispatch() {
    for (bytes, unavailable) in [
        (TEXT, None),
        (BINARY, None),
        (BINARY, Some("original")),
        (TEXT, Some("working copy")),
    ] {
        let root = TempDir::new().unwrap();
        let state = root.path().join("state");
        let project = TempDir::new().unwrap();
        let selected = project.path().join("selected file.bin");
        fs::write(&selected, bytes).unwrap();
        let mut replies = vec![Reply::Tool(TOOL, "{}"), Reply::Question("question")];
        if unavailable.is_none() {
            replies.extend([
                Reply::Tool(TOOL, r#"{"include_text":true}"#),
                Reply::Finished("Used the same private working copy."),
                Reply::Finished("This is an unrelated chat."),
            ]);
        }
        let mut endpoint = Endpoint::start(replies).await;
        let output = timeout(
            WAIT,
            run(&state, &endpoint.url, &selected)
                .current_dir(project.path())
                .output(),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(
            output.status.code(),
            Some(6),
            "{}\n{}",
            String::from_utf8_lossy(&output.stderr),
            String::from_utf8_lossy(&output.stdout)
        );
        let output = records(&output.stdout);
        let session = output[0]["session_id"].as_str().unwrap();
        let turn = output[0]["turn_id"].as_str().unwrap();
        let first = endpoint.request().await;
        check_file_request(&first, "selected_file.bin", &selected, bytes);
        assert!(
            !first
                .to_string()
                .contains("The selected text stays byte exact.")
        );
        let digest = digest(bytes);
        let initial = tool_result(&endpoint.request().await);
        assert_eq!(initial["status"], "succeeded");
        assert_eq!(
            initial["structured"],
            json!({
                "name":"selected_file.bin", "bytes":bytes.len(), "sha256":digest, "text":null, "textRequested":false,
            })
        );
        assert_eq!(fs::read(&selected).unwrap(), bytes);
        assert_eq!(fs::read_dir(project.path()).unwrap().count(), 1);

        let scope = only_path(&state.join("retained-inputs"));
        let original = fs::read_dir(scope.join("sources"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .find(|path| path.extension().is_some_and(|ext| ext == "asset"))
            .unwrap();
        let work = only_path(&scope.join("work"));
        assert!(fs::read(&original).unwrap().ends_with(bytes));
        assert_eq!(fs::read(&work).unwrap(), bytes);
        fs::remove_file(&selected).unwrap();
        match unavailable {
            Some("original") => fs::remove_file(&original).unwrap(),
            Some("working copy") => fs::remove_file(&work).unwrap(),
            None => {}
            _ => unreachable!(),
        }
        let context = state.join("attachment-context").canonicalize().unwrap();
        assert!(fs::read_dir(&context).unwrap().next().is_none());
        let mut client = reopen(&state, &endpoint.url).await;
        read(
            &mut client,
            "session/load",
            json!({"sessionId":session,"cwd":context,"mcpServers":[]}),
        )
        .await;
        let select = json!({"sessionId":session});
        let snapshot = read(&mut client, "_co.grida/session/snapshot", select.clone()).await;
        assert_eq!(snapshot["current"]["turnId"], turn);
        let pending = read(
            &mut client,
            "_co.grida/session/questions",
            json!({"sessionId":session,"turnId":turn}),
        )
        .await;
        assert_eq!(
            pending["questions"][0]["waitId"],
            output[1]["questions"][0]["waitId"]
        );
        assert!(endpoint.requests.try_recv().is_err());
        let answer = json!({
            "sessionId":session,"turnId":turn,"requestId":"use-attachment",
            "expectedSessionRevision":snapshot["sessionRevision"],
            "expectedControlRevision":pending["controlRevision"],
            "expectedHistoryPosition":pending["historyPosition"],
            "waitId":pending["questions"][0]["waitId"],"answer":{"kind":"choice","index":1},
        });
        let receipt = read(
            &mut client,
            "_co.grida/session/answer-question",
            answer.clone(),
        )
        .await;
        if unavailable.is_none() {
            let resumed = endpoint.request().await;
            check_file_request(&resumed, "selected_file.bin", &selected, bytes);
            assert_eq!(tool_result(&resumed), initial);
            let inspected = tool_result(&endpoint.request().await);
            assert_eq!(inspected["structured"]["sha256"], digest);
            assert_eq!(inspected["structured"]["textRequested"], true);
            assert_eq!(
                inspected["structured"]["text"],
                std::str::from_utf8(bytes)
                    .ok()
                    .map_or(Value::Null, |text| json!(text))
            );
        }
        let mut last = Value::Null;
        let settled = timeout(WAIT, async {
            loop {
                let view = read(&mut client, "_co.grida/session/snapshot", select.clone()).await;
                if view["current"].is_null() {
                    break view;
                }
                last = view;
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await;
        let settled = match settled {
            Ok(value) => value,
            Err(_) => {
                let output = client.finish().await;
                panic!(
                    "{unavailable:?}: {last}; {}",
                    String::from_utf8_lossy(&output.stderr)
                );
            }
        };
        assert_eq!(settled["latest"]["turnId"], turn);
        assert_eq!(
            settled["latest"]["status"],
            if unavailable.is_none() {
                "succeeded"
            } else {
                "failed"
            }
        );
        assert_eq!(
            read(&mut client, "_co.grida/session/answer-question", answer).await,
            receipt
        );
        if let Some(lost) = unavailable {
            let summary = read(
                &mut client,
                "_co.grida/session/turn-summary",
                json!({"sessionId":session,"turnId":turn}),
            )
            .await;
            assert!(
                summary["text"].as_str().unwrap().contains(lost),
                "{summary}"
            );
            assert_eq!(original.exists(), lost != "original");
            assert_eq!(work.exists(), lost != "working copy");
        } else {
            let other = read(
                &mut client,
                "session/new",
                json!({"cwd":context,"mcpServers":[]}),
            )
            .await;
            read(&mut client, "session/prompt", json!({"sessionId":other["sessionId"],"prompt":[{"type":"text","text":"Inspect a file called selected_file.bin."}]})).await;
            assert!(endpoint.request().await.get("tools").is_none());
            assert_eq!(fs::read(&work).unwrap(), bytes);
            if bytes == TEXT {
                let deletion = super::deletion::deletion(&mut client, session, &context).await;
                read(&mut client, "_co.grida/session/delete", deletion).await;
                assert!(!scope.exists());
                assert_eq!(
                    read(
                        &mut client,
                        "_co.grida/session/snapshot",
                        json!({"sessionId":other["sessionId"]})
                    )
                    .await["latest"]["status"],
                    "succeeded"
                );
            }
        }
        assert!(endpoint.requests.try_recv().is_err());
        client.close().await;
        endpoint.done().await;
    }
}

#[tokio::test]
async fn file_selection_refuses_links_directories_and_oversize_without_acceptance() {
    let root = TempDir::new().unwrap();
    let file = root.path().join("selected.txt");
    fs::write(&file, b"selected").unwrap();
    let symlink = root.path().join("symlink.txt");
    std::os::unix::fs::symlink(&file, &symlink).unwrap();
    let hardlink = root.path().join("hardlink.txt");
    fs::hard_link(&file, &hardlink).unwrap();
    let oversized = root.path().join("large.bin");
    fs::File::create(&oversized)
        .unwrap()
        .set_len(256 * 1024 + 1)
        .unwrap();
    let endpoint = Endpoint::start(Vec::new()).await;
    for (name, selected, code) in [
        ("symlink", symlink.as_path(), "selected_file_unavailable"),
        ("hardlink", hardlink.as_path(), "selected_file_unavailable"),
        ("directory", root.path(), "selected_file_unavailable"),
        ("oversize", oversized.as_path(), "file_size_limit"),
    ] {
        let state = root.path().join(name);
        let output = timeout(WAIT, run(&state, &endpoint.url, selected).output())
            .await
            .unwrap()
            .unwrap();
        assert!(!output.status.success());
        assert!(output.stdout.is_empty());
        assert!(
            String::from_utf8_lossy(&output.stderr).contains(code),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(!state.join("retained-inputs").exists());
    }
    endpoint.done().await;
}
