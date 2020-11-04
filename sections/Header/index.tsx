import React from 'react';
// @ts-ignore
import styles from './index.module.scss';
// @ts-ignore
import logoWhite from '../../static/logo-white.svg';
// @ts-ignore
import xsLogoWhite from '../../images/xs_logo_white.svg';
import { headerMenu, headerSubMenu } from './toolkit';
import { Link } from '@material-ui/core';
import { Text, CustomDrawer } from '../../components';

const Header = () => {
  return (
    <>
      <div className={styles.header_container}>
        <div className={styles.header}>
          <div className={styles.logo}>
            <img src={logoWhite} />
          </div>
          <div className={styles.xs_logo}>
            <img src={xsLogoWhite} />
          </div>

          <div className={styles.nav}>
            {headerMenu.map((item, i) => {
              let _interval = 0;
              if (i !== 0) _interval = 44;
              return (
                <Link href={item.href} key={i}>
                  <Text
                    className={styles.menu}
                    variant="subtitle1"
                    style={{ marginLeft: `${_interval}px` }}
                    value={item.label}
                  />
                </Link>
              );
            })}
          </div>
          <div className={styles.sub_nav}>
            {headerSubMenu.map((item, i) => {
              let _interval = 0;
              if (i !== 0) _interval = 44;
              return (
                <Link href={item.href} key={i}>
                  <Text
                    className={styles.menu}
                    variant="subtitle1"
                    style={{ marginLeft: `${_interval}px` }}
                    value={item.label}
                  />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};

export default Header;
