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
        let digest = Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
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
