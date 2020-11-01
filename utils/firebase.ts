import firebase from "firebase"
import "firebase/analytics"

const config = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBuket: process.env.FIREBASE_STORAGE_BUKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    apId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASYREMENT_ID
}


if (typeof window !== "undefined" && !firebase.app.length) {
    firebase.initializeApp(config)
    if ('measurementId' in config) firebase.analytics()
}

export default firebase