import React from 'react';
import { Text } from '../../components';
import { featureInstantContents } from './toolkit';

// @ts-ignore
import featureInstantImg from '../../images/feature_instant_img.svg';

// @ts-ignore
import styles from './index.module.scss';
// @ts-ignore
import home from '../../styles/Home.module.scss';

const FeatureInstant = () => {
  return (
    <>
      <div className={home.inner_container}>
        <div>
          <Text
            variant="h1"
            className={styles.title}
            value={featureInstantContents.title()}
          />
        </div>
        <div className={styles.sub_title_box}>
          <Text
            variant="h3"
            className={styles.sub_title_first}
            value={featureInstantContents.subTitleFirst()}
          />
          <Text
            variant="h3"
            className={styles.sub_title_second}
            value={featureInstantContents.subTitleSecond()}
          />
        </div>
      </div>
      <div >
        <img src={featureInstantImg} style={{ width: '100vw' }}/>
      </div>
    </>
  );
};

export default FeatureInstant;
