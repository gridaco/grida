import React from 'react';
import { Text } from '../../components';
// @ts-ignore
import styles from './index.module.scss';
// @ts-ignore
import codeBg from '../../images/code_background.svg';
import Paper from '@material-ui/core/Paper';
import Grid from '@material-ui/core/Grid';
import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';

import { featureGrid } from './toolkit';

const FeatureOverview = () => {
  return (
    <>
      <div className={styles.code_background}>
        <img src={codeBg} />
      </div>

      <div className={styles.grid_container}>
        <Grid container spacing={3}>
          {featureGrid.map((item) => {
            return (
              <Grid item xs={4} key={item.title}>
                <Paper className={styles.grid}>
                  <div className={styles.icon_box}>icon</div>
                  <div className={styles.contents}>
                    <Text value={item.title} />
                    <Text value={item.subTitle} />
                  </div>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      </div>

      <div style={{ width: '940px', margin: '0 auto' }}>
        <Text
          style={{ color: '#fff', fontSize: '36px' }}
          algin="left"
          variant="h4"
          value="Based on powerful engine, we provide desing linting, which leads to
          human-level generated code. Which means, Good design will not have to
          be coded manually. But don’t worry, we don’t put any middlewares or
          magic behind the scene. Everything is generated with native code base,
          So you can make your product still."
        />
      </div>
    </>
  );
};

export default FeatureOverview;
