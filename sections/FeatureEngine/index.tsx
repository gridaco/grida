import { Link } from '@material-ui/core';
import React from 'react';
import { Text } from '../../components';
// @ts-ignore
import featureEngineGraphic from '../../images/feature_engine_graphic.svg';
// @ts-ignore
import styles from './index.module.scss';
import { featureEngineContents } from './toolkit';

const FeatureEngine = () => {
  return (
    <>
      <div>
        <Text value={featureEngineContents.title()} />
      </div>
      <div className={styles.sub_title}>
        <Text value={featureEngineContents.subTitleFirst()} />
        <Text value={featureEngineContents.subTitleSecond()} />
      </div>
      <div>
        <Link href="/" style={{ color: '#463F95' }}>
          <Text algin="left" variant="h5" value="Learn more about engine" />
        </Link>
      </div>
      <div>
        <img src={featureEngineGraphic} />
      </div>
    </>
  );
};

export default FeatureEngine;
