/*
    Eschaton Wiki - Firebase Configuration (config.js)
    Contains your Firebase project credentials and admin settings.

    NOTE: Firebase API keys are designed to be client-side public.
    Security is enforced via Firestore Security Rules, not by hiding keys.
    Add this file to .gitignore if you prefer to keep keys off GitHub,
    but note that GitHub Pages will need it present to function.
*/

export const firebaseConfig = {
    apiKey: "AIzaSyBeYN6lMzYt_yIMuJVfB_j7eYAD0DRjK9s",
    authDomain: "eschaton-wiki.firebaseapp.com",
    projectId: "eschaton-wiki",
    storageBucket: "eschaton-wiki.firebasestorage.app",
    messagingSenderId: "614710548622",
    appId: "1:614710548622:web:b2f8d13f3866cda6fe11df"
};

// The email address of the wiki administrator (you).
// The first time this account logs in, it is automatically granted
// admin privileges and can approve/revoke all other user accounts.
export const ADMIN_EMAIL = "carterntill@gmail.com";
