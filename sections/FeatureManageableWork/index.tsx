import React from 'react';
// @ts-ignore
import styles from './index.module.scss';
// @ts-ignore
import home from '../../styles/Home.module.scss';
// @ts-ignore
import featureCircular from '../../images/feature-circular.svg';
import { Text } from '../../components';
import { FeatureManageableWorkContents } from './toolkit';

const FeatureManageableWork = () => {
  return (
    <>
      <div className={home.inner_container}>
        <Text
          variant="h1"
          className={styles.title}
          value={FeatureManageableWorkContents.title()}
        />
        <div className={styles.subTitle_box}>
          <Text
            variant="h6"
            className={styles.subTitle}
            value={FeatureManageableWorkContents.subTitle()}
          />
        </div>
      </div>
      <img src={featureCircular} style={{ width: '100vw' }} />
    </>
  );
};

export default FeatureManageableWork;
