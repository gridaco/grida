import { useEffect } from 'react';
// import { analytics } from '../utils/firebase';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    // analytics();
  }, []);

  return <Component {...pageProps} />;
}

export default MyApp;
