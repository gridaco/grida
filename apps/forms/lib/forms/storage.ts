/**
 * UniqueFileNameGenerator is a helper class designed to ensure unique file names
 * within a specified base path. It is particularly useful in scenarios where
 * multiple files might have the same name and need to be stored in the same directory.
 *
 * @example
 * const generator = new UniqueFileNameGenerator();
 * const uniqueFileName = generator.name('file.png', '/path/to/directory/');
 * console.log(uniqueFileName); // Outputs: file.png, file(1).png, file(2).png, etc.
 */
export class UniqueFileNameGenerator {
  private fileNames: Set<string>;

  /**
   * Constructs a new UniqueFileNameGenerator.
   */
  constructor() {
    this.fileNames = new Set<string>();
  }

  /**
   * Generates a unique file name by appending a counter to the original file name if necessary.
   *
   * @param filename - The original name of the file.
   * @param basepath - The base path where the file will be stored.
   * @returns A unique file name that does not conflict with existing file names in the base path.
   */
  name(filename: string, basepath: string = ""): string {
    filename = sanitizeFileName(filename);

    let uniqueFileName = filename;
    let counter = 1;

    while (this.fileNames.has(basepath + uniqueFileName)) {
      const extension = filename.substring(filename.lastIndexOf("."));
      const nameWithoutExtension = filename.substring(
        0,
        filename.lastIndexOf(".")
      );
      uniqueFileName = `${nameWithoutExtension}(${counter})${extension}`;
      uniqueFileName = isValidKey(uniqueFileName)
        ? uniqueFileName
        : sanitizeFileName(uniqueFileName);
      counter++;
    }

    this.fileNames.add(basepath + uniqueFileName);
    return uniqueFileName;
  }
}

/**
 * Sanitizes a file name to ensure it only contains S3 safe characters.
 *
 * @param key - The file name to sanitize.
 * @returns A sanitized file name.
 */
export function sanitizeFileName(key: string, sep: "-" | "_" = "-"): string {
  // Replace invalid characters with underscores or another safe character
  return key.replace(/[^\w\/!-.()*' &@$=;:+,?]/g, sep);
}

export function isValidKey(key: string): boolean {
  // only allow s3 safe characters and characters which require special handling for now
  // https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html
  return /^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/.test(key);
}
