/*
    Eschaton Wiki - Admin Panel Module (admin.js)
    Handles user listing, approving/revoking player access,
    and rendering the admin panel UI.
*/

import {
    collection,
    getDocs,
    doc,
    setDoc,
    orderBy,
    query
} from "firebase/firestore";

import { db } from "./firebase.js";
import { isAdmin } from "./auth.js";

// --- Firestore Helpers ---

/** Loads all user profiles from the Firestore users collection. */
export async function getUsers() {
    if (!isAdmin()) return [];
    const q = query(collection(db, "users"), orderBy("createdAt", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/** Sets a user's approved status. */
export async function setUserApproved(uid, approved) {
    if (!isAdmin()) throw new Error("Admin access required.");
    await setDoc(doc(db, "users", uid), { approved }, { merge: true });
}

/** Sets a user's role. */
export async function setUserRole(uid, role) {
    if (!isAdmin()) throw new Error("Admin access required.");
    await setDoc(doc(db, "users", uid), { role }, { merge: true });
}

// --- Admin Panel Rendering ---

/**
 * Renders the admin user management panel into the given container element.
 */
export async function renderAdminPanel(container) {
    container.innerHTML = `
        <div class="admin-panel-loading">
            <i class="fa-solid fa-spinner" style="animation: spin 1s linear infinite;"></i>
            Loading users...
        </div>
    `;

    let users;
    try {
        users = await getUsers();
    } catch (err) {
        container.innerHTML = `<p class="admin-error">Failed to load users: ${err.message}</p>`;
        return;
    }

    const pending = users.filter(u => !u.approved);
    const approved = users.filter(u => u.approved);

    container.innerHTML = `
        <div class="admin-section">
            <div class="admin-section-title">
                <i class="fa-solid fa-clock"></i>
                Pending Approval
                ${pending.length > 0 ? `<span class="admin-badge">${pending.length}</span>` : ""}
            </div>
            ${pending.length === 0
                ? `<div class="admin-empty">No pending accounts.</div>`
                : pending.map(u => renderUserRow(u, false)).join("")
            }
        </div>
        <div class="admin-section">
            <div class="admin-section-title">
                <i class="fa-solid fa-circle-check"></i>
                Approved Members
            </div>
            ${approved.length === 0
                ? `<div class="admin-empty">No approved accounts yet.</div>`
                : approved.map(u => renderUserRow(u, true)).join("")
            }
        </div>
    `;

    // Bind action buttons
    container.querySelectorAll(".admin-approve-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const uid = btn.dataset.uid;
            btn.disabled = true;
            btn.textContent = "Approving...";
            await setUserApproved(uid, true);
            await renderAdminPanel(container);
        });
    });

    container.querySelectorAll(".admin-revoke-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const uid = btn.dataset.uid;
            if (!confirm("Are you sure you want to revoke this user's access?")) return;
            btn.disabled = true;
            btn.textContent = "Revoking...";
            await setUserApproved(uid, false);
            await renderAdminPanel(container);
        });
    });

    container.querySelectorAll(".admin-make-admin-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const uid = btn.dataset.uid;
            if (!confirm("Grant this user admin privileges?")) return;
            await setUserRole(uid, "admin");
            await renderAdminPanel(container);
        });
    });
}

function renderUserRow(user, isApproved) {
    const initials = (user.displayName || user.email || "?")
        .split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

    const joinedDate = user.createdAt?.toDate
        ? user.createdAt.toDate().toLocaleDateString()
        : "—";

    const roleLabel = user.role === "admin"
        ? `<span class="user-role-badge admin-role">Admin</span>`
        : `<span class="user-role-badge player-role">Player</span>`;

    return `
        <div class="admin-user-row">
            <div class="user-avatar">${initials}</div>
            <div class="user-info">
                <div class="user-name">${user.displayName || "Unnamed"} ${roleLabel}</div>
                <div class="user-email">${user.email}</div>
                <div class="user-joined">Joined ${joinedDate}</div>
            </div>
            <div class="user-actions">
                ${!isApproved
                    ? `<button class="admin-action-btn admin-approve-btn" data-uid="${user.uid}">
                           <i class="fa-solid fa-circle-check"></i> Approve
                       </button>`
                    : user.role !== "admin"
                        ? `<button class="admin-action-btn admin-make-admin-btn" data-uid="${user.uid}" title="Grant Admin">
                               <i class="fa-solid fa-shield-halved"></i>
                           </button>
                           <button class="admin-action-btn admin-revoke-btn danger" data-uid="${user.uid}">
                               <i class="fa-solid fa-ban"></i> Revoke
                           </button>`
                        : `<span class="admin-self-label">
                               <i class="fa-solid fa-crown"></i> You
                           </span>`
                }
            </div>
        </div>
    `;
}
