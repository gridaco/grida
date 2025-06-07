pub mod rest;

#[cfg(test)]
mod tests {
    use super::rest::*;
    use std::fs;

    #[test]
    fn test_deserialize_figma_response() {
        let json_str = fs::read_to_string("fixtures/766822741396935685.json")
            .expect("Failed to read test fixture");

        let response: GetFileResponse =
            serde_json::from_str(&json_str).expect("Failed to deserialize Figma response");

        // Test basic document structure
        assert_eq!(
            response.name,
            "Investor Pitch Presentation Template (Community)"
        );
        assert_eq!(response.document.base.name, "Document");
        assert_eq!(response.document.base.id, "0:0");
    }
}
