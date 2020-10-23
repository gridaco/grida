import React from 'react';
import { Button, ThemeProvider, Typography } from '@material-ui/core';
import { CustomButtonTypes } from '../../common/types';

const CustomButton: React.FC<CustomButtonTypes> = ({
  variant,
  size,
  className,
  color,
  href,
  style,
  value,
}) => {
  return (
    <>
      <Button
        variant={variant}
        size={size}
        color={color}
        className={className}
        href={href}
        style={style}
      >
        {value}
      </Button>
    </>
  );
};

export default CustomButton;
