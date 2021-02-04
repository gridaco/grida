import React, { FC, StyleHTMLAttributes } from 'react';
import { CSSProperties } from '@material-ui/core/styles/withStyles';
import Text from '../Text';
import { Button } from '@material-ui/core';
import { analytics } from '../../utils/firebase';

export const MVP_SIGNUP_TYPEFORM_URL =
  'https://woojooj.typeform.com/to/uyTSms5Q';

/**
 * this component is for temporary use until bridged's services api gets to release accounts and authentication service online.
 * @returns
 */

interface SignupMvpButtonProps {
  value: string;
  style: CSSProperties;
}

export function SignupMvpButton({ value, style }: SignupMvpButtonProps) {
  const onclick = () => {
    open(MVP_SIGNUP_TYPEFORM_URL);
    analytics().logEvent("primary-signup-click");
  };

  return (
    <Button onClick={onclick} variant="contained" style={style}>
      <Text variant="button" value={value} />
    </Button>
  );
}
