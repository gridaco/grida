use crate::io::io_grida;
use json_patch::{Patch, PatchOperation};
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct TransactionApplyReport {
    pub success: bool,
    pub applied: usize,
    pub total: usize,
    pub error: Option<String>,
}

#[derive(Debug)]
pub struct ApplyTransactionsOutcome {
    pub document: Value,
    pub reports: Vec<TransactionApplyReport>,
    pub scene_file: Option<io_grida::JSONCanvasFile>,
}

pub fn apply_transactions(
    current_document: Value,
    transactions: Vec<Vec<Value>>,
) -> ApplyTransactionsOutcome {
    let mut document = current_document;
    let mut reports = Vec::with_capacity(transactions.len());
    let mut last_valid_file: Option<io_grida::JSONCanvasFile> = None;

    for transaction in transactions {
        let total_ops = transaction.len();

        if total_ops == 0 {
            reports.push(TransactionApplyReport {
                success: true,
                applied: 0,
                total: 0,
                error: None,
            });
            continue;
        }

        let mut operations = Vec::with_capacity(total_ops);
        let mut parse_error: Option<(usize, String)> = None;

        for (idx, op_value) in transaction.iter().enumerate() {
            match serde_json::from_value::<PatchOperation>(op_value.clone()) {
                Ok(op) => operations.push(op),
                Err(err) => {
                    parse_error = Some((idx, err.to_string()));
                    break;
                }
            }
        }

        if let Some((idx, error)) = parse_error {
            reports.push(TransactionApplyReport {
                success: false,
                applied: idx,
                total: total_ops,
                error: Some(error),
            });
            continue;
        }

        let mut working = document.clone();
        let mut applied = 0usize;
        let mut apply_error: Option<String> = None;

        for op in operations.iter() {
            let patch = Patch(vec![op.clone()]);
            if let Err(err) = json_patch::patch(&mut working, &patch) {
                apply_error = Some(err.to_string());
                break;
            }
            applied += 1;
        }

        if let Some(error) = apply_error {
            reports.push(TransactionApplyReport {
                success: false,
                applied,
                total: total_ops,
                error: Some(error),
            });
            continue;
        }

        match serde_json::from_value::<io_grida::JSONCanvasFile>(working.clone()) {
            Ok(file) => {
                document = working;
                last_valid_file = Some(file);
                reports.push(TransactionApplyReport {
                    success: true,
                    applied,
                    total: total_ops,
                    error: None,
                });
            }
            Err(err) => {
                reports.push(TransactionApplyReport {
                    success: false,
                    applied,
                    total: total_ops,
                    error: Some(err.to_string()),
                });
            }
        }
    }

    ApplyTransactionsOutcome {
        document,
        reports,
        scene_file: last_valid_file,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_document() -> Value {
        json!({
            "version": "0.0.1",
            "document": {
                "bitmaps": {},
                "properties": {},
                "nodes": {
                    "scene": {
                        "id": "scene",
                        "name": "Scene",
                        "type": "scene",
                        "active": true,
                        "locked": false,
                        "backgroundColor": null,
                        "guides": [],
                        "edges": [],
                        "constraints": {"children": "multiple"}
                    }
                },
                "links": {
                    "scene": []
                },
                "scenes_ref": ["scene"],
                "entry_scene_id": "scene"
            }
        })
    }

    #[test]
    fn applies_successful_transaction() {
        let doc = make_document();
        let transactions = vec![vec![json!({
            "op": "replace",
            "path": "/document/nodes/scene/name",
            "value": "Renamed"
        })]];

        let outcome = apply_transactions(doc, transactions);
        assert_eq!(outcome.reports.len(), 1);
        assert_eq!(
            outcome.reports[0],
            TransactionApplyReport {
                success: true,
                applied: 1,
                total: 1,
                error: None,
            }
        );
        assert_eq!(
            outcome.document["document"]["nodes"]["scene"]["name"],
            json!("Renamed")
        );
        assert!(outcome.scene_file.is_some());
    }

    #[test]
    fn continues_after_failed_transaction() {
        let doc = make_document();
        let transactions = vec![
            vec![json!({
                "op": "replace",
                "path": "/document/nodes/scene/does_not_exist",
                "value": 1
            })],
            vec![json!({
                "op": "replace",
                "path": "/document/nodes/scene/name",
                "value": "Next"
            })],
        ];

        let outcome = apply_transactions(doc, transactions);
        assert_eq!(outcome.reports.len(), 2);
        assert!(!outcome.reports[0].success);
        assert!(outcome.reports[1].success);
        assert_eq!(
            outcome.document["document"]["nodes"]["scene"]["name"],
            json!("Next")
        );
    }
}
