import React from 'react';
import { BrowserRouter as Router, Switch, Route } from 'react-router-dom';
import { AppRoot } from '@bridged.xyz/app/app';

export default function App() {
  return (
    <Router>
      <AppRoot />
    </Router>
  );
}
