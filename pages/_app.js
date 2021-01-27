import { useEffect } from 'react';
// import { analytics } from '../utils/firebase';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    try{
      analytics();
    }catch(_){
      console.error('seems like you are a contributor! ignore this message since this is a warning that we could not find firebase credentials to initialize.')
    }
  }, []);

  return <Component {...pageProps} />;
}

export default MyApp;
