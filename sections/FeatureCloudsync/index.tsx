import React from 'react';
// @ts-ignore
import featureCloudsyncTitle from '../../images/feature_cloudsync_title.svg';
// @ts-ignore
import updateBtnWithPhone from '../../images/update_btn_with_phone.svg';
// @ts-ignore
import styles from './index.module.scss';

import { Text } from '../../components';

const FeatureCloudsync = () => {
  return (
    <>
      <div className={styles.container}>
        <img src={featureCloudsyncTitle} />
      </div>
      <div className={styles.container} style={{ color: '#fff' }}>
        <Text algin="left" value="Your design is your server" />
        <Text
          algin="left"
          value="“Micro-manage your contents.” <br/> Sometimes you need to go live immidiately. <br/> With our own logics, sync and <br/> manage content directly where your deisngs are at."
        />
      </div>
      <div>
        <img src={updateBtnWithPhone} />
      </div>
    </>
  );
};

export default FeatureCloudsync;
