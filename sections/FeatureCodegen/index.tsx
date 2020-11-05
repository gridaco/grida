import { Link } from '@material-ui/core';
import React from 'react';
import { Text } from '../../components';
import { featureCodegenContents } from './toolkit';

// @ts-ignore
import styles from './index.module.scss';
// @ts-ignore
import home from '../../styles/Home.module.scss';

const FeatureCodegen = () => {
  return (
    <>
      <div className={home.inner_container}>
        <div>
          <Text
            className={styles.title}
            variant="h1"
            algin="left"
            value={featureCodegenContents.title()}
          />
        </div>
        <div className={styles.sub_title_box}>
          <Text
            algin="left"
            variant="h6"
            className={styles.sub_title_first}
            value={featureCodegenContents.subTitleFirst()}
          />
          <Text
            algin="left"
            variant="h5"
            className={styles.sub_title_second}
            value={featureCodegenContents.subTitleSecond()}
          />
        </div>
        <div className={styles.link}>
          <Link href="/" style={{ color: '#463F95' }}>
            <Text algin="left" variant="h5" value="Learn more how it works" />
          </Link>
        </div>
      </div>
    </>
  );
};

export default FeatureCodegen;
