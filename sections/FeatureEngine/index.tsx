import { Link } from '@material-ui/core';
import React from 'react';
import { Text } from '../../components';
// @ts-ignore
import featureEngineTitle from '../../images/feature_engine_title.svg';
// @ts-ignore
import styles from './index.module.scss';

const FeatureEngine = () => {
  return (
    <>
      <div>
        <img src={featureEngineTitle} />
      </div>
      <div className={styles.sub_title}>
        <Text value="Design processor, that <br/> understands your design." />
        <Text value="With most advanced UI Context detection <br/> technology in the world. Humans are better <br/> with tools. But tools with no inteligence simply <br/> slow us down. If you designed a button, It <br/> should be recognized as a button. Don’t worry, <br/> We know that’s a button." />
      </div>
      <div>
        <Link href="/" style={{ color: '#463F95' }}>
          <Text algin="left" variant="h5" value="Learn more about engine" />
        </Link>
      </div>
    </>
  );
};

export default FeatureEngine;
