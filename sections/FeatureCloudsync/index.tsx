import React from 'react';
// @ts-ignore
import updateBtnWithPhone from '../../images/update_btn_with_phone.svg';
// @ts-ignore
import styles from './index.module.scss';
import { featureCloudSyncContents } from './toolkit';
import { Text } from '../../components';

const FeatureCloudSync = () => {
  return (
    <>
      <div className={styles.container}>
        <Text value={featureCloudSyncContents.title} />
      </div>
      <div className={styles.container} style={{ color: '#fff' }}>
        <Text algin="left" value={featureCloudSyncContents.subTitleFirst} />
        <Text algin="left" value={featureCloudSyncContents.subTitleSeconde} />
      </div>
      <div>
        <img src={updateBtnWithPhone} />
      </div>
    </>
  );
};

export default FeatureCloudSync;
