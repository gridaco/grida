import { Link } from '@material-ui/core';
import React from 'react';
import { Text } from '../../components';
// @ts-ignore
import featureEngineGraphic from '../../images/feature_engine_graphic.svg';
// @ts-ignore
import styles from './index.module.scss';
// @ts-ignore
import home from '../../styles/Home.module.css';
import { featureEngineContents } from './toolkit';

const FeatureEngine = () => {
  return (
    <>
      <div className={home.inner_container}>
        <div>
          <Text
            variant="h1"
            className={styles.title}
            value={featureEngineContents.title()}
          />
        </div>
        <div className={styles.sub_title_box}>
          <Text
            className={styles.sub_title}
            value={featureEngineContents.subTitleFirst()}
          />
          <Text
            className={styles.sub_title}
            style={{ marginTop: '40px' }}
            value={featureEngineContents.subTitleSecond()}
          />
        </div>
        <div>
          <Link href="/" style={{ color: '#463F95' }}>
            <Text algin="left" variant="h5" value="Learn more about engine" />
          </Link>
        </div>
      </div>
      <div>
        <img src={featureEngineGraphic} />
      </div>
    </>
  );
};

export default FeatureEngine;
