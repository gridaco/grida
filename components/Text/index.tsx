import React from 'react';
import { Typography } from '@material-ui/core';
import { TextTypes } from '../../common/types';

const Text: React.FC<TextTypes> = ({
  algin,
  color,
  variant,
  className,
  style,
  value,
}) => {
  return (
    <>
      <Typography
        align={algin}
        color={color}
        variant={variant}
        className={className}
        style={style}
      >
        {value}
      </Typography>
    </>
  );
};

export default Text;
