//! Synthetic fixture driver, compiled only by the conformance feature.
//! GRIDA-SEC-010 / GRIDA-SEC-014: never part of the distributed CLI.
use crate::{
    AuthClient, Backend, Config, Error, ProviderStore, Request, Response, Result, Transport,
    custody::{Session, Store},
    native,
};
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
};

type Input = Arc<Mutex<BufReader<std::io::Stdin>>>;
fn receive(input: &Input) -> Result<Value> {
    let mut line = String::new();
    input
        .lock()
        .map_err(|_| Error::new("driver_failed"))?
        .read_line(&mut line)
        .map_err(|_| Error::new("driver_failed"))?;
    if line.len() > 1_048_576 {
        return Err(Error::new("driver_failed"));
    }
    serde_json::from_str(&line).map_err(|_| Error::new("driver_failed"))
}
fn emit(value: Value) -> Result<()> {
    let mut output = std::io::stdout().lock();
    serde_json::to_writer(&mut output, &value).map_err(|_| Error::new("driver_failed"))?;
    output
        .write_all(b"\n")
        .and_then(|_| output.flush())
        .map_err(|_| Error::new("driver_failed"))
}
struct Script(Input);
impl Transport for Script {
    fn send(&self, request: Request) -> Result<Response> {
        emit(
            json!({"event":"request","request":{"url":request.url,"method":request.method,"headers":request.headers,"body":request.body,"responseEmpty":request.response_empty}}),
        )?;
        let reply = receive(&self.0)?;
        Ok(Response {
            status: reply
                .get("status")
                .and_then(Value::as_u64)
                .and_then(|n| u16::try_from(n).ok())
                .ok_or(Error::new("driver_failed"))?,
            body: reply.get("body").cloned().unwrap_or(Value::Null),
        })
    }
}
fn string<'a>(input: &'a Value, key: &str) -> Result<&'a str> {
    input
        .get(key)
        .and_then(Value::as_str)
        .ok_or(Error::new("driver_failed"))
}
/// Driver requests require an explicit disposable directory marker and a local
/// synthetic registration. The marker is made by the controlling test harness.
pub fn run() -> Result<()> {
    let input = Arc::new(Mutex::new(BufReader::new(std::io::stdin())));
    let args = receive(&input)?;
    let home = PathBuf::from(string(&args, "home")?);
    if std::fs::read(home.join(".grida-auth-conformance"))
        .ok()
        .as_deref()
        != Some(b"synthetic-fixture-only\n")
    {
        return Err(Error::new("driver_failed"));
    }
    let result = operation(&input, &args, home);
    emit(match result {
        Ok(result) => json!({"ok":true,"result":result}),
        Err(error) => json!({"ok":false,"code":error.code()}),
    })
}
fn operation(input: &Input, args: &Value, home: PathBuf) -> Result<Value> {
    let operation = string(args, "operation")?;
    if operation.starts_with("keyring-") {
        use crate::keyring::{Keyring, NativeKeyring};
        let service = string(args, "service")?;
        let suffix = service
            .strip_prefix("Grida Rust CLI conformance ")
            .ok_or(Error::new("driver_failed"))?;
        uuid::Uuid::parse_str(suffix).map_err(|_| Error::new("driver_failed"))?;
        let account = "synthetic-fixture";
        let keyring = NativeKeyring;
        return match operation {
            "keyring-read" => Ok(json!(keyring.read(service, account)?)),
            "keyring-write" => {
                let value = string(args, "value")?;
                if !value.starts_with("synthetic-") {
                    return Err(Error::new("driver_failed"));
                }
                keyring.write(service, account, value)?;
                Ok(Value::Null)
            }
            _ => Err(Error::new("driver_failed")),
        };
    }
    if operation.starts_with("provider-") {
        let store = ProviderStore::new(home)?;
        return match operation {
            "provider-set" => {
                store.set(string(args, "provider")?, string(args, "key")?)?;
                Ok(Value::Null)
            }
            "provider-read" => Ok(json!(store.read(string(args, "provider")?)?)),
            "provider-list" => Ok(json!(store.list()?)),
            "provider-remove" => {
                store.remove(string(args, "provider")?)?;
                Ok(Value::Null)
            }
            "provider-migrate" => {
                let entries: Vec<(String, String)> =
                    serde_json::from_value(args.get("entries").cloned().unwrap_or(json!([])))
                        .map_err(|_| Error::new("driver_failed"))?;
                store.migrate(
                    || {
                        emit(json!({"event":"source-read"}))?;
                        Ok(entries)
                    },
                    || {
                        emit(json!({"event":"retire"}))?;
                        if receive(input)?.get("ok") == Some(&json!(true)) {
                            Ok(())
                        } else {
                            Err(Error::new("migration_failed"))
                        }
                    },
                )?;
                Ok(Value::Null)
            }
            _ => Err(Error::new("driver_failed")),
        };
    }
    if operation == "lock" {
        return native::locked(&home.join("providers"), || {
            emit(json!({"event":"locked"}))?;
            receive(input)?;
            Ok(Value::Null)
        });
    }
    let config: Config = serde_json::from_value(
        args.get("config")
            .cloned()
            .ok_or(Error::new("driver_failed"))?,
    )
    .map_err(|_| Error::new("driver_failed"))?;
    if !config.issuer.starts_with("http://127.0.0.1:")
        || !config.api_origin.starts_with("http://127.0.0.1:")
        || !config.client_id.starts_with("synthetic-")
    {
        return Err(Error::new("driver_failed"));
    }
    let storage = match args.get("storage").and_then(Value::as_str) {
        None | Some("file") => Backend::File,
        Some("keyring") => Backend::Keyring,
        _ => return Err(Error::new("driver_failed")),
    };
    if operation == "seed" || operation == "snapshot" {
        let store = Store::open(&config, home, Some(storage))?;
        return store.exclusive(|tx| {
            if operation == "seed" {
                let session: Session = serde_json::from_value(
                    args.get("session")
                        .cloned()
                        .ok_or(Error::new("driver_failed"))?,
                )
                .map_err(|_| Error::new("driver_failed"))?;
                if !session.identity.id.starts_with("synthetic-") {
                    return Err(Error::new("driver_failed"));
                }
                tx.write(Some(session))?;
            }
            serde_json::to_value(tx.read()?).map_err(|_| Error::new("driver_failed"))
        });
    }
    let client = AuthClient::open(config, home, Some(storage), Arc::new(Script(input.clone())))?;
    match operation {
        "status" => Ok(json!(client.status()?)),
        "refresh" => Ok(json!(client.refresh()?)),
        "verify" => Ok(json!(client.verify()?)),
        "logout" => Ok(json!(client.logout()?)),
        "storage-info" => Ok(json!(client.storage_info()?)),
        _ => Err(Error::new("driver_failed")),
    }
}
