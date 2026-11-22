//! Describe a small subset of shell exploration commands for client activity.

use agent_kit_core::messages::{ToolArguments, ToolCall};
use serde::Serialize;

use crate::processes::EXEC_COMMAND;

const MAX_COMMAND_BYTES: usize = 4 * 1024;
const MAX_FIELD_BYTES: usize = 1024;
const MAX_ACTIONS: usize = 16;

/// A best-effort description of a requested command segment.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum CommandAction {
    Read {
        path: String,
    },
    ListFiles {
        #[serde(skip_serializing_if = "Option::is_none")]
        path: Option<String>,
        #[serde(skip_serializing_if = "std::ops::Not::not")]
        piped: bool,
    },
    Search {
        query: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        path: Option<String>,
        #[serde(skip_serializing_if = "std::ops::Not::not")]
        piped: bool,
    },
}

pub(crate) fn for_call(call: &ToolCall) -> Option<Vec<CommandAction>> {
    if call.tool.as_str() != EXEC_COMMAND {
        return None;
    }
    let ToolArguments::Json(arguments) = &call.arguments else {
        return None;
    };
    classify(arguments.get("cmd")?.as_str()?)
}

fn classify(command: &str) -> Option<Vec<CommandAction>> {
    let tokens = tokenize(command)?;
    let mut actions = Vec::new();
    for statement in tokens.split(|token| matches!(token, Token::Sequence)) {
        if actions.len() == MAX_ACTIONS {
            return None;
        }
        let mut pipeline = statement.split(|token| matches!(token, Token::Pipe));
        let mut action = classify_words(&words(pipeline.next()?)?)?;
        if let Some(tail) = pipeline.next() {
            if !is_head_filter(&words(tail)?) || pipeline.next().is_some() {
                return None;
            }
            match &mut action {
                CommandAction::Read { .. } => return None,
                CommandAction::ListFiles { piped, .. } | CommandAction::Search { piped, .. } => {
                    *piped = true;
                }
            }
        }
        actions.push(action);
    }
    Some(actions)
}

enum Token {
    Word(String),
    Sequence,
    Pipe,
}

/// Decode literal shell words and the supported operators without expansion.
fn tokenize(command: &str) -> Option<Vec<Token>> {
    if command.len() > MAX_COMMAND_BYTES || command.chars().any(|ch| ch.is_control() && ch != '\t')
    {
        return None;
    }
    let mut tokens = Vec::new();
    let mut word: Option<String> = None;
    let mut chars = command.chars().peekable();
    while let Some(ch) = chars.next() {
        let separator = match ch {
            ' ' | '\t' => None,
            ';' => Some(Token::Sequence),
            '&' if chars.next_if_eq(&'&').is_some() => Some(Token::Sequence),
            '|' if chars.peek() != Some(&'|') => Some(Token::Pipe),
            '&' | '|' | '<' | '>' | '(' | ')' | '$' | '`' | '~' | '*' | '?' | '[' | ']' | '{'
            | '}' | '#' | '!' | '^' => return None,
            '=' if word.is_none() => return None,
            _ => {
                let word = word.get_or_insert_with(String::new);
                match ch {
                    '\'' | '"' => append_quoted(word, ch, &mut chars)?,
                    '\\' => word.push(chars.next()?),
                    _ => word.push(ch),
                }
                continue;
            }
        };
        tokens.extend(word.take().map(Token::Word));
        tokens.extend(separator);
    }
    tokens.extend(word.map(Token::Word));
    Some(tokens)
}

fn append_quoted(
    word: &mut String,
    quote: char,
    chars: &mut std::iter::Peekable<std::str::Chars<'_>>,
) -> Option<()> {
    while let Some(ch) = chars.next() {
        if ch == quote {
            return Some(());
        }
        if quote == '"' {
            match ch {
                '$' | '`' | '!' => return None,
                '\\' if matches!(chars.peek(), Some('"' | '$' | '`' | '\\')) => {
                    word.push(chars.next()?);
                    continue;
                }
                _ => {}
            }
        }
        word.push(ch);
    }
    None
}

fn words(tokens: &[Token]) -> Option<Vec<&str>> {
    tokens
        .iter()
        .map(|token| match token {
            Token::Word(word) => Some(word.as_str()),
            _ => None,
        })
        .collect()
}

fn classify_words(words: &[&str]) -> Option<CommandAction> {
    let (&command, operands) = words.split_first()?;
    match (command, operands) {
        ("cat" | "/bin/cat", [path]) if !path.starts_with('-') => read(path),
        ("cat" | "/bin/cat", ["--", path]) => read(path),
        ("sed" | "/usr/bin/sed", ["-n", script, path])
            if is_print_range(script) && !path.starts_with('-') =>
        {
            read(path)
        }
        ("rg", _) => rg(operands),
        ("ls" | "/bin/ls", _) => list(operands),
        _ => None,
    }
}

fn read(path: &str) -> Option<CommandAction> {
    Some(CommandAction::Read {
        path: display_path(path)?,
    })
}

fn list(mut operands: &[&str]) -> Option<CommandAction> {
    while let Some((&flag, rest)) = operands.split_first() {
        if flag == "--" {
            operands = rest;
            break;
        }
        if !flag.starts_with('-') {
            break;
        }
        if !short_flags(flag, "1aAhl") {
            return None;
        }
        operands = rest;
    }
    let path = optional_path(operands)?;
    Some(CommandAction::ListFiles { path, piped: false })
}

fn rg(mut operands: &[&str]) -> Option<CommandAction> {
    let mut list_files = false;
    while let Some((&flag, rest)) = operands.split_first() {
        match flag {
            "--" => return rg_positional(rest, list_files),
            "--files" if !list_files => list_files = true,
            "-g" | "--glob" | "-t" | "--type" => {
                let (&value, remaining) = rest.split_first()?;
                if value.is_empty() || value.starts_with('-') {
                    return None;
                }
                operands = remaining;
                continue;
            }
            "--hidden"
            | "--no-ignore"
            | "--line-number"
            | "--fixed-strings"
            | "--ignore-case"
            | "--smart-case"
            | "--files-with-matches" => {}
            _ if short_flags(flag, "niFSl") => {}
            _ if flag.starts_with('-') => return None,
            _ => {
                if rest.iter().any(|word| word.starts_with('-')) {
                    return None;
                }
                break;
            }
        }
        operands = rest;
    }
    rg_positional(operands, list_files)
}

fn rg_positional(operands: &[&str], list_files: bool) -> Option<CommandAction> {
    if list_files {
        let path = optional_path(operands)?;
        Some(CommandAction::ListFiles { path, piped: false })
    } else {
        let (&query, paths) = operands.split_first()?;
        let query = field(query)?;
        let path = optional_path(paths)?;
        Some(CommandAction::Search {
            query,
            path,
            piped: false,
        })
    }
}

fn optional_path(operands: &[&str]) -> Option<Option<String>> {
    match operands {
        [] => Some(None),
        [path] => Some(Some(display_path(path)?)),
        _ => None,
    }
}

fn display_path(path: &str) -> Option<String> {
    (path != "-").then_some(())?;
    field(path)
}

fn field(value: &str) -> Option<String> {
    (!value.is_empty() && value.len() <= MAX_FIELD_BYTES && !value.chars().any(char::is_control))
        .then(|| value.to_owned())
}

fn short_flags(flag: &str, allowed: &str) -> bool {
    flag.strip_prefix('-')
        .is_some_and(|flags| !flags.is_empty() && flags.chars().all(|ch| allowed.contains(ch)))
}

fn is_print_range(script: &str) -> bool {
    let Some(address) = script.strip_suffix('p') else {
        return false;
    };
    match address.split_once(',') {
        Some((first, last)) => is_line_number(first) && (is_line_number(last) || last == "$"),
        None => is_line_number(address) || address == "$",
    }
}

fn is_head_filter(words: &[&str]) -> bool {
    match words {
        ["head" | "/usr/bin/head"] => true,
        ["head" | "/usr/bin/head", "-n", lines] => is_line_number(lines),
        _ => false,
    }
}

fn is_line_number(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::{CommandAction, classify, for_call};
    use agent_kit_core::messages::{ToolArguments, ToolCall};
    use agent_kit_core::{ToolCallId, ToolId};
    use serde_json::json;

    fn actions(command: &str) -> serde_json::Value {
        serde_json::to_value(classify(command)).unwrap()
    }

    #[test]
    fn only_shell_calls_supply_actions() {
        let mut call = ToolCall {
            id: ToolCallId::new("call-1").unwrap(),
            tool: ToolId::new("exec_command").unwrap(),
            arguments: ToolArguments::Json(json!({ "cmd": "/bin/cat README.md" })),
        };
        assert_eq!(
            for_call(&call),
            Some(vec![CommandAction::Read {
                path: "README.md".into()
            }])
        );
        call.tool = ToolId::new("write_stdin").unwrap();
        assert_eq!(for_call(&call), None);
    }

    #[test]
    fn describes_common_workspace_exploration() {
        assert_eq!(
            actions("cat README.md"),
            json!([{"kind": "read", "path": "README.md"}])
        );
        assert_eq!(
            actions("sed -n '1,80p' README.md"),
            json!([{"kind": "read", "path": "README.md"}])
        );
        assert_eq!(
            actions("rg TODO src"),
            json!([{"kind": "search", "query": "TODO", "path": "src"}])
        );
        assert_eq!(
            actions("rg --files src | head -n 20"),
            json!([{"kind": "list_files", "path": "src", "piped": true}])
        );
        assert_eq!(actions("ls -la"), json!([{"kind": "list_files"}]));
    }

    #[test]
    fn preserves_order_and_decodes_literal_arguments() {
        assert_eq!(
            actions(r#"cat "a b.txt" && rg -n -g '*.rs' 'a | b' 'source files'; ls -- -assets"#),
            json!([
                {"kind": "read", "path": "a b.txt"},
                {"kind": "search", "query": "a | b", "path": "source files"},
                {"kind": "list_files", "path": "-assets"}
            ])
        );
        assert_eq!(
            classify(r#"cat 'a$b'"c d".txt"#),
            Some(vec![CommandAction::Read {
                path: "a$bc d.txt".into()
            }])
        );
        assert_eq!(
            actions(r#"rg 'fn (main|start)\b' src"#),
            json!([{"kind": "search", "query": r"fn (main|start)\b", "path": "src"}])
        );
        assert_eq!(
            actions(r#"cat "a\$b.txt"; rg -- -literal"#),
            json!([
                {"kind": "read", "path": "a$b.txt"},
                {"kind": "search", "query": "-literal"}
            ])
        );
    }

    #[test]
    fn falls_back_for_mixed_or_ambiguous_commands() {
        for command in [
            "rg TODO src && pnpm test",
            "rg TODO src | head -n 20 file",
            "rg --files src | head -n 20 && git status",
            "cat README.md | rg TODO",
            "cat a.txt > b.txt",
            "cat README.md &",
            "cat README.md || ls",
            "cat README.md &&",
            "cat README.md src.md",
            "cat -- -",
            "cat ''",
            r#"cat "unterminated"#,
            "rg --replace x old src",
            "rg --files a b",
            "rg TODO -",
            "rg -g",
            "sed -n '1e' README.md",
            "sed -n '1p;w output' README.md",
            "sed -in '1p' README.md",
            "ls --help",
        ] {
            assert_eq!(classify(command), None, "{command}");
        }
    }

    #[test]
    fn falls_back_for_shell_expansions_and_compound_syntax() {
        for command in [
            "cat \"$HOME/readme.txt\"",
            "cat $(printf readme.txt)",
            "cat `printf readme.txt`",
            "cat ~/readme.txt",
            "cat README.*",
            "ls src/{a,b}",
            "(cat README.md)",
            "cat <(printf readme)",
            "cat README.md\nls src",
            "cat README.md # read",
            "LC_ALL=C rg TODO src",
            "cat README.md\0",
        ] {
            assert_eq!(classify(command), None, "{command:?}");
        }
    }

    #[test]
    fn bounds_paths_queries_and_action_count() {
        let max_path = "é".repeat(512);
        assert!(classify(&format!("cat {max_path}")).is_some());
        assert_eq!(classify(&format!("cat {max_path}x")), None);
        assert_eq!(classify(&format!("rg {max_path}x src")), None);
        assert_eq!(classify(&format!("ls{}", " ".repeat(4096))), None);
        assert_eq!(classify(&["ls"; 16].join("; ")).unwrap().len(), 16);
        assert_eq!(classify(&["ls"; 17].join("; ")), None);
    }
}
