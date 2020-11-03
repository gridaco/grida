import { createMuiTheme } from '@material-ui/core';

// import 'fontsource-roboto';

const theme = createMuiTheme({
  breakpoints: {
    values: {
      xs: 375,
      sm: 768,
      md: 1024,
      lg: 1280,
      xl: 1920,
    },
  },
  typography: {
    fontFamily: 'Roboto',
  },
});

theme.typography.h1 = {
  fontWeight: 900,
  fontSize: '112px',
  lineHeight: '100%',
  // fontFamily: 'Roboto',

  [theme.breakpoints.down('md')]: {
    fontWeight: 900,
    fontSize: '76px',
    lineHeight: '100%',
  },
  [theme.breakpoints.down('xs')]: {
    fontWeight: 900,
    fontSize: '64px',
    lineHeight: '100%',
  },
};

theme.typography.h2 = {
  fontWeight: 'bold',
  fontSize: '86px',
  lineHeight: '100%',
  [theme.breakpoints.down('md')]: {
    fontWeight: 'bold',
    fontSize: '64px',
    lineHeight: '100%',
  },
  [theme.breakpoints.down('xs')]: {
    fontWeight: 'bold',
    fontSize: '48px',
    lineHeight: '100%',
  },
};

theme.typography.h3 = {
  fontWeight: 500,
  fontSize: '72px',
  lineHeight: '84px',
  [theme.breakpoints.down('md')]: {
    fontWeight: 500,
    fontSize: '48px',
    lineHeight: '56px',
  },
  [theme.breakpoints.down('xs')]: {
    fontWeight: 500,
    fontSize: '36px',
    lineHeight: '42px',
  },
};

theme.typography.h4 = {
  fontWeight: 900,
  fontSize: '64px',
  lineHeight: '75px',
  [theme.breakpoints.down('md')]: {
    fontWeight: 900,
    fontSize: '48px',
    lineHeight: '56px',
  },
  [theme.breakpoints.down('xs')]: {
    fontWeight: 900,
    fontSize: '36px',
    lineHeight: '42px',
  },
};

theme.typography.h5 = {
  fontWeight: 900,
  fontSize: '36px',
  lineHeight: '42px',
  [theme.breakpoints.down('md')]: {
    fontWeight: 900,
    fontSize: '36px',
    lineHeight: '42px',
  },
  [theme.breakpoints.down('xs')]: {
    fontWeight: 900,
    fontSize: '24px',
    lineHeight: '28px',
  },
};

theme.typography.h6 = {
  fontWeight: 500,
  fontSize: '36px',
  lineHeight: '135%',
  [theme.breakpoints.down('md')]: {
    fontWeight: 500,
    fontSize: '36px',
    lineHeight: '135%',
  },
  [theme.breakpoints.down('xs')]: {
    fontWeight: 500,
    fontSize: '24px',
    lineHeight: '135%',
  },
};

theme.typography.subtitle1 = {
  fontWeight: 'bold',
  fontSize: '21px',
  lineHeight: '25px',
  [theme.breakpoints.down('md')]: {
    fontWeight: 'bold',
    fontSize: '21px',
    lineHeight: '25px',
  },
  [theme.breakpoints.down('xs')]: {
    fontWeight: 'bold',
    fontSize: '18px',
    lineHeight: '21px',
  },
};

theme.typography.subtitle2 = {
  fontWeight: 'bold',
  fontSize: '18px',
  lineHeight: '21px',
  [theme.breakpoints.down('md')]: {
    fontWeight: 'bold',
    fontSize: '18px',
    lineHeight: '21px',
  },
  [theme.breakpoints.down('xs')]: {
    fontWeight: 'bold',
    fontSize: '21px',
    lineHeight: '25px',
  },
};

theme.typography.body1 = {
  fontWeight: 'normal',
  fontSize: '18px',
  lineHeight: '21px',
  [theme.breakpoints.down('md')]: {
    fontWeight: 500,
    fontSize: '18px',
    lineHeight: '21px',
  },
  [theme.breakpoints.down('xs')]: {
    fontWeight: 500,
    fontSize: '12px',
    lineHeight: '14px',
  },
};

theme.typography.body2 = {
  fontWeight: 'normal',
  fontSize: '18px',
  lineHeight: '21px',
  [theme.breakpoints.down('md')]: {
    fontWeight: 'normal',
    fontSize: '18px',
    lineHeight: '21px',
  },
  [theme.breakpoints.down('xs')]: {
    fontWeight: 'normal',
    fontSize: '11px',
    lineHeight: '13px',
  },
};

theme.typography.button = {
  fontWeight: 500,
  fontSize: '24px',
  lineHeight: '28px',
  fontVariant: 'small-caps',
  [theme.breakpoints.down('md')]: {
    fontWeight: 500,
    fontSize: '24px',
    lineHeight: '28px',
    fontVariant: 'small-caps',
  },
  [theme.breakpoints.down('xs')]: {
    fontWeight: 500,
    fontSize: '14px',
    lineHeight: '16px',
    fontVariant: 'small-caps',
  },
};

theme.typography.caption = {
  fontWeight: 'normal',
  fontSize: '12px',
  lineHeight: '14px',
  [theme.breakpoints.down('md')]: {
    fontWeight: 'normal',
    fontSize: '12px',
    lineHeight: '14px',
  },
  [theme.breakpoints.down('xs')]: {
    fontWeight: 'normal',
    fontSize: '10px',
    lineHeight: '12px',
  },
};

theme.typography.overline = {
  fontWeight: 'normal',
  fontSize: '11px',
  lineHeight: '13px',
  fontVariant: 'small-caps',
  [theme.breakpoints.down('md')]: {
    fontWeight: 500,
    fontSize: '11px',
    lineHeight: '13px',
    fontVariant: 'small-caps',
  },
  [theme.breakpoints.down('xs')]: {
    fontWeight: 500,
    fontSize: '10px',
    lineHeight: '12px',
    fontVariant: 'small-caps',
  },
};

export default theme;
