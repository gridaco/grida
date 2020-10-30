import React from 'react';
// @ts-ignore
import styles from './index.module.scss';
// @ts-ignore
import home from '../../styles/Home.module.scss';
import { BRIDGED_COMMUNITY_FLUTTER } from '../../common/toolkit';
import { Text, CustomButton } from '../../components';
import { footerCtaContents } from './toolkit';
const FooterCta = () => {
  return (
    <>
      <div className={home.inner_container} style={{ marginBottom: '200px' }}>
        <div>
          <Text
            variant="h1"
            className={styles.title}
            value={footerCtaContents.title()}
          />
        </div>

        <div className={styles.sub_title_box}>
          <Text
            variant="h1"
            className={styles.sub_title}
            value={footerCtaContents.subTitle()}
          />
        </div>
        <div style={{ marginTop: '148px' }}>
          <CustomButton
            variant="contained"
            href={BRIDGED_COMMUNITY_FLUTTER}
            value="GET STARTED"
            type="default"
            className={home.btn}
          />
        </div>
      </div>
    </>
  );
};

export default FooterCta;
