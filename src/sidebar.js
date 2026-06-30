/*
   Eschaton Wiki - Sidebar & Navigation Controller (sidebar.js)
   Manages page hierarchy lists, searching, tags cloud filtering, configurations, and backup/restore.
*/

import { getPages, restoreDatabase } from "./db.js";

let activePageId = null;
let expandedNodes = new Set(); // Tracks pageIds that are expanded in tree
let selectedTag = null;
let searchQuery = "";

// Initialize sidebar events
export function initSidebar() {
    // 1. Sidebar toggle behavior
    const toggleBtn = document.getElementById("sidebar-toggle-btn");
    const expandBtn = document.getElementById("sidebar-expand-btn");
    const sidebar = document.getElementById("sidebar");
    
    toggleBtn.addEventListener("click", () => {
        sidebar.classList.add("collapsed");
        expandBtn.classList.remove("hidden");
    });

    expandBtn.addEventListener("click", () => {
        sidebar.classList.remove("collapsed");
        expandBtn.classList.add("hidden");
    });

    // 2. Real-time Search input listener
    const searchInput = document.getElementById("search-input");
    searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        refreshSidebar();
    });

    // 3. Settings Modal triggers
    const settingsBtn = document.getElementById("settings-btn");
    const closeSettings = document.getElementById("close-settings-btn");
    const cancelSettings = document.getElementById("cancel-settings-btn");
    const settingsModal = document.getElementById("settings-modal");
    
    settingsBtn.addEventListener("click", () => {
        settingsModal.classList.remove("hidden");
    });
    
    const closeModal = () => settingsModal.classList.add("hidden");
    closeSettings.addEventListener("click", closeModal);
    cancelSettings.addEventListener("click", closeModal);

    // 4. Backups Actions
    // Export backup JSON
    document.getElementById("export-backup-btn").addEventListener("click", async () => {
        const pages = await getPages();
        const dataStr = JSON.stringify({ pages }, null, 4);
        
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `eschaton-wiki-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // Import backup trigger
    const importInput = document.getElementById("import-backup-file");
    document.getElementById("import-trigger-btn").addEventListener("click", () => {
        importInput.click();
    });

    importInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (imported && Array.isArray(imported.pages)) {
                    await restoreDatabase(imported.pages);
                    closeModal();
                    alert("Wiki restoration successful!");
                    window.location.reload();
                } else {
                    alert("Invalid backup file format. Missing page records list.");
                }
            } catch (err) {
                alert("Failed to parse JSON backup file: " + err.message);
            }
        };
        reader.readAsText(file);
    });

    // Refresh tree on update events
    window.addEventListener("eschaton_db_updated", refreshSidebar);
}

// Redraws the sidebar page navigation tree and tag cloud
export async function refreshSidebar(activeId = activePageId) {
    activePageId = activeId;
    const pages = await getPages();
    
    // 1. Process Page Hierarchy
    // Build maps for tree lookups
    const tree = document.getElementById("pages-tree");
    
    // Sort pages alphabetically by title
    pages.sort((a, b) => a.title.localeCompare(b.title));

    // Filter pages by tag or search query
    let filteredPages = [...pages];
    let isSearching = searchQuery || selectedTag;

    if (searchQuery) {
        filteredPages = pages.filter(p => {
            const inTitle = p.title.toLowerCase().includes(searchQuery);
            const inTags = p.tags && p.tags.some(t => t.toLowerCase().includes(searchQuery));
            const inContent = p.blocks && p.blocks.some(b => b.content.toLowerCase().includes(searchQuery));
            return inTitle || inTags || inContent;
        });
    }

    if (selectedTag) {
        filteredPages = filteredPages.filter(p => p.tags && p.tags.includes(selectedTag));
    }

    // Render Tag Cloud
    renderTagCloud(pages);

    // Render tree view
    tree.innerHTML = "";
    
    if (filteredPages.length === 0) {
        tree.innerHTML = `<div class="loading-placeholder"><i class="fa-solid fa-folder-open" style="font-size: 20px; animation: none;"></i><span>No matching pages</span></div>`;
        return;
    }

    // Render flat list if searching (since structure hierarchy is broken during filter)
    if (isSearching) {
        filteredPages.forEach(page => {
            const item = createTreeNodeElement(page, 0, false);
            tree.appendChild(item);
        });
    } else {
        // Render tree structure (Nested parents)
        const rootNodes = pages.filter(p => !p.parentId || !pages.some(parent => parent.id === p.parentId));
        
        const renderNode = (node, depth = 0) => {
            const children = pages.filter(p => p.parentId === node.id);
            const hasChildren = children.length > 0;
            const nodeEl = createTreeNodeElement(node, depth, hasChildren);
            tree.appendChild(nodeEl);

            if (hasChildren && expandedNodes.has(node.id)) {
                children.forEach(child => renderNode(child, depth + 1));
            }
        };

        rootNodes.forEach(node => renderNode(node, 0));
    }
}

// Generate HTML elements for tree nodes
function createTreeNodeElement(page, depth, hasChildren) {
    const nodeEl = document.createElement("div");
    nodeEl.className = "tree-node";

    const item = document.createElement("div");
    item.className = `node-item ${page.id === activePageId ? "active" : ""}`;
    item.dataset.id = page.id;
    
    // Left margins padding for depth visual nesting
    item.style.paddingLeft = `${(depth * 14) + 10}px`;

    // Expander Icon (nested folders)
    const expander = document.createElement("span");
    expander.className = "node-expander";
    if (hasChildren) {
        const isExpanded = expandedNodes.has(page.id);
        expander.innerHTML = isExpanded ? `<i class="fa-solid fa-chevron-down"></i>` : `<i class="fa-solid fa-chevron-right"></i>`;
        
        expander.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isExpanded) {
                expandedNodes.delete(page.id);
            } else {
                expandedNodes.add(page.id);
            }
            refreshSidebar();
        });
    } else {
        expander.innerHTML = `&middot;`;
        expander.style.opacity = "0.5";
    }
    item.appendChild(expander);

    // Node Type Icon (looks at tag or standard D&D types)
    const icon = document.createElement("span");
    icon.className = "node-icon";
    let iconClass = "fa-solid fa-file-lines";
    
    if (page.tags) {
        if (page.tags.includes("NPC")) iconClass = "fa-solid fa-user-shield";
        else if (page.tags.includes("Location")) iconClass = "fa-solid fa-map-location-dot";
        else if (page.tags.includes("Faction")) iconClass = "fa-solid fa-users-viewfinder";
        else if (page.tags.includes("Item")) iconClass = "fa-solid fa-gem";
        else if (page.tags.includes("Session-Log")) iconClass = "fa-solid fa-calendar-check";
    }
    
    if (hasChildren && !expandedNodes.has(page.id)) {
        iconClass = "fa-solid fa-folder";
    } else if (hasChildren && expandedNodes.has(page.id)) {
        iconClass = "fa-solid fa-folder-open";
    }

    icon.innerHTML = `<i class="${iconClass}"></i>`;
    item.appendChild(icon);

    // Title
    const title = document.createElement("span");
    title.className = "node-title";
    title.innerText = page.title || "Untitled Page";
    item.appendChild(title);

    // Hover quick action buttons
    if (page.id !== activePageId) {
        const actions = document.createElement("div");
        actions.className = "node-actions";
        actions.innerHTML = `
            <button class="node-action-btn quick-open" title="Open Page"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
        `;
        
        actions.querySelector(".quick-open").addEventListener("click", (e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("eschaton_page_change", { detail: { pageId: page.id } }));
        });
        
        item.appendChild(actions);
    }

    // Node item click opens page
    item.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("eschaton_page_change", { detail: { pageId: page.id } }));
    });

    nodeEl.appendChild(item);
    return nodeEl;
}

// Generate the tag cloud elements
function renderTagCloud(pages) {
    const cloud = document.getElementById("tag-cloud");
    
    // Collect and count tag frequencies
    const tagCounts = {};
    pages.forEach(p => {
        if (p.tags) {
            p.tags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        }
    });

    cloud.innerHTML = "";
    
    const allTags = Object.keys(tagCounts).sort();
    if (allTags.length === 0) {
        cloud.innerHTML = `<div style="font-size: 11px; color: var(--text-muted); padding: 5px 0;">No active tags yet</div>`;
        return;
    }

    allTags.forEach(tag => {
        const pill = document.createElement("div");
        pill.className = `tag-pill ${selectedTag === tag ? "active" : ""}`;
        pill.innerHTML = `
            <span>#${tag}</span>
            <span style="font-size: 9px; opacity: 0.6; padding-left: 2px;">(${tagCounts[tag]})</span>
        `;
        
        pill.addEventListener("click", () => {
            if (selectedTag === tag) {
                selectedTag = null; // Toggle off
            } else {
                selectedTag = tag;
            }
            refreshSidebar();
        });
        cloud.appendChild(pill);
    });
}
