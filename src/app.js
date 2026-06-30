/*
   Eschaton Wiki - Main Application Coordinator (app.js)
   Initializes auth, then bootstraps the wiki only for approved users.
   Wires together sidebar, editor, templates, admin panel, and history.
*/

import { getPages, getPage, savePage, deletePage, restoreDatabase, SAMPLE_PAGES } from "./db.js";
import { initSidebar, refreshSidebar } from "./sidebar.js";
import { renderEditor, autoSave } from "./editor.js";
import { getTemplateBlocks } from "./templates.js";
import { initAuth, logoutUser, changePassword, changeDisplayName, isAdmin, getCurrentUserProfile } from "./auth.js";
import { renderAdminPanel } from "./admin.js";
import { openHistoryPanel, closeHistoryPanel } from "./history.js";
import { getConnections, InteractiveMap } from "./nodemap.js";

let activePageId = null;
let isEditMode = false;
let localMapInstance = null;
let fullMapInstance = null;

// --- Entry Point ---

window.addEventListener("DOMContentLoaded", () => {
    initAuth(onLoggedIn, onPending, onLoggedOut);
    bindAuthUIEvents();
});

// --- Auth State Handlers ---

async function onLoggedIn(firebaseUser, userProfile) {
    showScreen("app");
    updateUserMenuUI(userProfile);

    // Show/hide admin button
    const adminBtn = document.getElementById("admin-panel-btn");
    if (adminBtn) adminBtn.classList.toggle("hidden", !isAdmin());
    
    // Initialize global edit/viewer mode state & button styling
    updateGlobalEditButtonUI();

    // Initialize wiki
    initSidebar();
    initMaps();
    bindAppEvents();

    // Seed sample data and Template page if Firestore is empty
    let pages = await getPages();
    if (pages.length === 0) {
        // Add initial welcome templates
        SAMPLE_PAGES.push({
            id: "template-npc-default",
            title: "NPC Profile Template",
            parentId: "",
            tags: ["Template"],
            blocks: [
                { id: "b1", type: "h1", content: "NPC Name" },
                { id: "b2", type: "paragraph", content: "Brief description..." },
                { id: "b3", type: "h2", content: "Appearance" },
                { id: "b4", type: "paragraph", content: "Details here..." }
            ],
            updatedAt: Date.now()
        });
        await restoreDatabase(SAMPLE_PAGES);
        pages = await getPages();
    }

    // Custom URL/Deep-Link Bookmark system router
    const targetPageId = window.location.hash.substring(1);
    const hasTarget = pages.some(p => p.id === targetPageId);
    if (hasTarget) {
        changeActivePage(targetPageId, false);
    } else if (pages.length > 0) {
        changeActivePage(pages[0].id, false);
    } else {
        refreshAppView();
    }
}

function onPending(firebaseUser, userProfile) {
    showScreen("pending");
    document.getElementById("pending-user-name").textContent =
        userProfile.displayName || firebaseUser.email;
}

function onLoggedOut() {
    showScreen("login");
    activePageId = null;
    isEditMode = false;
}

/** Shows one of: 'login', 'pending', 'app' */
function showScreen(screen) {
    document.getElementById("login-screen").classList.toggle("hidden", screen !== "login");
    document.getElementById("pending-screen").classList.toggle("hidden", screen !== "pending");
    document.getElementById("app-container").classList.toggle("hidden", screen !== "app");
}

// --- Auth UI Event Binding ---

function bindAuthUIEvents() {
    // Login / Register tab toggling
    const loginTab = document.getElementById("auth-tab-login");
    const registerTab = document.getElementById("auth-tab-register");
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");

    loginTab.addEventListener("click", () => {
        loginTab.classList.add("active");
        registerTab.classList.remove("active");
        loginForm.classList.remove("hidden");
        registerForm.classList.add("hidden");
        clearAuthError();
    });

    registerTab.addEventListener("click", () => {
        registerTab.classList.add("active");
        loginTab.classList.remove("active");
        registerForm.classList.remove("hidden");
        loginForm.classList.add("hidden");
        clearAuthError();
    });

    // Login form submission
    document.getElementById("login-submit-btn").addEventListener("click", async () => {
        const email = document.getElementById("login-email").value.trim();
        const password = document.getElementById("login-password").value;
        if (!email || !password) return showAuthError("Please enter your email and password.");

        setAuthLoading(true);
        try {
            const { loginUser } = await import("./auth.js");
            await loginUser(email, password);
            // onAuthStateChanged fires automatically
        } catch (err) {
            showAuthError(friendlyAuthError(err.code));
        } finally {
            setAuthLoading(false);
        }
    });

    // Enter key on login password
    document.getElementById("login-password").addEventListener("keydown", (e) => {
        if (e.key === "Enter") document.getElementById("login-submit-btn").click();
    });

    // Register form submission
    document.getElementById("register-submit-btn").addEventListener("click", async () => {
        const name = document.getElementById("register-name").value.trim();
        const email = document.getElementById("register-email").value.trim();
        const password = document.getElementById("register-password").value;
        const confirm = document.getElementById("register-confirm").value;

        if (!name || !email || !password) return showAuthError("All fields are required.");
        if (password !== confirm) return showAuthError("Passwords do not match.");
        if (password.length < 6) return showAuthError("Password must be at least 6 characters.");

        setAuthLoading(true);
        try {
            const { registerUser } = await import("./auth.js");
            await registerUser(email, password, name);
            // onAuthStateChanged fires → onPending will be called
        } catch (err) {
            showAuthError(friendlyAuthError(err.code));
        } finally {
            setAuthLoading(false);
        }
    });

    // Pending screen logout button
    document.getElementById("pending-logout-btn").addEventListener("click", async () => {
        await logoutUser();
    });

    // Account dropdown
    document.getElementById("account-menu-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        document.getElementById("account-dropdown").classList.toggle("hidden");
    });
    document.addEventListener("click", () => {
        document.getElementById("account-dropdown")?.classList.add("hidden");
    });

    // Logout
    document.getElementById("logout-btn").addEventListener("click", async () => {
        await logoutUser();
    });

    // Change display name
    document.getElementById("change-name-btn").addEventListener("click", async () => {
        const newName = prompt("Enter your new display name:");
        if (!newName || !newName.trim()) return;
        try {
            await changeDisplayName(newName.trim());
            const profile = getCurrentUserProfile();
            updateUserMenuUI(profile);
            alert("Display name updated!");
        } catch (err) {
            alert("Failed to update name: " + err.message);
        }
    });

    // Change password
    document.getElementById("change-password-btn").addEventListener("click", async () => {
        const current = prompt("Enter your current password:");
        if (!current) return;
        const next = prompt("Enter your new password (min. 6 characters):");
        if (!next || next.length < 6) return alert("New password must be at least 6 characters.");
        const confirm = prompt("Confirm new password:");
        if (next !== confirm) return alert("Passwords do not match.");

        try {
            await changePassword(current, next);
            alert("Password changed successfully!");
        } catch (err) {
            alert("Failed to change password: " + err.message);
        }
    });

    // Admin panel
    document.getElementById("admin-panel-btn")?.addEventListener("click", () => {
        const modal = document.getElementById("admin-modal");
        modal.classList.remove("hidden");
        renderAdminPanel(document.getElementById("admin-panel-content"));
    });
    document.getElementById("close-admin-btn")?.addEventListener("click", () => {
        document.getElementById("admin-modal").classList.add("hidden");
    });

    // History panel
    document.getElementById("close-history-btn")?.addEventListener("click", () => {
        closeHistoryPanel();
    });
}

// --- Auth Helpers ---

function updateUserMenuUI(profile) {
    const nameEl = document.getElementById("account-display-name");
    const nameDropEl = document.getElementById("account-display-name-drop");
    const emailEl = document.getElementById("account-email");
    if (nameEl) nameEl.textContent = profile?.displayName || "User";
    if (nameDropEl) nameDropEl.textContent = profile?.displayName || "User";
    if (emailEl) emailEl.textContent = profile?.email || "";
}

function showAuthError(msg) {
    const el = document.getElementById("auth-error");
    el.textContent = msg;
    el.classList.remove("hidden");
}

function clearAuthError() {
    const el = document.getElementById("auth-error");
    if (el) { el.textContent = ""; el.classList.add("hidden"); }
}

function setAuthLoading(loading) {
    const loginBtn = document.getElementById("login-submit-btn");
    const registerBtn = document.getElementById("register-submit-btn");
    if (loginBtn) loginBtn.disabled = loading;
    if (registerBtn) registerBtn.disabled = loading;
}

function friendlyAuthError(code) {
    const map = {
        "auth/user-not-found": "No account found with that email.",
        "auth/wrong-password": "Incorrect password.",
        "auth/invalid-email": "Invalid email address.",
        "auth/email-already-in-use": "An account with this email already exists.",
        "auth/weak-password": "Password should be at least 6 characters.",
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/too-many-requests": "Too many attempts. Please try again later.",
        "auth/network-request-failed": "Network error. Check your connection."
    };
    return map[code] || "An error occurred. Please try again.";
}

// --- Wiki App Events ---

function bindAppEvents() {
    const editBtn = document.getElementById("edit-mode-btn");
    editBtn.addEventListener("click", () => {
        isEditMode = !isEditMode;
        if (!isEditMode) autoSave();
        updateGlobalEditButtonUI();
        if (activePageId) {
            renderEditor(activePageId, isEditMode);
        }
    });

    document.getElementById("delete-page-btn").addEventListener("click", async () => {
        if (!activePageId) return;
        if (confirm("Delete this page permanently? This cannot be undone.")) {
            const id = activePageId;
            activePageId = null;
            await deletePage(id);
            const pages = await getPages();
            if (pages.length > 0) changeActivePage(pages[0].id, false);
            else refreshAppView();
        }
    });

    document.getElementById("new-page-btn").addEventListener("click", createNewPage);
    document.getElementById("create-first-page-btn").addEventListener("click", createNewPage);

    document.getElementById("doc-parent-select").addEventListener("change", async (e) => {
        if (!activePageId) return;
        const page = await getPage(activePageId);
        if (page) {
            page.parentId = e.target.value;
            await savePage(page);
            refreshSidebar(activePageId);
            renderBreadcrumbs();
        }
    });

    const titleInput = document.getElementById("doc-title-input");
    titleInput.addEventListener("input", () => {
        autoSave();
        const node = document.querySelector(`.node-item[data-id="${activePageId}"] .node-title`);
        if (node) node.innerText = titleInput.value.trim() || "Untitled Page";
    });
    titleInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") titleInput.blur();
    });

    // History panel open button
    document.getElementById("history-btn").addEventListener("click", async () => {
        if (!activePageId) return;
        openHistoryPanel(
            activePageId,
            (blocks, title) => {
                // Preview: temporarily render blocks read-only
                renderEditor(activePageId, false, blocks);
            },
            async (entry) => {
                // Restore: save the historical blocks as the new current version
                const page = await getPage(activePageId);
                if (page) {
                    page.blocks = entry.blocks;
                    page.title = entry.title;
                    await savePage(page);
                    changeActivePage(activePageId, false);
                }
            }
        );
    });

    window.addEventListener("eschaton_page_change", (e) => {
        if (e.detail?.pageId) changeActivePage(e.detail.pageId, false);
    });
}

async function createNewPage() {
    const newId = "page_" + Date.now() + "_" + Math.floor(Math.random() * 100);
    const newPage = { id: newId, title: "", parentId: "", tags: [], blocks: [], updatedAt: Date.now() };
    await savePage(newPage);
    changeActivePage(newId, true);
}

function updateGlobalEditButtonUI() {
    const editBtn = document.getElementById("edit-mode-btn");
    if (editBtn) {
        editBtn.classList.toggle("active", isEditMode);
        editBtn.innerHTML = isEditMode
            ? `<i class="fa-solid fa-eye"></i> View`
            : `<i class="fa-solid fa-pen"></i> Edit`;
    }
}

async function changeActivePage(pageId, forceEditMode = null) {
    activePageId = pageId;
    if (forceEditMode !== null) {
        isEditMode = forceEditMode;
        updateGlobalEditButtonUI();
    }
    closeHistoryPanel();

    // Silently update standard browser hash state for bookmarking
    if (window.location.hash !== `#${pageId}`) {
        window.history.pushState(null, null, `#${pageId}`);
    }

    await refreshAppView();
}

async function refreshAppView() {
    await refreshSidebar(activePageId);
    await renderEditor(activePageId, isEditMode);
    if (activePageId) {
        await renderBreadcrumbs();
        await refreshParentDropdown();
        await updateLocalMap();
    }
}

async function updateLocalMap() {
    if (!localMapInstance) return;
    localMapInstance.resize();
    const pages = await getPages();
    const { nodes, edges, folderGroups } = getConnections(pages);
    localMapInstance.setData(nodes, edges, folderGroups, activePageId);
}

async function renderBreadcrumbs() {
    const breadcrumbs = document.getElementById("doc-breadcrumbs");
    breadcrumbs.innerHTML = "";
    if (!activePageId) return;

    const pages = await getPages();
    const activePage = pages.find(p => p.id === activePageId);
    if (!activePage) return;

    const path = [];
    let current = activePage;
    while (current) {
        path.unshift(current);
        current = current.parentId ? pages.find(p => p.id === current.parentId) : null;
    }

    path.forEach((page, idx) => {
        const span = document.createElement("span");
        span.innerText = page.title || "Untitled";
        span.addEventListener("click", () => changeActivePage(page.id, false));
        breadcrumbs.appendChild(span);
        if (idx < path.length - 1) {
            const icon = document.createElement("i");
            icon.className = "fa-solid fa-chevron-right";
            breadcrumbs.appendChild(icon);
        }
    });
}

async function refreshParentDropdown() {
    const parentSelect = document.getElementById("doc-parent-select");
    const activePage = await getPage(activePageId);
    if (!activePage) return;

    const pages = await getPages();
    parentSelect.innerHTML = `<option value="">No Parent (Root Page)</option>`;
    pages.sort((a, b) => a.title.localeCompare(b.title));

    pages.forEach(p => {
        if (p.id !== activePageId && !isDescendantOf(p, activePageId, pages)) {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.innerText = p.title || "Untitled Page";
            if (p.id === activePage.parentId) opt.selected = true;
            parentSelect.appendChild(opt);
        }
    });
}

function initMaps() {
    localMapInstance = new InteractiveMap("local-node-canvas", {
        isLocal: true,
        onNodeClick: (pageId) => {
            changeActivePage(pageId, false);
        }
    });
    localMapInstance.startLoop();

    fullMapInstance = new InteractiveMap("full-universe-canvas", {
        isLocal: false,
        onNodeClick: (pageId) => {
            changeActivePage(pageId, false);
            document.getElementById("full-map-modal").classList.add("hidden");
        }
    });

    window.addEventListener("resize", () => {
        if (localMapInstance) localMapInstance.resize();
        if (fullMapInstance) fullMapInstance.resize();
    });

    // Map Trigger Events
    document.getElementById("toggle-full-map-btn").addEventListener("click", async () => {
        document.getElementById("full-map-modal").classList.remove("hidden");
        fullMapInstance.resize();
        const pages = await getPages();
        const { nodes, edges, folderGroups } = getConnections(pages);
        fullMapInstance.setData(nodes, edges, folderGroups, activePageId);
        fullMapInstance.startLoop();
    });

    document.getElementById("close-full-map-btn").addEventListener("click", () => {
        document.getElementById("full-map-modal").classList.add("hidden");
        fullMapInstance.stopLoop();
    });

    window.addEventListener("hashchange", async () => {
        const hashId = window.location.hash.substring(1);
        if (hashId && hashId !== activePageId) {
            const pages = await getPages();
            if (pages.some(p => p.id === hashId)) {
                changeActivePage(hashId, false);
            }
        }
    });
}

function isDescendantOf(page, targetId, pagesList) {
    let parentId = page.parentId;
    while (parentId) {
        if (parentId === targetId) return true;
        const parent = pagesList.find(p => p.id === parentId);
        parentId = parent ? parent.parentId : null;
    }
    return false;
}
