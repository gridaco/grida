import { Typography } from '@material-ui/core';
import React from 'react';
import { CustomButton, Text } from '../../components';
// @ts-ignore
import styles from './index.module.scss';
// @ts-ignore
import home from '../../styles/Home.module.css';

import { BRIDGED_COMMUNITY_FLUTTER } from '../../common/toolkit';

import { heroContents } from './toolkit';

const Hero = () => {
  return (
    <>
      <div style={{ margin: '0 240px' }}>
        <Text
          algin="center"
          variant="h1"
          value={heroContents.title()}
          style={{  color: '#FFF' }}
        />
        <div className={styles.sub_title}>
          <Text algin="center" variant="h6" value={heroContents.subTitle()} />
        </div>

        <div style={{ textAlign: 'center', marginTop: '41px' }}>
          <CustomButton
            variant="contained"
            href={BRIDGED_COMMUNITY_FLUTTER}
            value="GET STARTED"
            type="default"
            className={home.btn}
          />
        </div>
      </div>

      <img src="" />
    </>
  );
};

export default Hero;
