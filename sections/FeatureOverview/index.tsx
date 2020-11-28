import React from 'react';
import { Text } from '../../components';
// @ts-ignore
import styles from './index.module.scss';
// @ts-ignore
import home from '../../styles/Home.module.scss';
// @ts-ignore
import codeBg from '../../images/code_background.svg';

import { featureOverviewContents } from './toolkit';

const FeatureOverview = () => {
  return (
    <>
      {/* <div style={{ width: '100vw' }}>
        <img src={codeBg} />
      </div> */}

      {/* <div className={styles.grid_container}></div> */}

      <div className={home.inner_container}>
        <Text
          className={styles.contents}
          algin="left"
          variant="h6"
          value={featureOverviewContents.content()}
        />
      </div>
    </>
  );
};

export default FeatureOverview;
