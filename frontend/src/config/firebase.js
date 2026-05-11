// Import the functions you need from the SDKs you need
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAwDAA0ZP4wYzduwqhn8LC-8sCXlxfjzJs",
  authDomain: "dreamdwell-fb333.firebaseapp.com",
  projectId: "dreamdwell-fb333",
  storageBucket: "dreamdwell-fb333.firebasestorage.app",
  messagingSenderId: "489291039486",
  appId: "1:489291039486:web:b7da628c55ac77cd9f9baf",
  measurementId: "G-82H6MWGNH2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// THESE EXPORTS ARE REQUIRED!
export const auth = getAuth(app);
export const db = getFirestore(app);
