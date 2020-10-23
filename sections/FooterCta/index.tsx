import React from 'react';
// @ts-ignore
import styles from './index.module.scss';
// @ts-ignore
import home from '../../styles/Home.module.css';
import { Text, CustomButton } from '../../components';
import { footerCta } from './toolkit';
const FooterCta = () => {
  return (
    <>
      <div className={home.inner_container} style={{ marginBottom: '200px' }}>
        <div>
          <Text
            variant="h1"
            className={styles.title}
            value={footerCta.title()}
          />
        </div>

        <div className={styles.sub_title_box}>
          <Text
            variant="h1"
            className={styles.sub_title}
            value={footerCta.subTitle()}
          />
        </div>
        <div style={{ marginTop: '148px' }}>
          <CustomButton
            variant="contained"
            href=""
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
