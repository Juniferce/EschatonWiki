/*
    Eschaton Wiki - Version History Module (history.js)
    Records page snapshots on every save and renders the history panel
    so players can see who made which changes and when.
*/

import {
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    serverTimestamp,
    limit
} from "firebase/firestore";

import { db } from "./firebase.js";
import { getCurrentUserProfile, isAdmin } from "./auth.js";

// --- Snapshot Recording ---

/**
 * Records a snapshot of a page's current state to its history subcollection.
 * Called by db.js before overwriting a page document.
 * @param {string} pageId
 * @param {object} pageData - The current page object (title, blocks, tags, etc.)
 */
export async function recordSnapshot(pageId, pageData) {
    const userProfile = getCurrentUserProfile();
    if (!userProfile) return; // Skip if not authenticated

    try {
        const histRef = collection(db, "pages", pageId, "history");
        await addDoc(histRef, {
            title: pageData.title || "Untitled",
            blocks: pageData.blocks || [],
            tags: pageData.tags || [],
            parentId: pageData.parentId || "",
            authorId: userProfile.uid,
            authorName: userProfile.displayName || userProfile.email,
            savedAt: serverTimestamp()
        });
    } catch (err) {
        // Non-critical — history recording failure should not break saves
        console.warn("History snapshot failed:", err.message);
    }
}

// --- History Loading ---

/**
 * Loads the history entries for a given page, most recent first.
 * @param {string} pageId
 * @param {number} maxEntries - Maximum number of history entries to load (default 50)
 * @returns {Array} List of history snapshot objects with id and metadata.
 */
export async function getHistory(pageId, maxEntries = 50) {
    try {
        const histRef = collection(db, "pages", pageId, "history");
        const q = query(histRef, orderBy("savedAt", "desc"), limit(maxEntries));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
            // Convert Firestore Timestamp to JS Date for display
            savedAt: d.data().savedAt?.toDate ? d.data().savedAt.toDate() : new Date()
        }));
    } catch (err) {
        console.warn("Failed to load history:", err.message);
        return [];
    }
}

// --- History Panel Rendering ---

/**
 * Opens the history side panel for a given page.
 * @param {string} pageId
 * @param {function} onPreview - Callback with (blocks) to preview a snapshot.
 * @param {function} onRestore - Callback with (snapshot) to restore to a version.
 */
export async function openHistoryPanel(pageId, onPreview, onRestore) {
    const panel = document.getElementById("history-panel");
    const list = document.getElementById("history-list");

    panel.classList.remove("hidden");
    list.innerHTML = `
        <div class="history-loading">
            <i class="fa-solid fa-spinner" style="animation: spin 1s linear infinite;"></i>
            Loading history...
        </div>
    `;

    const entries = await getHistory(pageId);

    if (entries.length === 0) {
        list.innerHTML = `<div class="history-empty">
            <i class="fa-regular fa-clock"></i>
            <p>No history yet. Edits will appear here after they are saved.</p>
        </div>`;
        return;
    }

    list.innerHTML = entries.map((entry, idx) => {
        const date = entry.savedAt instanceof Date ? entry.savedAt : new Date();
        const timeStr = date.toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric"
        });
        const clockStr = date.toLocaleTimeString("en-US", {
            hour: "2-digit", minute: "2-digit"
        });
        const initials = (entry.authorName || "?")
            .split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

        return `
            <div class="history-entry" data-index="${idx}">
                <div class="history-entry-header">
                    <div class="history-avatar">${initials}</div>
                    <div class="history-meta">
                        <div class="history-author">${entry.authorName || "Unknown"}</div>
                        <div class="history-date">${timeStr} &middot; ${clockStr}</div>
                    </div>
                </div>
                <div class="history-entry-actions">
                    <button class="history-btn preview-snapshot-btn" data-index="${idx}">
                        <i class="fa-solid fa-eye"></i> Preview
                    </button>
                    ${isAdmin()
                        ? `<button class="history-btn restore-snapshot-btn" data-index="${idx}">
                               <i class="fa-solid fa-clock-rotate-left"></i> Restore
                           </button>`
                        : ""}
                </div>
            </div>
        `;
    }).join("");

    // Bind preview buttons
    list.querySelectorAll(".preview-snapshot-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.index);
            const entry = entries[idx];
            highlightActiveEntry(list, idx);
            onPreview(entry.blocks, entry.title);
        });
    });

    // Bind restore buttons (admin only)
    list.querySelectorAll(".restore-snapshot-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const idx = parseInt(btn.dataset.index);
            const entry = entries[idx];
            if (confirm(`Restore to this version by ${entry.authorName} from ${entry.savedAt.toLocaleDateString()}?`)) {
                await onRestore(entry);
                panel.classList.add("hidden");
            }
        });
    });
}

function highlightActiveEntry(list, activeIdx) {
    list.querySelectorAll(".history-entry").forEach((el, i) => {
        el.classList.toggle("active", i === activeIdx);
    });
}

/** Closes the history panel. */
export function closeHistoryPanel() {
    const panel = document.getElementById("history-panel");
    if (panel) panel.classList.add("hidden");
}
