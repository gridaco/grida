import React from 'react';

// @ts-ignore
import home from '../../styles/Home.module.scss';
// @ts-ignore
import styles from './index.module.scss';

import { footerPunchlineContents } from './toolkit';
import { Text } from '../../components';
const FooterPunchline = () => {
  return (
    <>
      <div className={home.inner_container}>
        <div className={styles.title_box}>
          <Text
            className={styles.title}
            variant="h1"
            value={footerPunchlineContents.title()}
          />
        </div>
      </div>
    </>
  );
};

export default FooterPunchline;
