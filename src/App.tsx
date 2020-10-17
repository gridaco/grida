import { Button, createMuiTheme, ThemeProvider, Typography } from '@material-ui/core';
import React from 'react';
import './App.css';


const landingTheme = createMuiTheme({
  typography: {
    h1: {
      fontSize: 112,
      fontFamily: "Roboto",
      lineHeight: 1,
      fontWeight: "bolder",
      color: "#FFFFFF"
    },
    h6: {
      fontSize: 36,
      fontWeight: "normal",
      lineHeight: 1.35
    },
    subtitle1: {
      fontSize: 12,
    },
    body1: {
      fontWeight: 500,
    },
    button: {
      color: "#FFFFFF"
    },
  },
});



function App() {
  return (
    <ThemeProvider theme={landingTheme}>
      <div className="Hero">
        <Typography style={{ color: "white" }} variant="h1">desings that are meant to be implemented</Typography>
        <Typography style={{ color: "#A0BBFF" }} variant="h6">your design, your code, your content. in one place.</Typography>
        <Button style={{ backgroundColor: "#EE1347", color: "white", padding: 24, borderRadius: 140 }}>GET STARTED</Button>
      </div>
    </ThemeProvider>

  );
}

export default App;
