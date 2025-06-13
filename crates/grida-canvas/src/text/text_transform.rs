use crate::node::schema::TextTransform;

/// Applies text transformation according to CSS text-transform property.
///
/// # Arguments
///
/// * `text` - The input text to transform
/// * `transform` - The transformation to apply
///
/// # Returns
///
/// The transformed text string
///
/// # Examples
///
/// ```ignore
/// use cg::schema::TextTransform;
/// use cg::text_transform::transform_text;
///
/// let text = "Hello World";
/// assert_eq!(transform_text(text, TextTransform::Uppercase), "HELLO WORLD");
/// assert_eq!(transform_text(text, TextTransform::Lowercase), "hello world");
/// assert_eq!(transform_text(text, TextTransform::Capitalize), "Hello World");
/// assert_eq!(transform_text(text, TextTransform::None), "Hello World");
/// ```
pub fn transform_text(text: &str, transform: TextTransform) -> String {
    match transform {
        TextTransform::None => text.to_string(),
        TextTransform::Uppercase => text.to_uppercase(),
        TextTransform::Lowercase => text.to_lowercase(),
        TextTransform::Capitalize => {
            let mut result = String::with_capacity(text.len());
            let mut capitalize_next = true;

            for c in text.chars() {
                if capitalize_next && c.is_alphabetic() {
                    result.push(c.to_uppercase().next().unwrap());
                    capitalize_next = false;
                } else {
                    result.push(c);
                    // Consider a word boundary to be any non-alphanumeric character
                    capitalize_next = !c.is_alphanumeric();
                }
            }
            result
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_none_transform() {
        let text = "Hello World";
        assert_eq!(transform_text(text, TextTransform::None), text);
    }

    #[test]
    fn test_uppercase_transform() {
        let text = "Hello World";
        assert_eq!(
            transform_text(text, TextTransform::Uppercase),
            "HELLO WORLD"
        );
    }

    #[test]
    fn test_lowercase_transform() {
        let text = "Hello World";
        assert_eq!(
            transform_text(text, TextTransform::Lowercase),
            "hello world"
        );
    }

    #[test]
    fn test_capitalize_transform() {
        let text = "hello world";
        assert_eq!(
            transform_text(text, TextTransform::Capitalize),
            "Hello World"
        );

        let text = "hello WORLD";
        assert_eq!(
            transform_text(text, TextTransform::Capitalize),
            "Hello WORLD"
        );

        let text = "hello  world";
        assert_eq!(
            transform_text(text, TextTransform::Capitalize),
            "Hello  World"
        );

        let text = "hello.world";
        assert_eq!(
            transform_text(text, TextTransform::Capitalize),
            "Hello.World"
        );

        let text = "hello.world.test";
        assert_eq!(
            transform_text(text, TextTransform::Capitalize),
            "Hello.World.Test"
        );

        let text = "hello-world";
        assert_eq!(
            transform_text(text, TextTransform::Capitalize),
            "Hello-World"
        );

        let text = "hello_world";
        assert_eq!(
            transform_text(text, TextTransform::Capitalize),
            "Hello_World"
        );
    }
}
