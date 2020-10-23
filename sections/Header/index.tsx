import React from 'react';
// @ts-ignore
import styles from './index.module.scss';
// @ts-ignore
import logoWhite from '../../static/logo-white.svg';

import { headerMenu } from './toolkit';

const Header = () => {
  return (
    <>
      <div className={styles.header}>
        <div className={styles.logo}>
          <img src={logoWhite} />
        </div>
        {headerMenu.map((item) => {
          if (item.sub === true) {
            return (
              <div style={{ float: 'left', margin: '22px' }}>
                <span className="center">{item.label}</span>
              </div>
            );
          } else {
            return (
              <div style={{ float: 'left', margin: '22px' }}>
                <span className="center">{item.label}</span>
              </div>
            );
          }
        })}
      </div>
    </>
  );
};

export default Header;
