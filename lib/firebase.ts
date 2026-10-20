// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDIQsN2jyack2aUspLMx4cG6LQ8Om_hY88",
  authDomain: "nextstep-992f0.firebaseapp.com",
  projectId: "nextstep-992f0",
  databaseURL: "https://nextstep-992f0-default-rtdb.firebaseio.com",
  storageBucket: "nextstep-992f0.firebasestorage.app",
  messagingSenderId: "1049225172309",
  appId: "1:1049225172309:web:043f5229b323202dd48bdc",
  measurementId: "G-LNS0E2XMZL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const db = getDatabase(app);
export const storage = getStorage(app);