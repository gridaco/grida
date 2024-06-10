interface UniqueFileNameGeneratorConfig {
  rejectComma?: boolean;
}

export class UniqueFileNameGenerator {
  private fileNames: Set<string>;
  private config: UniqueFileNameGeneratorConfig;

  /**
   * Constructs a new UniqueFileNameGenerator.
   *
   * @param seed - A set of existing file names to initialize the generator with.
   * @param config - Configuration options for the generator.
   */
  constructor(seed?: Set<string>, config?: UniqueFileNameGeneratorConfig) {
    this.fileNames = seed ?? new Set<string>();
    this.config = config ?? {};
  }

  /**
   * Generates a unique file name by appending a counter to the original file name if necessary.
   *
   * @param filename - The original name of the file.
   * @param basepath - The base path where the file will be stored.
   * @returns A unique file name that does not conflict with existing file names in the base path.
   */
  name(filename: string, basepath: string = ""): string {
    filename = this.sanitizeFileName(filename);

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
        : this.sanitizeFileName(uniqueFileName);
      counter++;
    }

    this.fileNames.add(basepath + uniqueFileName);
    return uniqueFileName;
  }

  seed(seed: Set<string>) {
    this.fileNames = seed;
  }

  /**
   * Sanitizes a file name to ensure it only contains S3 safe characters and
   * replaces commas if the rejectComma config is set to true.
   *
   * @param key - The file name to sanitize.
   * @returns A sanitized file name.
   */
  private sanitizeFileName(key: string): string {
    if (this.config.rejectComma) {
      key = key.replace(/,/g, "-"); // Replace commas with the specified separator
    }
    return sanitizeKey(key);
  }
}

/**
 * Sanitizes a file name to ensure it only contains S3 safe characters.
 *
 * @param key - The file name to sanitize.
 * @returns A sanitized file name.
 */
export function sanitizeKey(key: string, sep: "-" | "_" = "-"): string {
  // Replace invalid characters with underscores or another safe character
  return key.replace(/[^\w\/!-.()*' &@$=;:+,?]/g, sep);
}

export function isValidKey(key: string): boolean {
  // only allow s3 safe characters and characters which require special handling for now
  // https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html
  return /^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/.test(key);
}
