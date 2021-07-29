import * as dynamoose from 'dynamoose';

export interface ProjectRecord {
  /**
   * the db recird id of this project
   */
  id: string;

  /**
   * the name of this project set by editor
   */
  projectName: string;

  /**
   * the preview (cover) image set by eidtor, if non set, showing the default screen's perview, or bridged's default asset
   */
  previewImage: string;

  /**
   * last update of this project's asset / scene
   */
  updatedAt: Date;

  /**
   * the registration date of this project
   */
  createdAt: Date;

  /**
   * the default locale of this project, set as en_US by default
   */
  defaultLocale: string;

  /**
   * the available, supported locales of this project's assets.
   */
  locales: string[];

  /**
   * accessor name
   * name used for accessing configuration of this project by template syntax.
   * e.g. - BRIDGED -> so it can be reference on other projects like so,
   * "Hello ! {BRIDGED.SOME_SHARED_KEY}, great to use shared variables.")
   */
  accessorName: string;
}

const TABLE = process.env.DYNAMODB_TABLE;

export const SceneScheam = new dynamoose.Schema(
  {
    id: String,
    projectId: String,
    fileId: String,
    nodeId: String,
    sdkVersion: String,
    //DesignPlatformType
    designPlatform: {
      type: String,
      enum: [
        'com.figma.Desktop',
        'com.bohemiancoding.sketch3',
        'xyz.bridged.bridged',
      ],
    },
    cachedPreview: String,
    // SceneType
    sceneType: {
      type: String,
      enum: ['SCREEN', 'COMPONENT', 'DOCS'],
    },
    route: String,
    path: String,
    name: String,
    description: String,
    tags: {
      type: Set,
      schema: [String],
    },
    alias: String,
    variant: String,
    width: Number,
    height: Number,
    background: String,
  },
  {
    // https://github.com/dynamoose/dynamoose/pull/1050
    saveUnknown: true,
  },
);

export const Scene = dynamoose.model(TABLE, SceneScheam, {
  create: false,
});
