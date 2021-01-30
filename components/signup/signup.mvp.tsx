import React, { FC, StyleHTMLAttributes } from 'react';
import { CSSProperties } from '@material-ui/core/styles/withStyles';
import Text from '../Text';
import { Button } from '@material-ui/core';

export const MVP_SIGNUP_TYPEFORM_URL =
  'https://woojooj.typeform.com/to/uyTSms5Q';

/**
 * this component is for temporary use until bridged's services api gets to release accounts and authentication service online.
 * @returns
 */
export function SignupMvpButton(buttonStyle: any) {
  const onclick = () => {
    open(MVP_SIGNUP_TYPEFORM_URL);
  };
  return (
    <Button onClick={onclick} variant="contained" style={buttonStyle.style}>
      <Text variant="button" value="SIGNUP" />
    </Button>
  );
}
