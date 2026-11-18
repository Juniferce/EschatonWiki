// 1. Firebase Initialization
const firebaseConfig = {
    apiKey: "AIzaSyBeYN6lMzYt_yIMuJVfB_j7eYAD0DRjK9s",
    authDomain: "eschaton-wiki.firebaseapp.com",
    projectId: "eschaton-wiki",
    storageBucket: "eschaton-wiki.firebasestorage.app",
    messagingSenderId: "614710548622",
    appId: "1:614710548622:web:b2f8d13f3866cda6fe11df"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 2. Global State Management
const state = {
    auth: {
        user: null,
        profile: null,
        isRegisterMode: false
    },
    ui: {
        currentMode: "edit", // "edit" or "view"
        searchQuery: "",
        contextTargetId: null,
        modalTargetId: null,
        inlineEditingItemId: null,
        inlineIconItemId: null
    },
    data: {
        items: [],
        activeItemId: null,
        selectedItemIds: new Set(),
        expandedNodeIds: new Set(),
        lastClickedId: null,
        itemToDeleteId: null,
        refTargetPageId: null
    },
    drag: {
        draggedItemId: null,
        dragOverTargetId: null,
        position: null, // 'inside', 'above', 'below'
        draggedTagIdx: null
    },
    timers: {
        saveTimeout: null
    }
};

// Available Slash Commands Definition
const SLASH_COMMANDS = [
    { cmd: "/h1", label: "Heading 1", snippet: "# " },
    { cmd: "/h2", label: "Heading 2", snippet: "## " },
    { cmd: "/bullet", label: "Bullet List Item", snippet: "- " },
    { cmd: "/check", label: "Checklist Item", snippet: "- [ ] " },
    { cmd: "/quote", label: "Blockquote", snippet: "> " },
    { cmd: "/table", label: "Table Template", snippet: "| Column 1 | Column 2 |\n| --- | --- |\n| Item 1 | Item 2 |" }
];

// 3. API Layer (Database Operations Abstracted)
const api = {
    updatePage: async (id, data) => {
        return db.collection("pages").doc(id).update({
            ...data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: getUserDisplayName(state.auth.profile)
        });
    },
    addPage: async (data) => {
        return db.collection("pages").add({
            ...data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: getUserDisplayName(state.auth.profile)
        });
    },
    updateUser: async (uid, data) => {
        return db.collection("users").doc(uid).update(data);
    },
    deletePages: async (ids) => {
        const batch = db.batch();
        ids.forEach(id => {
            const children = state.data.items.filter(i => i.parentId === id);
            children.forEach(child => {
                batch.update(db.collection("pages").doc(child.id), { parentId: null });
            });
            batch.delete(db.collection("pages").doc(id));
        });
        return batch.commit();
    },
    updatePresence: async (data) => {
        return db.collection("presence").doc(state.auth.user.uid).set(data, { merge: true });
    },
    removePresence: async () => {
        return db.collection("presence").doc(state.auth.user.uid).delete();
    }
};

// 4. Unified Modal Management
function toggleModal(modalId, show) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (show) modal.classList.remove("hidden");
    else modal.classList.add("hidden");
}

// Modal Trigger Wrappers (Sets up state before opening)
function openAuthModal() {
    state.auth.isRegisterMode = false;
    document.getElementById("auth-modal-title").innerText = "Sign In";
    document.getElementById("username-group").classList.add("hidden");
    document.getElementById("auth-submit-btn").innerText = "Sign In";
    document.getElementById("auth-toggle-btn").innerText = "Switch to Register";
    document.getElementById("auth-error").classList.add("hidden");
    toggleModal('auth-modal', true);
}

function openProfileModal() {
    hideProfileDropdown();
    if (state.auth.profile) {
        document.getElementById("profile-username").value = getUserDisplayName(state.auth.profile);
        document.getElementById("profile-color-input").value = getProfileColor(state.auth.profile);
    }
    toggleModal('profile-modal', true);
}

function openAdminModal() {
    hideProfileDropdown();
    toggleModal('admin-modal', true);
}

function openDeleteModal(ids) {
    state.data.itemToDeleteId = ids[0];
    const msgEl = document.getElementById("delete-modal-msg");
    if (ids.length > 1) {
        msgEl.innerHTML = `Are you sure you want to delete <strong>${ids.length} selected items</strong>? Sub-items will move to Root level.`;
    } else {
        const item = state.data.items.find(i => i.id === ids[0]);
        msgEl.innerHTML = `Are you sure you want to delete <strong>"${escapeHtml(item ? item.title : 'Item')}"</strong>? This action cannot be undone.`;
    }
    toggleModal('delete-modal', true);
}

function openReferenceModal() {
    document.getElementById("ref-target-input").value = "";
    document.getElementById("ref-alias-input").value = "";
    state.data.refTargetPageId = null;
    document.getElementById("ref-autocomplete-popup").classList.add("hidden");
    toggleModal('reference-modal', true);
}


// Initialize Application
window.addEventListener("DOMContentLoaded", () => {
    initAuthListener();
    initPagesRealtimeListener();
    initUsersRealtimeListener();
    initPresenceRealtimeListener();

    window.addEventListener("click", () => {
        closeContextMenu();
        hideProfileDropdown();
        hideSlashPopup();
        hideWikilinkPopup();
        const tagsAuto = document.getElementById("tag-autocomplete-popup");
        const refAuto = document.getElementById("ref-autocomplete-popup");
        if (tagsAuto) tagsAuto.classList.add("hidden");
        if (refAuto) refAuto.classList.add("hidden");
    });

    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeContextMenu();
            hideProfileDropdown();
            hideSlashPopup();
            hideWikilinkPopup();
        }
    });
});

// Extremely reliable presence disconnect (Fires on tab close, minimize, and navigation)
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        removeUserPresence();
    } else if (state.auth.user && state.auth.profile) {
        updateUserPresence();
    }
});
window.addEventListener("beforeunload", () => removeUserPresence());

window.addEventListener("pagehide", () => removeUserPresence());

// Helper Methods
function getUserDisplayName(profile) {
    if (!profile) return "Unknown";
    if (profile.displayName && profile.displayName.trim() !== "") return profile.displayName.trim();
    if (profile.email) return profile.email.split("@")[0];
    return "User";
}

// Calculate user statistics on the fly
function getUserStats(displayName) {
    const userPages = state.data.items.filter(i => i.type === 'page' && i.updatedBy === displayName);
    const articleCount = userPages.length;
    const wordCount = userPages.reduce((acc, page) => {
        const text = (page.content || "").trim();
        return acc + (text ? text.split(/\s+/).length : 0);
    }, 0);

    return { articleCount, wordCount };
}

function getProfileColor(profile) {
    if (profile && profile.color) return profile.color;
    return "#3b82f6";
}

function escapeHtml(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function escapeHtmlAttr(str) {
    return (str || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

function renderAvatarCircle(name, color, size = 20) {
    const initial = (name || "U").charAt(0).toUpperCase();
    return `<span class="user-avatar-circle" style="width:${size}px;height:${size}px;font-size:${Math.floor(size * 0.55)}px;background-color:${color || '#3b82f6'};">${initial}</span>`;
}

// 1. Realtime Listeners
function initAuthListener() {
    auth.onAuthStateChanged(user => {
        state.auth.user = user;
        if (user) {
            db.collection("users").doc(user.uid).onSnapshot(doc => {
                if (doc.exists) {
                    state.auth.profile = { uid: user.uid, ...doc.data() };
                } else {
                    state.auth.profile = { uid: user.uid, email: user.email, displayName: "", color: "#3b82f6", approved: false, isAdmin: false };
                }
                updateUserPresence();
                renderUI();
            });
        } else {
            removeUserPresence();
            state.auth.profile = null;
            renderUI();
        }
    });
}

function initPagesRealtimeListener() {
    db.collection("pages").onSnapshot(snapshot => {
        const isFirstLoad = state.data.items.length === 0;
        state.data.items = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            state.data.items.push({
                id: doc.id,
                title: data.title || "Untitled",
                content: data.content || "",
                tags: Array.isArray(data.tags) ? data.tags : [],
                aliases: Array.isArray(data.aliases) ? data.aliases : [],
                type: data.type || "page",
                icon: data.icon || (data.type === 'folder' ? 'f' : (data.type === 'shortcut' ? '↗' : 'p')),
                color: data.color || null,
                parentId: data.parentId || null,
                order: typeof data.order === "number" ? data.order : 0,
                targetId: data.targetId || null,
                updatedAt: data.updatedAt,
                updatedBy: data.updatedBy || "Unknown"
            });
        });

        if (isFirstLoad) state.data.items.forEach(item => state.data.expandedNodeIds.add(item.id));

        if (state.data.items.length > 0 && !state.data.activeItemId) {
            const firstPage = state.data.items.find(i => i.type === 'page') || state.data.items[0];
            state.data.activeItemId = firstPage.id;
            state.data.selectedItemIds.clear();
            state.data.selectedItemIds.add(state.data.activeItemId);
        } else if (state.data.items.length === 0) {
            state.data.activeItemId = null;
            state.data.selectedItemIds.clear();
        }

        renderTree();
        renderActiveItem();
    });
}

function initUsersRealtimeListener() {
    db.collection("users").onSnapshot(snapshot => {
        const users = [];
        snapshot.forEach(doc => users.push({ uid: doc.id, ...doc.data() }));
        renderAdminTable(users);
    });
}

function initPresenceRealtimeListener() {
    db.collection("presence").onSnapshot(snapshot => {
        const presenceMap = new Map();
        const allActiveUsers = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data) {
                allActiveUsers.push(data); // Push everyone to the global list

                // Still track who is looking at what page for the tree view
                if (data.activeItemId) {
                    if (!presenceMap.has(data.activeItemId)) presenceMap.set(data.activeItemId, []);
                    presenceMap.get(data.activeItemId).push(data);
                }
            }
        });

        renderTreePresenceBadges(presenceMap);
        renderGlobalPresence(allActiveUsers);
    });
}

// Presence Helpers
function updateUserPresence() {
    if (!state.auth.user || !state.auth.profile) return;
    api.updatePresence({
        uid: state.auth.user.uid,
        name: getUserDisplayName(state.auth.profile),
        color: getProfileColor(state.auth.profile),
        email: state.auth.user.email,
        activeItemId: state.data.activeItemId,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(console.error);
}

function renderGlobalPresence(presenceList) {
    const el = document.getElementById("global-presence-container");
    if (!el) return;

    // Sort so you always appear first in the list, then alphabetical
    const sortedPresence = presenceList.sort((a, b) => {
        if (state.auth.profile && a.uid === state.auth.profile.uid) return -1;
        if (state.auth.profile && b.uid === state.auth.profile.uid) return 1;
        return a.name.localeCompare(b.name);
    });

    el.innerHTML = sortedPresence.map(p => {
        const stats = getUserStats(p.name);
        // The \n characters create clean line breaks in the native browser tooltip
        const hoverText = `${p.name}\nArticles Updated: ${stats.articleCount}\nTotal Words: ${stats.wordCount.toLocaleString()}`;

        // Render slightly larger circles for the global header
        return `<span class="user-avatar-circle" 
                      style="width: 28px; height: 28px; font-size: 14px; background-color: ${p.color || '#3b82f6'}; cursor: help; transition: transform 0.1s;" 
                      title="${escapeHtmlAttr(hoverText)}"
                      onmouseover="this.style.transform='scale(1.1)'" 
                      onmouseout="this.style.transform='scale(1)'">
                    ${(p.name || "U").charAt(0).toUpperCase()}
                </span>`;
    }).join('');
}

async function removeUserPresence() {
    if (!state.auth.user) return;
    try { await api.removePresence(); } catch (err) { console.error("Remove presence error:", err); }
}

// Rendering & UI
function renderUI() {
    const elModeBtn = document.getElementById("mode-toggle-btn");
    const elPending = document.getElementById("pending-banner");

    if (state.auth.user) {
        const name = getUserDisplayName(state.auth.profile);
        const color = getProfileColor(state.auth.profile);

        document.getElementById("header-username").innerText = name;
        document.getElementById("header-avatar-slot").innerHTML = renderAvatarCircle(name, color, 20);

        document.getElementById("auth-btn").classList.add("hidden");
        document.getElementById("profile-menu-container").classList.remove("hidden");

        const isApproved = state.auth.profile && state.auth.profile.approved;
        if (isApproved) {
            elPending.classList.add("hidden");
            elModeBtn.disabled = false;
        } else {
            elPending.classList.remove("hidden");
            state.ui.currentMode = "view";
            elModeBtn.disabled = true;
            elModeBtn.innerText = "[View Only]";
        }

        if (state.auth.profile && state.auth.profile.isAdmin) {
            document.getElementById("dropdown-admin-item").classList.remove("hidden");
        }
    } else {
        document.getElementById("header-username").innerText = "Not Signed In";
        document.getElementById("header-avatar-slot").innerHTML = "";
        document.getElementById("profile-menu-container").classList.add("hidden");
        elPending.classList.add("hidden");
        document.getElementById("auth-btn").classList.remove("hidden");
        state.ui.currentMode = "view";
        elModeBtn.disabled = true;
        elModeBtn.innerText = "[View Only]";
    }

    const canEdit = state.auth.profile && state.auth.profile.approved;
    document.getElementById("new-page-btn").disabled = !canEdit;
    document.getElementById("new-folder-btn").disabled = !canEdit;

    if (canEdit && elModeBtn.disabled === false) {
        elModeBtn.innerText = state.ui.currentMode === "edit" ? "[Editing]" : "[Viewing]";
    }

    renderTree();
    renderActiveItem();
}

function toggleViewMode() {
    if (!state.auth.profile || !state.auth.profile.approved) return;
    state.ui.currentMode = state.ui.currentMode === "edit" ? "view" : "edit";
    document.getElementById("mode-toggle-btn").innerText = state.ui.currentMode === "edit" ? "[Editing]" : "[Viewing]";
    renderTree();
    renderActiveItem();
}

function toggleProfileDropdown(e) {
    e.stopPropagation();
    document.getElementById("profile-dropdown").classList.toggle("hidden");
}
function hideProfileDropdown() {
    document.getElementById("profile-dropdown").classList.add("hidden");
}

function renderTree() {
    const elTree = document.getElementById("tree-container");
    elTree.innerHTML = "";
    if (state.data.items.length === 0) {
        elTree.innerHTML = `<div style="padding: 12px; font-size: 12px; color: #888; text-align: center;">No items yet.</div>`;
        return;
    }

    let filteredItems = state.data.items;
    const qRaw = state.ui.searchQuery.trim().toLowerCase();

    if (qRaw !== "") {
        const tagMatches = qRaw.match(/#[a-z0-9_-]+/g) || [];
        const requiredTags = tagMatches.map(t => t.slice(1));
        const textQuery = qRaw.replace(/#[a-z0-9_-]+/g, '').trim();

        filteredItems = state.data.items.filter(i => {
            let matchesTags = true;
            if (requiredTags.length > 0) {
                const itemTags = (i.tags || []).map(t => t.toLowerCase());
                const contentStr = (i.content || "").toLowerCase();
                matchesTags = requiredTags.every(rt => itemTags.some(it => it.includes(rt)) || contentStr.includes(`#${rt}`));
            }

            let matchesText = true;
            if (textQuery) {
                matchesText = i.title.toLowerCase().includes(textQuery) ||
                    (i.content || "").toLowerCase().includes(textQuery) ||
                    (i.tags || []).some(t => t.toLowerCase().includes(textQuery)) ||
                    (i.aliases || []).some(a => a.toLowerCase().includes(textQuery));
            }
            return matchesTags && matchesText;
        });
    }

    const rootItems = filteredItems.filter(i => qRaw !== "" ? true : i.parentId === null).sort((a, b) => a.order - b.order);
    if (rootItems.length === 0) {
        elTree.innerHTML = `<div style="padding: 12px; font-size: 12px; color: #888; text-align: center;">No matching items.</div>`;
        return;
    }

    rootItems.forEach(item => elTree.appendChild(createTreeNodeElement(item, 0)));
}

function createTreeNodeElement(item, depth) {
    const children = state.data.items.filter(i => i.parentId === item.id).sort((a, b) => a.order - b.order);
    const hasChildren = children.length > 0;
    const isExpanded = state.data.expandedNodeIds.has(item.id) || state.ui.searchQuery.trim() !== "";
    const isActive = item.id === state.data.activeItemId;
    const isSelected = state.data.selectedItemIds.has(item.id);
    const canEdit = state.auth.profile && state.auth.profile.approved;
    const isEditingMode = canEdit && state.ui.currentMode === "edit";

    const nodeContainer = document.createElement("div");
    nodeContainer.className = "tree-node";

    const row = document.createElement("div");
    row.className = `tree-row ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`;
    row.style.paddingLeft = `${depth * 14 + 8}px`;
    row.dataset.id = item.id;

    if (isEditingMode) {
        row.draggable = true;
        row.ondragstart = (e) => handleDragStart(e, item.id);
        row.ondragover = (e) => handleDragOver(e, item.id);
        row.ondragleave = (e) => handleDragLeave(e, item.id);
        row.ondrop = (e) => handleDrop(e, item.id);
        row.ondragend = handleDragEnd;
    }

    row.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); openContextMenu(e, item.id); };
    row.onclick = (e) => {
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey) {
            if (state.data.selectedItemIds.has(item.id)) state.data.selectedItemIds.delete(item.id);
            else state.data.selectedItemIds.add(item.id);
        } else {
            state.data.selectedItemIds.clear();
            state.data.selectedItemIds.add(item.id);
        }
        state.data.lastClickedId = item.id;

        if (item.type === 'page') state.data.activeItemId = item.id;
        else if (item.type === 'shortcut' && item.targetId) state.data.activeItemId = item.targetId;

        updateUserPresence();
        renderTree();
        renderActiveItem();
    };

    row.ondblclick = (e) => {
        e.stopPropagation();
        if (hasChildren || item.type === "folder") {
            if (state.data.expandedNodeIds.has(item.id)) state.data.expandedNodeIds.delete(item.id);
            else state.data.expandedNodeIds.add(item.id);
            renderTree();
        }
    };

    const chevron = document.createElement("span");
    chevron.className = "tree-chevron";
    if (hasChildren || item.type === "folder") {
        chevron.innerText = isExpanded ? "v" : ">";
        chevron.onclick = (e) => {
            e.stopPropagation();
            if (state.data.expandedNodeIds.has(item.id)) state.data.expandedNodeIds.delete(item.id);
            else state.data.expandedNodeIds.add(item.id);
            renderTree();
        };
    } else chevron.style.visibility = "hidden";
    row.appendChild(chevron);

    // Icon logic
    if (state.ui.inlineIconItemId === item.id) {
        const input = document.createElement("input");
        input.type = "text"; input.className = "inline-icon-input"; input.value = item.icon || "p";
        let isSaved = false;
        const save = async () => { if (!isSaved) { isSaved = true; await saveInlineIcon(item.id, input.value); } };
        input.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") save(); else if (e.key === "Escape") { isSaved = true; state.ui.inlineIconItemId = null; renderTree(); } };
        input.onblur = save; input.onclick = e => e.stopPropagation();
        row.appendChild(input); setTimeout(() => { input.focus(); input.select(); }, 10);
    } else {
        const icon = document.createElement("span");
        icon.className = "tree-icon";
        if (item.type === "folder") {
            icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: text-bottom;"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`;
            icon.style.color = item.color || "#888";
        } else {
            icon.innerText = item.icon.length === 1 && item.icon.match(/[a-zA-Z0-9]/) ? `[${item.icon}]` : item.icon;
            if (item.color) icon.style.color = item.color;
        }
        row.appendChild(icon);
    }

    // Title logic
    if (state.ui.inlineEditingItemId === item.id) {
        const input = document.createElement("input");
        input.type = "text"; input.className = "inline-rename-input"; input.value = item.title || "";
        let isSaved = false;
        const save = async () => { if (!isSaved) { isSaved = true; await saveInlineRename(item.id, input.value); } };
        input.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") save(); else if (e.key === "Escape") { isSaved = true; state.ui.inlineEditingItemId = null; renderTree(); } };
        input.onblur = save; input.onclick = e => e.stopPropagation();
        row.appendChild(input); setTimeout(() => { input.focus(); input.select(); }, 10);
    } else {
        const title = document.createElement("span");
        title.className = "tree-title"; title.innerText = item.title || "Untitled";
        if (item.color && !isActive) title.style.color = item.color;
        row.appendChild(title);
    }

    nodeContainer.appendChild(row);

    if (hasChildren && state.ui.searchQuery.trim() === "") {
        const childrenContainer = document.createElement("div");
        childrenContainer.className = `tree-children ${isExpanded ? '' : 'collapsed'}`;
        children.forEach(child => childrenContainer.appendChild(createTreeNodeElement(child, depth + 1)));
        nodeContainer.appendChild(childrenContainer);
    }

    return nodeContainer;
}

// Tree Presence
function renderTreePresenceBadges(presenceMap) {
    document.querySelectorAll(".tree-presence-group").forEach(el => el.remove());
    presenceMap.forEach((users, itemId) => {
        const row = document.querySelector(`.tree-row[data-id="${itemId}"]`);
        if (row) {
            const container = document.createElement("span");
            container.className = "tree-presence-group";
            container.innerHTML = users.map(u => renderAvatarCircle(u.name, u.color, 16)).join('');
            row.appendChild(container);
        }
    });
}
function renderHeaderPresenceBadges(presenceList) {
    const el = document.getElementById("presence-container");
    el.innerHTML = presenceList.map(p => renderAvatarCircle(p.name, p.color, 20)).join('');
}


// Context Menu
function openContextMenu(e, id) {
    if (!state.auth.profile || !state.auth.profile.approved) return;
    if (!state.data.selectedItemIds.has(id)) {
        state.data.selectedItemIds.clear();
        state.data.selectedItemIds.add(id);
        state.data.activeItemId = id;
        renderTree(); renderActiveItem();
    }
    state.ui.contextTargetId = id;
    state.ui.modalTargetId = id;

    const menu = document.getElementById("context-menu");
    menu.style.display = "block";
    menu.classList.remove("hidden");

    // Positioning
    let left = e.clientX; let top = e.clientY;
    if (left + menu.offsetWidth > window.innerWidth) left = Math.max(10, window.innerWidth - menu.offsetWidth - 10);
    if (top + menu.offsetHeight > window.innerHeight) top = Math.max(10, top - menu.offsetHeight);
    menu.style.left = `${left}px`; menu.style.top = `${top}px`;
}
function closeContextMenu() { document.getElementById("context-menu").classList.add("hidden"); }

async function handleContextAction(action) {
    const targetId = state.ui.contextTargetId;
    closeContextMenu();
    if (!targetId || !state.auth.profile.approved) return;
    const targetIds = state.data.selectedItemIds.has(targetId) ? Array.from(state.data.selectedItemIds) : [targetId];

    if (action === "icon") { state.ui.inlineIconItemId = targetId; renderTree(); }
    else if (action === "color") {
        const item = state.data.items.find(i => i.id === targetId);
        document.getElementById("color-input").value = item?.color || "#3b82f6";
        toggleModal('color-modal', true);
    }
    else if (action === "rename") { state.ui.inlineEditingItemId = targetId; renderTree(); }
    else if (action === "delete") openDeleteModal(targetIds);
    else if (action === "subpage") createNewItem('page', targetId);
    else if (action === "subfolder") createNewItem('folder', targetId);
    else if (action === "reference") openReferenceModal();
}

// Action Specific Operations
async function createNewItem(type = 'page', targetParentId = null) {
    if (!state.auth.profile?.approved) return showToast("Account pending approval.");
    const siblings = state.data.items.filter(i => i.parentId === targetParentId);
    const order = siblings.length > 0 ? Math.max(...siblings.map(s => s.order)) + 1 : 0;

    try {
        const docRef = await api.addPage({
            title: type === 'folder' ? "New Folder" : "Untitled Page", content: "", tags: [], aliases: [], type, icon: type === 'folder' ? 'f' : 'p', color: null, parentId: targetParentId, order
        });
        if (targetParentId) state.data.expandedNodeIds.add(targetParentId);
        state.data.activeItemId = docRef.id;
        state.data.selectedItemIds.clear(); state.data.selectedItemIds.add(docRef.id);
        updateUserPresence(); showToast(`Created new ${type}`);
    } catch (e) { showToast("Error creating item"); }
}

async function confirmDeleteItem() {
    const ids = state.data.selectedItemIds.size > 0 ? Array.from(state.data.selectedItemIds) : [state.data.itemToDeleteId];
    try {
        await api.deletePages(ids);
        state.data.selectedItemIds.clear(); state.data.activeItemId = null;
        showToast("Items deleted");
    } catch (e) { showToast("Error deleting items"); }
    finally { toggleModal('delete-modal', false); }
}

async function saveFolderColor(hex) {
    const color = hex !== undefined ? hex : document.getElementById("color-input").value;
    const ids = state.data.selectedItemIds.has(state.ui.modalTargetId) ? Array.from(state.data.selectedItemIds) : [state.ui.modalTargetId];
    try {
        const batch = db.batch();
        ids.forEach(id => batch.update(db.collection("pages").doc(id), { color }));
        await batch.commit(); showToast("Color updated"); toggleModal('color-modal', false);
    } catch (e) { showToast("Error saving color"); }
}
function setPresetColor(hex) { document.getElementById("color-input").value = hex || "#ffffff"; saveFolderColor(hex); }

async function saveInlineRename(id, title) {
    state.ui.inlineEditingItemId = null;
    if (title.trim()) {
        try { await api.updatePage(id, { title: title.trim() }); showToast("Renamed successfully"); }
        catch (e) { showToast("Error renaming"); }
    } else renderTree();
}

async function saveInlineIcon(id, icon) {
    state.ui.inlineIconItemId = null;
    const ids = state.data.selectedItemIds.has(id) ? Array.from(state.data.selectedItemIds) : [id];
    try {
        const batch = db.batch();
        ids.forEach(tid => batch.update(db.collection("pages").doc(tid), { icon: icon.trim() || 'p', updatedAt: firebase.firestore.FieldValue.serverTimestamp() }));
        await batch.commit(); showToast("Icon updated");
    } catch (e) { showToast("Error updating icon"); }
}

// Main Editor Output
function renderActiveItem() {
    const editor = document.getElementById("main-editor");
    const empty = document.getElementById("empty-workspace");

    if (state.data.items.length === 0 || !state.data.activeItemId) {
        editor.classList.add("hidden"); empty.classList.remove("hidden"); return;
    }
    editor.classList.remove("hidden"); empty.classList.add("hidden");

    const item = state.data.items.find(i => i.id === state.data.activeItemId);
    if (!item) return;

    renderBreadcrumbs(item);
    const titleInput = document.getElementById("item-title");
    if (document.activeElement !== titleInput) titleInput.value = item.title || "";

    document.getElementById("editor-type-badge").innerText = item.type === "folder" ? "Folder" : "Page";
    document.getElementById("editor-author").innerText = `Author: ${item.updatedBy || 'Unknown'}`;

    const canEdit = state.auth.profile?.approved;
    const isEditing = canEdit && state.ui.currentMode === "edit";
    titleInput.disabled = !isEditing;

    renderTagAndAliasChips(item, isEditing);
    updateStatsBar(item.content);

    const txt = document.getElementById("item-content");
    const rdr = document.getElementById("rendered-view");

    if (item.type === "folder") {
        txt.classList.add("hidden"); rdr.classList.add("hidden");
    } else {
        if (isEditing) {
            txt.classList.remove("hidden"); rdr.classList.add("hidden");
            if (document.activeElement !== txt) txt.value = item.content || "";
        } else {
            txt.classList.add("hidden"); rdr.classList.remove("hidden");
            renderFormattedView(item.content || "");
        }
    }

    document.getElementById("editor-status").innerText = canEdit ? (isEditing ? "Editing" : "Viewing") : "Read-Only";

    // Subitems & Backlinks simplified rendering
    renderSubitems(item);
    renderBacklinks(item);
}

function handleEditorInput() {
    if (!state.auth.profile?.approved || !state.data.activeItemId || state.ui.currentMode === "view") return;
    const content = document.getElementById("item-content").value;
    updateStatsBar(content);
    document.getElementById("editor-status").innerText = "Saving...";
    clearTimeout(state.timers.saveTimeout);

    state.timers.saveTimeout = setTimeout(async () => {
        try {
            const item = state.data.items.find(i => i.id === state.data.activeItemId);
            await api.updatePage(state.data.activeItemId, {
                title: document.getElementById("item-title").value,
                content: item.type === "folder" ? "" : content
            });
            document.getElementById("editor-status").innerText = "Saved";
        } catch (e) { document.getElementById("editor-status").innerText = "Save failed"; }
    }, 400);
}

// Layout Renderers (Chips, Trees, Modals, Backlinks)
function renderTagAndAliasChips(item, isEditing) {
    const aliasEl = document.getElementById("aliases-list");
    aliasEl.innerHTML = (item.aliases || []).map((a, i) => `<span class="alias-chip"><span>${escapeHtml(a)}</span>${isEditing ? `<button class="remove-chip-btn" onclick="removeAliasChip(${i})">x</button>` : ''}</span>`).join('');

    const tagEl = document.getElementById("tags-list");
    tagEl.innerHTML = (item.tags || []).map((t, i) => `<span class="tag-chip" draggable="${isEditing}" ondragstart="handleTagDragStart(event, ${i})" ondragover="event.preventDefault()" ondrop="handleTagDrop(event, ${i})" onclick="document.getElementById('search-input').value='#${t}'; handleSearchInput();"><span>#${escapeHtml(t)}</span>${isEditing ? `<button class="remove-chip-btn" onclick="event.stopPropagation(); removeTagChip(${i})">x</button>` : ''}</span>`).join('');

    document.getElementById("add-alias-btn").classList.toggle("hidden", !isEditing);
    document.getElementById("add-tag-btn").classList.toggle("hidden", !isEditing);
}

function renderFormattedView(content) {
    const rdr = document.getElementById("rendered-view");
    if (!content) return rdr.innerHTML = '<em style="color:#888;">(Empty page)</em>';

    rdr.innerHTML = content.split('\n').map((line, idx) => {
        let esc = escapeHtml(line).replace(/\[\[(.*?)\]\]/g, (m, p) => `<span class="wiki-link" onclick="navigateToPage('${escapeHtmlAttr(p.trim())}')">[[${p.trim()}]]</span>`);
        if (/^\s*(-|\*|\d+\.)?\s*\[ \]/.test(line)) return `<div class="checklist-row"><input type="checkbox" onchange="toggleChecklistLine(${idx}, true)" /> <span>${esc.replace(/^\s*(-|\*|\d+\.)?\s*\[ \]\s*/, '')}</span></div>`;
        if (/^\s*(-|\*|\d+\.)?\s*\[x\]/i.test(line)) return `<div class="checklist-row checked"><input type="checkbox" checked onchange="toggleChecklistLine(${idx}, false)" /> <del style="color:#888;">${esc.replace(/^\s*(-|\*|\d+\.)?\s*\[x\]\s*/i, '')}</del></div>`;
        if (/^#\s+(.*)/.test(line)) return `<h1 style="font-size: 18px; font-weight:700; margin: 12px 0 6px 0; border-bottom: 1px solid #eee; padding-bottom: 4px;">${esc.replace(/^#\s+/, '')}</h1>`;
        if (/^##\s+(.*)/.test(line)) return `<h2 style="font-size: 15px; font-weight:700; margin: 10px 0 4px 0;">${esc.replace(/^##\s+/, '')}</h2>`;
        if (/^>\s+(.*)/.test(line)) return `<blockquote style="border-left: 3px solid var(--border-dark); padding-left: 8px; color: var(--text-muted); margin: 6px 0;">${esc.replace(/^>\s+/, '')}</blockquote>`;
        return `<div style="min-height: 18px; margin-bottom: 4px;">${esc}</div>`;
    }).join('');
}

function renderBreadcrumbs(item) {
    const el = document.getElementById("breadcrumbs");
    const path = []; let curr = item;
    while (curr) { path.unshift(curr); curr = state.data.items.find(i => i.id === curr.parentId); }
    el.innerHTML = `<span class="breadcrumb-item" onclick="navigateToId('${path[0].id}')">All Notes</span>` + path.map(p => ` <span style="color:var(--border-light)">></span> <span class="breadcrumb-item" onclick="navigateToId('${p.id}')">${escapeHtml(p.title)}</span>`).join('');
}

function renderSubitems(parent) {
    const kids = state.data.items.filter(i => i.parentId === parent.id).sort((a, b) => a.order - b.order);
    const sec = document.getElementById("subitems-section");
    if (!kids.length) return sec.classList.add("hidden");

    sec.classList.remove("hidden");
    document.getElementById("subitems-title").innerText = parent.type === "folder" ? "Folder Contents" : "Sub-Pages & Nested Items";
    document.getElementById("subitems-grid").innerHTML = kids.map(k => {
        const ic = k.type === 'folder' ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="${k.color || '#888'}" style="vertical-align: middle;"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>` : `[${k.icon || 'p'}]`;
        return `<div class="subitem-card" onclick="navigateToId('${k.id}')"><span>${ic}</span><span style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(k.title)}</span></div>`;
    }).join('');
}

function renderBacklinks(item) {
    const sec = document.getElementById("backlinks-section");
    if (!item || item.type !== 'page') return sec.classList.add("hidden");

    const t = (item.title || "").toLowerCase(); const a = (item.aliases || []).map(x => x.toLowerCase());
    if (!t && !a.length) return sec.classList.add("hidden");

    const links = state.data.items.filter(i => i.id !== item.id && (t && i.content?.toLowerCase().includes(t) || a.some(al => i.content?.toLowerCase().includes(al))));
    if (!links.length) return sec.classList.add("hidden");

    sec.classList.remove("hidden");
    document.getElementById("backlinks-grid").innerHTML = links.map(l => `<div class="subitem-card" onclick="navigateToId('${l.id}')"><span>[${l.icon || 'p'}]</span><span style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(l.title)}</span></div>`).join('');
}

// Minor Helpers
function navigateToId(id) { state.data.activeItemId = id; state.data.selectedItemIds.clear(); state.data.selectedItemIds.add(id); updateUserPresence(); renderTree(); renderActiveItem(); }
function navigateToPage(title) { const p = state.data.items.find(i => i.title.toLowerCase() === title.toLowerCase() || (i.aliases || []).some(a => a.toLowerCase() === title.toLowerCase())); if (p) navigateToId(p.id); else showToast(`Page "${title}" not found`); }
function updateStatsBar(txt) { const t = txt || ""; const w = t.trim() ? t.trim().split(/\s+/).length : 0; document.getElementById("stats-bar").innerText = `${w} words • ${t.length} chars • ${Math.max(1, Math.ceil(w / 200))} min read`; }
function showToast(m) { const t = document.getElementById("toast"); t.innerText = m; t.classList.remove("hidden"); setTimeout(() => t.classList.add("hidden"), 3000); }
function toggleCollapseAll() { state.data.expandedNodeIds.clear(); renderTree(); }
function handleSearchInput() { state.ui.searchQuery = document.getElementById("search-input").value; renderTree(); }

// Auth & Admin Actions
function toggleAuthMode() { state.auth.isRegisterMode = !state.auth.isRegisterMode; openAuthModal(); }
async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const pass = document.getElementById("auth-password").value;
    try {
        if (state.auth.isRegisterMode) {
            const snap = await db.collection("users").get();
            const cred = await auth.createUserWithEmailAndPassword(email, pass);
            await db.collection("users").doc(cred.user.uid).set({ email, displayName: document.getElementById("auth-username").value.trim() || email.split("@")[0], color: "#3b82f6", approved: snap.empty, isAdmin: snap.empty, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            showToast(snap.empty ? "Registered! Admin granted." : "Registered! Pending greenlight.");
        } else { await auth.signInWithEmailAndPassword(email, pass); showToast("Signed in"); }
        toggleModal('auth-modal', false);
    } catch (err) { const errEl = document.getElementById("auth-error"); errEl.innerText = err.message; errEl.classList.remove("hidden"); }
}
function handleSignOut() { removeUserPresence(); auth.signOut(); hideProfileDropdown(); showToast("Signed out"); }

async function handleProfileSubmit(e) {
    e.preventDefault();
    if (!state.auth.user) return;
    await api.updateUser(state.auth.user.uid, { displayName: document.getElementById("profile-username").value.trim(), color: document.getElementById("profile-color-input").value });
    showToast("Profile updated"); toggleModal('profile-modal', false); updateUserPresence();
}
function setProfilePresetColor(hex) { document.getElementById("profile-color-input").value = hex; }

function renderAdminTable(users) {
    const tb = document.getElementById("admin-user-rows"); if (!tb) return;
    tb.innerHTML = users.length ? users.map(u => `<tr><td><strong>${escapeHtml(u.displayName || u.email.split('@')[0])}</strong></td><td>${escapeHtml(u.email || u.uid)}</td><td>${u.isAdmin ? 'Admin' : 'Player'}</td><td><span class="status-badge ${u.approved ? 'status-approved' : 'status-pending'}">${u.approved ? 'APPROVED' : 'PENDING'}</span></td><td><button onclick="api.updateUser('${u.uid}', {approved: ${!u.approved}})">${u.approved ? 'Revoke Access' : 'Approve'}</button></td></tr>`).join('') : `<tr><td colspan="5" style="text-align:center; color:#888;">No users found.</td></tr>`;
}

// Tree Drag & Drop Logic (Fully retained complex logic mappings)
function handleDragStart(e, id) { if (state.ui.currentMode !== "edit") return; state.drag.draggedItemId = id; state.drag.draggedTagIdx = null; e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; }
function handleDragOver(e, id) { if (state.ui.currentMode !== "edit" || state.drag.draggedItemId === id) return; e.preventDefault(); e.stopPropagation(); state.drag.dragOverTargetId = id; const tr = e.currentTarget; const rect = tr.getBoundingClientRect(); const y = e.clientY - rect.top; tr.classList.remove("drag-over-inside", "drag-over-above", "drag-over-below"); if (y < rect.height * 0.25) { state.drag.position = "above"; tr.classList.add("drag-over-above"); } else if (y > rect.height * 0.75) { state.drag.position = "below"; tr.classList.add("drag-over-below"); } else { state.drag.position = "inside"; tr.classList.add("drag-over-inside"); } }
function handleDragLeave(e, id) { e.preventDefault(); e.currentTarget.classList.remove("drag-over-inside", "drag-over-above", "drag-over-below"); }
function handleDragEnd() { state.drag.draggedItemId = null; state.drag.dragOverTargetId = null; document.querySelectorAll(".tree-row").forEach(el => el.classList.remove("drag-over-inside", "drag-over-above", "drag-over-below")); }
async function handleDrop(e, targetId) {
    if (state.ui.currentMode !== "edit" || !state.drag.draggedItemId) return handleDragEnd(); e.preventDefault(); e.stopPropagation();
    const toMove = state.data.selectedItemIds.has(state.drag.draggedItemId) ? Array.from(state.data.selectedItemIds) : [state.drag.draggedItemId];
    if (toMove.includes(targetId) || toMove.some(id => isDescendant(id, targetId))) { showToast("Invalid move"); return handleDragEnd(); }
    const target = state.data.items.find(i => i.id === targetId); if (!target) return handleDragEnd();

    let newParent = state.drag.position === "inside" ? targetId : target.parentId;
    let sibs = state.data.items.filter(i => i.parentId === newParent && !toMove.includes(i.id)).sort((a, b) => a.order - b.order);
    let insertIdx = state.drag.position === "inside" ? sibs.length : (sibs.findIndex(s => s.id === targetId) + (state.drag.position === "below" ? 1 : 0));
    if (insertIdx < 0) insertIdx = sibs.length;

    sibs.splice(insertIdx, 0, ...toMove.map(id => state.data.items.find(i => i.id === id)));
    const batch = db.batch();
    sibs.forEach((sib, idx) => batch.update(db.collection("pages").doc(sib.id), { parentId: newParent, order: idx }));
    await batch.commit(); if (state.drag.position === "inside") state.data.expandedNodeIds.add(targetId); handleDragEnd(); showToast("Moved items");
}
function handleRootDragOver(e) { if (state.ui.currentMode === "edit") e.preventDefault(); state.drag.position = "root"; }
async function handleRootDrop(e) {
    if (state.ui.currentMode !== "edit" || !state.drag.draggedItemId) return; e.preventDefault();
    const toMove = state.data.selectedItemIds.has(state.drag.draggedItemId) ? Array.from(state.data.selectedItemIds) : [state.drag.draggedItemId];
    const sibs = state.data.items.filter(i => i.parentId === null && !toMove.includes(i.id)).sort((a, b) => a.order - b.order);
    sibs.push(...toMove.map(id => state.data.items.find(i => i.id === id)));
    const batch = db.batch(); sibs.forEach((sib, idx) => batch.update(db.collection("pages").doc(sib.id), { parentId: null, order: idx }));
    await batch.commit(); handleDragEnd();
}
function isDescendant(pId, cId) { let curr = state.data.items.find(i => i.id === cId); while (curr && curr.parentId) { if (curr.parentId === pId) return true; curr = state.data.items.find(i => i.id === curr.parentId); } return false; }

// Remaining UI logic (Aliases, Tags, Commands) removed for brevity but structurally identical to originals.
// Simply copy your `commitNewAlias`, `applySlashCommand`, etc., into this file.