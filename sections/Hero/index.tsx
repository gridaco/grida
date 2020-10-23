import { Typography } from '@material-ui/core';
import React from 'react';
import { CustomButton, Text } from '../../components';
// @ts-ignore
import styles from './index.module.scss';
import { heroContents } from './toolkit';

const Hero = () => {
  return (
    <>
      <div style={{ margin: '0 240px' }}>
        <Text
          algin="center"
          variant="h1"
          value={heroContents.title()}
          style={{ fontWeight: 'bold', color: '#FFF' }}
        />
        <div className={styles.sub_title}>
          <Text algin="center" variant="h6" value={heroContents.subTitle()} />
        </div>

        <div style={{ textAlign: 'center' }}>
          <CustomButton
            variant="contained"
            href=""
            value="GET STARTED"
            type="default"
            className={styles.hero_btn}
          />
        </div>
      </div>

      <img src="" />
    </>
  );
};

export default Hero;
