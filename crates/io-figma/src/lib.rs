pub mod rest;

#[cfg(test)]
#[cfg(not(target_arch = "wasm32"))]
mod tests {
    use super::rest::*;
    use std::fs;
    use std::io::Read;
    use std::path::Path;
    use zip::ZipArchive;

    #[test]
    fn test_deserialize_figma_response() {
        let fixtures_dir = Path::new("fixtures");

        // Get all zip files in the fixtures directory
        let zip_files = fs::read_dir(fixtures_dir)
            .expect("Failed to read fixtures directory")
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let path = entry.path();
                if path.extension()? == "zip" {
                    Some(path)
                } else {
                    None
                }
            });

        for zip_path in zip_files {
            println!("Testing zip file: {:?}", zip_path);

            // Open and read the zip file
            let zip_file = fs::File::open(&zip_path).expect("Failed to open zip file");
            let mut archive = ZipArchive::new(zip_file).expect("Failed to read zip archive");

            // Get the directory name from the zip file name
            let dir_name = zip_path
                .file_stem()
                .expect("Failed to get zip file name")
                .to_str()
                .expect("Failed to convert zip file name to string");

            // Find and read the file.json from the zip
            let json_path = format!("{}/file.json", dir_name);
            let mut json_file = archive
                .by_name(&json_path)
                .expect("Failed to find file.json in zip");
            let mut json_str = String::new();
            json_file
                .read_to_string(&mut json_str)
                .expect("Failed to read file.json from zip");

            let response: GetFileResponse =
                serde_json::from_str(&json_str).expect("Failed to deserialize Figma response");

            // Test basic document structure
            assert_eq!(
                response.document.base.name, "Document",
                "Failed for zip file: {:?}",
                zip_path
            );
            assert_eq!(
                response.document.base.id, "0:0",
                "Failed for zip file: {:?}",
                zip_path
            );
        }
    }
}
