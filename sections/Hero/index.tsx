import { Typography } from '@material-ui/core';
import React from 'react';
import { CustomButton, Text } from '../../components';
// @ts-ignore
import styles from './index.module.scss';

const Hero = () => {
  return (
    <>
      <div style={{ margin: '0 240px' }}>
        <Text
          algin="center"
          variant="h1"
          value="designs that are meant <br/> to be implemented"
          style={{ fontWeight: 'bold', color: '#FFF' }}
        />

        <Text
          algin="center"
          variant="h6"
          value="your design, your code, your content. in one place."
          style={{ color: '#A0BBFF' }}
        />
        <div style={{ textAlign: 'center' }}>
          <CustomButton
            variant="contained"
            href=""
            value="GET STARTED"
            type="default"
            style={{ borderRadius: '140px' }}
            className={styles.hero_btn}
          />
        </div>
      </div>

      <img src="" />
    </>
  );
};

export default Hero;
