import { Link } from '@material-ui/core';
import React from 'react';
import { Text } from '../../components';

// @ts-ignore
import styles from './index.module.scss';

const FeatureCodegen = () => {
  return (
    <>
      <div style={{ color: '#fff' }}>
        <Text
          className={styles.title}
          algin="left"
          variant="h2"
          value="Code is - your <br/> prototype </."
        />
      </div>
      <div className={styles.sub_title_box}>
        <Text
          algin="left"
          variant="h5"
          value="Finally, the usable code exporter"
        />
        <Text
          algin="left"
          variant="h5"
          value="readable, production ready code. no custom implementaion. all in <br/> standard form."
        />
      </div>
      <div className={styles.link}>
        <Link href="/" style={{ color: '#463F95' }}>
          <Text algin="left" variant="h5" value="Learn more how it works" />
        </Link>
      </div>
    </>
  );
};

export default FeatureCodegen;
