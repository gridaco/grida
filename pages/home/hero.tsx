import { Button, createMuiTheme, ThemeProvider, Typography } from '@material-ui/core';
import React from 'react';

export default function () {
    return <div className="Hero">
        <Typography style={{ color: "white" }} variant="h1">desings that are meant to be implemented</Typography>
        <Typography style={{ color: "#A0BBFF" }} variant="h6">your design, your code, your content. in one place.</Typography>
        <Button style={{ backgroundColor: "#EE1347", color: "white", padding: 24, borderRadius: 140 }}>GET STARTED</Button>
    </div>
}