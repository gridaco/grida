import React from 'react';
import { Text } from '../../components';
// @ts-ignore
import styles from './index.module.scss';
// @ts-ignore
import home from '../../styles/Home.module.css';
// @ts-ignore
import codeBg from '../../images/code_background.svg';
import Paper from '@material-ui/core/Paper';
import Grid from '@material-ui/core/Grid';

import { featureGrid, featureOverviewContents } from './toolkit';

const FeatureOverview = () => {
  return (
    <>
      <div className={styles.code_background}>
        <img src={codeBg} />
      </div>

      <div className={styles.grid_container}>
        <Grid container spacing={8}>
          {featureGrid.map((item) => {
            return (
              <Grid item xl={4} lg={6} xs={12} key={item.title}>
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

      <div className={home.inner_container}>
        <Text
          className={styles.contents}
          algin="left"
          variant="h4"
          value={featureOverviewContents.content()}
        />
      </div>
    </>
  );
};

export default FeatureOverview;
