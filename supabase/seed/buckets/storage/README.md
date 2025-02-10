# Bucket: `storage`

The "Girda Storage" bucket is user friendly storage wrapper around the supabase storage. It provides a simple way to upload, download, share files from the storage.

## Design
- `storage` bucket is a private bucket, namespaced by the virtual bucket.
- `storage-public` bucket is a public bucket, namespaced by the virtual bucket. (when user creates a public bucket)
- `perma` bucket is a public bucket, files are copied here for cdn and public access.

[Example]
- storage
  - `<root>`
    - folder-a
      - file-a
      - file-b
    - folder-b
      - file-c
      - file-d