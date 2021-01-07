import React, { useState } from 'react';
// @ts-ignore
import styles from './index.module.scss';
// @ts-ignore
import home from '../../styles/home.module.scss';
// @ts-ignore
import logoWhite from '../../static/logo-white.svg';
// @ts-ignore
import xsLogoWhite from '../../images/xs_logo_white.svg';
import { headerMenu, headerSubMenu } from './toolkit';
import { Link, Drawer, List, Button } from '@material-ui/core';
import { Text } from '../../components';
import MenuIcon from '@material-ui/icons/Menu';
import ClearIcon from '@material-ui/icons/Clear';
import { BRIDGED_COMMUNITY_FLUTTER } from '../../common/toolkit';

const Header = () => {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <div className={styles.header_container}>
        <div className={styles.header}>
          <div className={styles.logo} onClick={() => (location.href = '/')}>
            <img src={logoWhite} alt="bridged.xyz_logo" />
          </div>
          <div
            className={styles.xs_logo}
            style={{ width: '56px' }}
            onClick={() => (location.href = '/')}
          >
            <img src={xsLogoWhite} alt="bridged.xyz_miniLogo" />
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

          <div className={styles.xs_nav}>
            <Button
              onClick={() => setVisible(!visible)}
              style={{
                float: 'right',
                marginTop: '18px',
                marginRight: '-20px',
                padding: '0',
              }}
            >
              <MenuIcon style={{ color: '#fff' }} />
            </Button>
            <Drawer
              anchor={'top'}
              open={visible}
              onClose={() => {
                setVisible(false);
              }}
            >
              <div className={styles.drawer}>
                <div className={styles.inner_drawer}>
                  <div className={styles.xs_logo}>
                    <img src={xsLogoWhite} style={{ width: '36px' }} />
                  </div>
                  <Button
                    onClick={() => {
                      setVisible(!visible);
                      console.log(visible);
                    }}
                    style={{
                      float: 'right',
                      marginTop: '18px',
                      marginRight: '-15px',
                      padding: '0',
                    }}
                  >
                    <ClearIcon style={{ color: '#fff' }} />
                  </Button>
                </div>
                <List>
                  {headerMenu.map((item) => (
                    <div className={styles.navbar} key={item.href}>
                      <Link href={item.href}>
                        <Text
                          variant="subtitle1"
                          value={item.label}
                          algin="center"
                          className={styles.item}
                        />
                      </Link>
                    </div>
                  ))}
                  {headerSubMenu.map((item) => (
                    <div className={styles.navbar} key={item.href}>
                      <Link href={item.href}>
                        <Text
                          variant="subtitle1"
                          value={item.label}
                          algin="center"
                          className={styles.item}
                        />
                      </Link>
                    </div>
                  ))}
                  <div className={styles.btn_box}>
                    <Button
                      variant="contained"
                      href={BRIDGED_COMMUNITY_FLUTTER}
                      className={styles.btn}
                      style={{ width: '100%' }}
                    >
                      <Text variant="button" value="GET STARTED" />
                    </Button>
                  </div>
                </List>
              </div>
            </Drawer>
          </div>
        </div>
      </div>
    </>
  );
};

export default Header;
