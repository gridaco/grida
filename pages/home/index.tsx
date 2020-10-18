import { Button, createMuiTheme, ThemeProvider, Typography } from '@material-ui/core';
import React from 'react';
import Hero from './hero';
import LintSection from "./lint-section"
// import "./index.module.css"

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



export default function () {
    return (
        <ThemeProvider theme={landingTheme}>
            <Hero />
            <LintSection></LintSection>
        </ThemeProvider>
    );
}