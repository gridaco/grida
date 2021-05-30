import React from 'react';
import { BrowserRouter as Router, Switch, Route } from 'react-router-dom';
import { Home } from '@bridged.xyz/app/home';

export default function App() {
  return (
    <Router>
      <Home />
    </Router>
  );
}
