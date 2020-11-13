import React from 'react';
import { Link, SwipeableDrawer, List } from '@material-ui/core';
import { Text } from '..';
import { headerMenu, headerSubMenu } from '../../sections/Header/toolkit';
import { XsNavTypes } from '../../common/types';

const XsNav: React.FC<XsNavTypes> = ({ visible, setVisible }) => {
  return (
    <>
      <List>
        {headerMenu.map((item) => (
          <Link href={item.href} key={item.href}>
            <Text variant="subtitle1" value={item.label} />
          </Link>
        ))}
        {headerSubMenu.map((item) => (
          <Link href={item.href} key={item.href}>
            <Text variant="subtitle1" value={item.label} />
          </Link>
        ))}
      </List>
    </>
  );
};

export default XsNav;
