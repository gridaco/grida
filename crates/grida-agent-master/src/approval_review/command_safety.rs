//! Identifies shell operations that require review even inside a writable
//! workspace. A missing literal match supplies no evidence that a script is safe.

use tree_sitter::{Node, Parser};

const MAX_WRAPPER_DEPTH: usize = 8;

/// Inspect shell source without expanding variables, running substitutions, or
/// depending on the application's command presentation.
pub fn requires_command_review(script: &str) -> bool {
    let mut parser = Parser::new();
    if parser
        .set_language(&tree_sitter_bash::LANGUAGE.into())
        .is_err()
    {
        return true;
    }
    script_requires_review(&mut parser, script, 0)
}

fn script_requires_review(parser: &mut Parser, script: &str, depth: usize) -> bool {
    if depth > MAX_WRAPPER_DEPTH {
        return true;
    }
    let Some(tree) = parser.parse(script, None) else {
        return true;
    };
    let root = tree.root_node();
    if root.has_error() {
        return false;
    }

    let mut nodes = vec![root];
    while let Some(node) = nodes.pop() {
        if node.kind() == "command"
            && let Some(words) = command_words(node, script)
            && words_require_review(parser, &words, depth)
        {
            return true;
        }
        nodes.extend(node.named_children(&mut node.walk()));
    }
    false
}

/// The executable must be literal. Only statically known arguments participate
/// in identifying a force option. The full original script goes to the reviewer.
fn command_words(command: Node<'_>, script: &str) -> Option<Vec<String>> {
    let mut cursor = command.walk();
    let mut children = command.named_children(&mut cursor);
    let name = children.find(|node| node.kind() == "command_name")?;
    let mut words = vec![literal_word(name.named_child(0)?, script)?];
    words.extend(children.filter_map(|node| literal_word(node, script)));
    Some(words)
}

fn literal_word(node: Node<'_>, script: &str) -> Option<String> {
    let raw = node.utf8_text(script.as_bytes()).ok()?;
    match node.kind() {
        "word" | "number"
            if node.named_child_count() == 0
                && !raw.starts_with('=')
                && !raw.contains(['{', '}', '*', '?', '[', ']', '\\', '~', '^', '#', '$', '`']) =>
        {
            Some(raw.to_owned())
        }
        "raw_string" => Some(raw.strip_prefix('\'')?.strip_suffix('\'')?.to_owned()),
        "string" => {
            let content = raw.strip_prefix('"')?.strip_suffix('"')?;
            let literal = node
                .named_children(&mut node.walk())
                .all(|part| part.kind() == "string_content")
                && !content.as_bytes().windows(2).any(|pair| {
                    pair[0] == b'\\' && matches!(pair[1], b'$' | b'`' | b'"' | b'\\' | b'\n')
                });
            literal.then(|| content.to_owned())
        }
        "concatenation" => node
            .named_children(&mut node.walk())
            .map(|part| literal_word(part, script))
            .collect(),
        _ => None,
    }
}

fn words_require_review(parser: &mut Parser, words: &[String], depth: usize) -> bool {
    if depth > MAX_WRAPPER_DEPTH {
        return true;
    }
    let Some((program, args)) = words.split_first() else {
        return false;
    };
    match program.rsplit('/').next() {
        Some("rm") => args
            .iter()
            .take_while(|arg| arg.as_str() != "--")
            .any(|arg| {
                arg == "--force"
                    || arg
                        .strip_prefix('-')
                        .is_some_and(|flags| !flags.starts_with('-') && flags.contains('f'))
            }),
        Some("sudo") => words_require_review(parser, args, depth + 1),
        Some("env") => {
            let args = args
                .iter()
                .position(|arg| {
                    !matches!(arg.as_str(), "-i" | "--ignore-environment")
                        && !arg
                            .split_once('=')
                            .is_some_and(|(name, _)| !name.is_empty() && !name.starts_with('-'))
                })
                .map_or(&[][..], |start| &args[start..]);
            let args = if args.first().is_some_and(|arg| arg == "--") {
                &args[1..]
            } else {
                args
            };
            words_require_review(parser, args, depth + 1)
        }
        Some("trap") => {
            let action = if args.first().is_some_and(|arg| arg == "--") {
                args.get(1)
            } else {
                args.first()
            };
            action.is_some_and(|action| {
                !action.starts_with('-') && script_requires_review(parser, action, depth + 1)
            })
        }
        Some("sh" | "bash" | "zsh" | "dash") => {
            matches!(args, [flag, script] if matches!(flag.as_str(), "-c" | "-lc") && script_requires_review(parser, script, depth + 1))
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn force_removal_is_reviewed_in_control_flow_wrappers_and_substitutions() {
        for script in [
            "rm -f scratch",
            "/bin/rm -fr scratch",
            "rm -r -f scratch",
            "rm scratch --force",
            "sudo rm -rf scratch",
            "env -i ITEM=scratch -- rm -f scratch",
            "if test -f scratch; then rm --force scratch; fi",
            "printf x | rm -rf scratch",
            "for item in scratch; do rm -rf \"$item\"; done",
            "echo \"$(rm -f scratch)\"",
            "bash -c 'rm -rf scratch'",
            "trap -- 'rm -rf scratch' EXIT",
            "r'm' -'f' scratch",
        ] {
            assert!(requires_command_review(script), "{script}");
        }
    }

    #[test]
    fn options_end_at_double_dash_and_quoted_examples_are_data() {
        for script in [
            "rm -r scratch",
            "rm -- -f",
            "printf '%s' 'rm -f scratch'",
            "if then rm -rf scratch",
            "trap 'echo rm -rf scratch' EXIT",
            "env ITEM=scratch rm -r scratch",
            "printf x > scratch",
        ] {
            assert!(!requires_command_review(script), "{script}");
        }
    }

    #[test]
    fn excessive_wrapper_nesting_requires_a_review() {
        let allowed_depth = "env ".repeat(MAX_WRAPPER_DEPTH);
        assert!(!requires_command_review(&format!("{allowed_depth}pwd")));
        assert!(requires_command_review(&format!("env {allowed_depth}pwd")));
    }
}
