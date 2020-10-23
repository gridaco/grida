import React from 'react';
import { Text } from '../../components';
import { featureLintContents } from './toolkit';
// @ts-ignore
import { videoTestImage } from '../../images/feature_lint_video_image.svg';

const FeatureLint = () => {
  return (
    <>
      <div>
        <Text value={featureLintContents.title()} />
        <Text value={featureLintContents.subTitle()} />
      </div>
      <div>
        <img src={videoTestImage} />
      </div>
    </>
  );
};

export default FeatureLint;
