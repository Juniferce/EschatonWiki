/*
    Eschaton Wiki - Shared Firebase Instances (firebase.js)
    Initializes the Firebase app once and exports shared instances
    of Firestore and Auth so all modules use the same connection.
*/

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
