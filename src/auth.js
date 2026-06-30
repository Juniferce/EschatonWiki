/*
    Eschaton Wiki - Authentication Module (auth.js)
    Handles login, registration, logout, whitelist checks, and
    first-time admin account bootstrapping.
*/

import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    updatePassword,
    updateProfile,
    EmailAuthProvider,
    reauthenticateWithCredential
} from "firebase/auth";
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "firebase/firestore";

import { auth, db } from "./firebase.js";
import { ADMIN_EMAIL } from "./config.js";

// --- Internal State ---
let currentUserProfile = null; // Full profile object from Firestore users/{uid}

// --- Core Auth Listener ---

/**
 * Starts listening to Firebase auth state changes.
 * @param {function} onLoggedIn - Called with (firebaseUser, userProfile) when a valid, approved user is authenticated.
 * @param {function} onPending - Called when a user is logged in but not yet approved.
 * @param {function} onLoggedOut - Called when the user is signed out.
 */
export function initAuth(onLoggedIn, onPending, onLoggedOut) {
    onAuthStateChanged(auth, async (firebaseUser) => {
        if (!firebaseUser) {
            currentUserProfile = null;
            onLoggedOut();
            return;
        }

        try {
            // Check/bootstrap user profile in Firestore
            const profile = await ensureUserProfile(firebaseUser);
            currentUserProfile = profile;

            if (profile.approved) {
                onLoggedIn(firebaseUser, profile);
            } else {
                onPending(firebaseUser, profile);
            }
        } catch (err) {
            console.error("Auth state check failed:", err);
            onLoggedOut();
        }
    });
}

// --- Profile Bootstrap ---

/**
 * Ensures a Firestore user profile document exists.
 * If the user is the admin email and no admin config exists, bootstraps them as admin.
 * @param {object} firebaseUser
 * @returns {object} The user profile data.
 */
async function ensureUserProfile(firebaseUser) {
    const userDocRef = doc(db, "users", firebaseUser.uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
        // Update last active timestamp passively
        return userSnap.data();
    }

    // New user - check if this is the admin email
    const isAdminEmail = firebaseUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    if (isAdminEmail) {
        // Check if admin config already set
        const adminConfigRef = doc(db, "config", "admin");
        const adminSnap = await getDoc(adminConfigRef);

        if (!adminSnap.exists()) {
            // First-ever admin login — bootstrap the entire system
            await setDoc(adminConfigRef, { adminUid: firebaseUser.uid });
            console.log("Admin config bootstrapped for UID:", firebaseUser.uid);
        }

        // Create admin profile (always approved)
        const adminProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || "Admin",
            role: "admin",
            approved: true,
            createdAt: serverTimestamp()
        };
        await setDoc(userDocRef, adminProfile);
        return adminProfile;
    }

    // Regular new user - create profile, pending approval
    const newProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || firebaseUser.email.split("@")[0],
        role: "player",
        approved: false,
        createdAt: serverTimestamp()
    };
    await setDoc(userDocRef, newProfile);
    return newProfile;
}

// --- Sign In / Sign Out / Register ---

/**
 * Signs in an existing user with email and password.
 * @returns {object} Firebase UserCredential
 */
export async function loginUser(email, password) {
    return await signInWithEmailAndPassword(auth, email, password);
}

/**
 * Registers a new user account. Their profile will default to approved: false
 * until an admin approves them, unless they are the admin email.
 */
export async function registerUser(email, password, displayName) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    // Set the display name on the Firebase Auth profile
    await updateProfile(credential.user, { displayName });
    // ensureUserProfile will be triggered by onAuthStateChanged automatically
    return credential;
}

/** Signs the current user out. */
export async function logoutUser() {
    await signOut(auth);
}

// --- Account Management (Self-Service) ---

/**
 * Changes the current user's display name.
 */
export async function changeDisplayName(newName) {
    const user = auth.currentUser;
    if (!user) throw new Error("Not signed in.");
    await updateProfile(user, { displayName: newName });
    // Update Firestore profile too
    await setDoc(doc(db, "users", user.uid), { displayName: newName }, { merge: true });
    if (currentUserProfile) currentUserProfile.displayName = newName;
}

/**
 * Re-authenticates and then changes the current user's password.
 */
export async function changePassword(currentPassword, newPassword) {
    const user = auth.currentUser;
    if (!user) throw new Error("Not signed in.");
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
}

// --- Getters ---

/** Returns the current Firebase Auth user object, or null. */
export function getCurrentUser() {
    return auth.currentUser;
}

/** Returns the current user's Firestore profile, or null. */
export function getCurrentUserProfile() {
    return currentUserProfile;
}

/** Returns true if the current user has the admin role. */
export function isAdmin() {
    return currentUserProfile?.role === "admin";
}
