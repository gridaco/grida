import { Link } from '@material-ui/core';
import React from 'react';
import { Text } from '../../components';
import { featureCodegenContents } from './toolkit';

// @ts-ignore
import styles from './index.module.scss';

const FeatureCodegen = () => {
  return (
    <>
      <div>
        <Text
          className={styles.title}
          algin="left"
          value={featureCodegenContents.title()}
        />
      </div>
      <div className={styles.sub_title_box}>
        <Text
          algin="left"
          variant="h5"
          value={featureCodegenContents.subTitleFirst()}
        />
        <Text
          algin="left"
          variant="h5"
          value={featureCodegenContents.subTitleSeconde()}
        />
      </div>
      <div className={styles.link}>
        <Link href="/" style={{ color: '#463F95' }}>
          <Text algin="left" variant="h5" value="Learn more how it works" />
        </Link>
      </div>
    </>
  );
};

export default FeatureCodegen;
