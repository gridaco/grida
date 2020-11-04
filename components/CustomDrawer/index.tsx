import React, { useState } from 'react';
import SwipeableDrawer from '@material-ui/core/SwipeableDrawer';
import Button from '@material-ui/core/Button';
import List from '@material-ui/core/List';
import { headerMenu, headerSubMenu } from '../../sections/Header/toolkit';
import { Link } from '@material-ui/core';
import { Text } from '..';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import { CustomDrawerTypes } from '../../common/types';

const CustomDrawer: React.FC<CustomDrawerTypes> = (visible, setVisible) => {
  const [avisible, asetVisible] = useState(false);
  return (
    <>
      <SwipeableDrawer
        anchor={'top'}
        open={avisible}
        onClose={() => {
          setVisible(false);
        }}
        onOpen={() => {
          setVisible(true);
        }}
      >
        <div
          onClick={() => {
            setVisible(false);
          }}
        >
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
        </div>
      </SwipeableDrawer>
    </>
  );
};

export default CustomDrawer;
