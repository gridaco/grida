import React from 'react';
// @ts-ignore
import updateBtnWithPhone from '../../images/update_btn_with_phone.svg';
// @ts-ignore
import styles from './index.module.scss';
// @ts-ignore
import home from '../../styles/Home.module.scss';
import { featureCloudSyncContents } from './toolkit';
import { Text } from '../../components';

const FeatureCloudSync = () => {
  return (
    <>
      <div className={home.inner_container}>
        <Text
          variant="h1"
          className={styles.title}
          value={featureCloudSyncContents.title()}
        />
      </div>
      <div className={home.inner_container} style={{ color: '#fff' }}>
        <Text
          algin="left"
          variant="h6"
          className={styles.sub_title}
          style={{ marginTop: '121px' }}
          value={featureCloudSyncContents.subTitleFirst()}
        />
        <Text
          algin="left"
          variant="h6"
          className={styles.sub_title}
          style={{ margin: '24px 0 79px 0x' }}
          value={featureCloudSyncContents.subTitleSecond()}
        />
      </div>
      <div>
        <img src={updateBtnWithPhone} style={{ width: '100vw' }}/>
      </div>
    </>
  );
};

export default FeatureCloudSync;
