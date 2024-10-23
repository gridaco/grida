/**
 * Storage File Management
 */
export namespace FileIO {
  export type IFileIdentifier = {
    /**
     * path is used as identifier
     */
    path: string;
  };

  export type IResolvedFileRef = IFileIdentifier & {
    name?: string;
    type?: string;
  };

  /**
   * File alias for editable file input
   *
   * this is useful when changing a files, where newly selected and already uploaded files are mixed.
   *
   * to check if its an user selected file, use `file instanceof File`
   */
  export type VirtualFile<Virtual extends IResolvedFileRef> = File | Virtual;

  export type Asset = {
    url: string;
  };

  export type GridaStorageUploadResult = {
    /**
     * storage.objects.id
     */
    object_id: string;
    bucket: string;
    path: string;
    fullPath: string;
    publicUrl: string;
  };

  /**
   * direct uploader - uploads directly to resolved path
   */
  export type DirectFileUploaderFn = (
    file: File
  ) => Promise<GridaStorageUploadResult>;

  /**
   * staged uploader - uploads to tmp staged
   */
  export type StagedFileUploaderFn = (
    file: File
  ) => Promise<{ path: string; fullPath: string }>;

  /**
   * previewer for staged uploader
   */
  export type StagedFileResolverFn = (file: {
    path: string;
  }) => Promise<{ publicUrl: string } | null> | { publicUrl: string };

  /**
   * When the uploaded file is not a final file, but a temporary staged file which backend handler will move to the final path
   *
   * @example This is used when using a external storage or in Forms (form uploaded files are staged then, resolved when form is submitted)
   */
  export interface IStagedFileUploader {
    mode: "staged";
    uploader?: StagedFileUploaderFn;
    resolver?: StagedFileResolverFn;
  }

  /**
   * When the uploaded file is a final file
   *
   * @example used within the Editor
   */
  export interface IDirectFileUploader {
    mode: "direct";
    uploader: DirectFileUploaderFn;
  }

  export type IFileUploader = IStagedFileUploader | IDirectFileUploader;
}
