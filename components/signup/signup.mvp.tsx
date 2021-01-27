import React from 'react';
import Button from '@material-ui/core/Button';

export const MVP_SIGNUP_TYPEFORM_URL =
  'https://woojooj.typeform.com/to/uyTSms5Q';
/**
 * this component is for temporary use until bridged's services api gets to release accounts and authentication service online.
 * @returns
 */
export function SignupMvpButton() {
  const onclick = () => {
    open(MVP_SIGNUP_TYPEFORM_URL);
  };
  return (
    <Button onClick={onclick} variant="contained">
      signup
    </Button>
  );
}
