/*
   Eschaton Wiki - Block Editor (editor.js)
   Handles modular block-based document editing, D&D widgets, and auto-linking.
*/

import { getPage, savePage, getPages } from "./db.js";

let activePage = null;
let isEditMode = false;
let autocompleteActive = false;
let autocompleteBlockId = null;
let autocompleteQueryStartIndex = -1;

// Renders the page editor canvas
export async function renderEditor(pageId, editMode = false) {
    const canvas = document.getElementById("doc-canvas");
    const container = document.getElementById("doc-container");
    const emptyScreen = document.getElementById("empty-state-screen");
    const saveStatus = document.getElementById("save-status");
    
    isEditMode = editMode;
    
    if (!pageId) {
        container.classList.add("hidden");
        emptyScreen.classList.remove("hidden");
        activePage = null;
        return;
    }

    emptyScreen.classList.add("hidden");
    container.classList.remove("hidden");

    activePage = await getPage(pageId);
    if (!activePage) {
        console.error("Page not found:", pageId);
        return;
    }

    // Set page title
    const titleInput = document.getElementById("doc-title-input");
    titleInput.value = activePage.title;
    titleInput.readOnly = !isEditMode;

    // Render tags
    renderPageTags();
    
    // Render Aliases
    renderPageAliases();
    
    // Render References
    renderPageReferences();

    // Render blocks
    canvas.innerHTML = "";
    
    if (activePage.blocks.length === 0) {
        // Show template selector overlay if page is blank
        renderTemplateSelector();
    } else {
        document.getElementById("template-overlay").classList.add("hidden");
        
        activePage.blocks.forEach((block, index) => {
            const blockEl = createBlockElement(block, index);
            canvas.appendChild(blockEl);
        });
        
        // Append block adder bar if editing
        if (isEditMode) {
            canvas.appendChild(createAddBlockBar(activePage.blocks.length));
        }
    }
}

// Render dynamic tags badges
function renderPageTags() {
    const tagsContainer = document.getElementById("doc-tags-container");
    tagsContainer.innerHTML = "";
    
    // Add current tags
    const tags = activePage.tags || [];
    tags.forEach(tag => {
        const badge = document.createElement("span");
        badge.className = "doc-tag-badge";
        badge.innerHTML = `
            #${tag}
            ${isEditMode ? `<i class="fa-solid fa-xmark remove-tag-btn" data-tag="${tag}"></i>` : ""}
        `;
        
        if (isEditMode) {
            badge.querySelector(".remove-tag-btn").addEventListener("click", () => {
                activePage.tags = activePage.tags.filter(t => t !== tag);
                renderPageTags();
                autoSave();
            });
        }
        tagsContainer.appendChild(badge);
    });

    // Add tag input field in edit mode
    if (isEditMode) {
        const tagInput = document.createElement("input");
        tagInput.type = "text";
        tagInput.className = "doc-tag-editor-input";
        tagInput.placeholder = "+ Add tag";
        
        tagInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && tagInput.value.trim()) {
                const newTag = tagInput.value.trim().replace(/[^a-zA-Z0-9_-]/g, "");
                if (newTag && !activePage.tags.includes(newTag)) {
                    activePage.tags.push(newTag);
                    renderPageTags();
                    autoSave();
                }
                tagInput.value = "";
            }
        });
        tagsContainer.appendChild(tagInput);
    }
}

// Render dynamic aliases badges
function renderPageAliases() {
    let aliasesContainer = document.getElementById("doc-aliases-container");
    const tagsContainer = document.getElementById("doc-tags-container");
    if (!aliasesContainer && tagsContainer) {
        aliasesContainer = document.createElement("div");
        aliasesContainer.id = "doc-aliases-container";
        aliasesContainer.className = "doc-aliases";
        tagsContainer.after(aliasesContainer);
    }
    if (!aliasesContainer) return;
    aliasesContainer.innerHTML = "";
    
    const aliases = activePage.aliases || [];
    aliases.forEach(alias => {
        const badge = document.createElement("span");
        badge.className = "doc-alias-badge";
        badge.innerHTML = `
            ~${alias}
            ${isEditMode ? `<i class="fa-solid fa-xmark remove-alias-btn" data-alias="${alias}"></i>` : ""}
        `;
        
        if (isEditMode) {
            badge.querySelector(".remove-alias-btn").addEventListener("click", () => {
                activePage.aliases = activePage.aliases.filter(a => a !== alias);
                renderPageAliases();
                autoSave();
            });
        }
        aliasesContainer.appendChild(badge);
    });

    if (isEditMode) {
        const aliasInput = document.createElement("input");
        aliasInput.type = "text";
        aliasInput.className = "doc-alias-editor-input";
        aliasInput.placeholder = "+ Add alias";
        
        aliasInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && aliasInput.value.trim()) {
                const newAlias = aliasInput.value.trim();
                if (newAlias) {
                    if (!activePage.aliases) activePage.aliases = [];
                    if (!activePage.aliases.includes(newAlias)) {
                        activePage.aliases.push(newAlias);
                        renderPageAliases();
                        autoSave();
                    }
                }
                aliasInput.value = "";
            }
        });
        aliasesContainer.appendChild(aliasInput);
    }
}

// Render parent references badges
async function renderPageReferences() {
    let referencesContainer = document.getElementById("doc-references-container");
    const aliasesContainer = document.getElementById("doc-aliases-container");
    if (!referencesContainer && aliasesContainer) {
        referencesContainer = document.createElement("div");
        referencesContainer.id = "doc-references-container";
        referencesContainer.className = "doc-references";
        aliasesContainer.after(referencesContainer);
    }
    if (!referencesContainer) return;
    referencesContainer.innerHTML = "";

    const pages = await getPages();
    const references = activePage.references || [];

    references.forEach(refParentId => {
        const parentPage = pages.find(p => p.id === refParentId);
        const parentTitle = parentPage ? parentPage.title : "Root / Unknown";

        const badge = document.createElement("span");
        badge.className = "doc-reference-badge";
        badge.innerHTML = `
            <i class="fa-solid fa-folder-tree"></i> In: ${parentTitle}
            ${isEditMode ? `<i class="fa-solid fa-xmark remove-reference-btn" data-ref="${refParentId}"></i>` : ""}
        `;

        if (isEditMode) {
            badge.querySelector(".remove-reference-btn").addEventListener("click", () => {
                activePage.references = activePage.references.filter(r => r !== refParentId);
                renderPageReferences();
                autoSave();
            });
        }
        referencesContainer.appendChild(badge);
    });

    if (isEditMode) {
        const refSelect = document.createElement("select");
        refSelect.className = "doc-reference-editor-select";
        refSelect.innerHTML = `<option value="">+ Add Reference Folder</option>`;
        
        pages.sort((a, b) => a.title.localeCompare(b.title));
        pages.forEach(p => {
            if (p.id !== activePage.id && p.id !== activePage.parentId && !references.includes(p.id)) {
                const opt = document.createElement("option");
                opt.value = p.id;
                opt.innerText = p.title || "Untitled Page";
                refSelect.appendChild(opt);
            }
        });

        refSelect.addEventListener("change", (e) => {
            const val = e.target.value;
            if (val) {
                if (!activePage.references) activePage.references = [];
                activePage.references.push(val);
                renderPageReferences();
                autoSave();
            }
        });
        referencesContainer.appendChild(refSelect);
    }
}

// Create HTML Elements for individual blocks
function createBlockElement(block, index) {
    const blockEl = document.createElement("div");
    blockEl.className = "editor-block";
    blockEl.dataset.id = block.id;
    blockEl.dataset.type = block.type;
    blockEl.draggable = isEditMode;

    // 1. Drag Handle (Left)
    if (isEditMode) {
        const dragHandle = document.createElement("div");
        dragHandle.className = "block-drag-handle";
        dragHandle.innerHTML = `
            <i class="fa-solid fa-ellipsis-vertical"></i>
            <i class="fa-solid fa-ellipsis-vertical"></i>
        `;
        blockEl.appendChild(dragHandle);
        
        // Up/down arrow controls as robust reorder mechanism
        const actionsMenu = document.createElement("div");
        actionsMenu.className = "block-actions-menu";
        actionsMenu.innerHTML = `
            <button class="block-menu-btn move-up-btn" title="Move Up"><i class="fa-solid fa-chevron-up"></i></button>
            <button class="block-menu-btn move-down-btn" title="Move Down"><i class="fa-solid fa-chevron-down"></i></button>
            <button class="block-menu-btn delete-block-btn" title="Delete Block"><i class="fa-solid fa-trash-can"></i></button>
        `;
        
        actionsMenu.querySelector(".move-up-btn").addEventListener("click", () => moveBlock(block.id, -1));
        actionsMenu.querySelector(".move-down-btn").addEventListener("click", () => moveBlock(block.id, 1));
        actionsMenu.querySelector(".delete-block-btn").addEventListener("click", () => deleteBlock(block.id));
        blockEl.appendChild(actionsMenu);
    }

    // 2. Block Content Wrapper
    const contentWrapper = document.createElement("div");
    contentWrapper.className = "block-content-wrapper";

    // Build specific block contents
    switch (block.type) {
        case "statblock":
            renderStatBlockWidget(contentWrapper, block);
            break;
            
        case "list-checkbox":
            renderCheckboxBlockWidget(contentWrapper, block);
            break;
            
        case "list-bullet":
            const bulletItem = document.createElement("div");
            bulletItem.className = "list-item";
            bulletItem.innerHTML = `
                <i class="fa-solid fa-circle-play list-bullet"></i>
                <div class="block-content" contenteditable="${isEditMode}">${block.content}</div>
            `;
            contentWrapper.appendChild(bulletItem);
            break;

        case "list-numbered":
            const numberItem = document.createElement("div");
            numberItem.className = "list-item";
            numberItem.innerHTML = `
                <div class="list-number">${index + 1}.</div>
                <div class="block-content" contenteditable="${isEditMode}">${block.content}</div>
            `;
            contentWrapper.appendChild(numberItem);
            break;

        default: // h1, h2, h3, paragraph, callout, connections
            const genericContent = document.createElement("div");
            genericContent.className = "block-content";
            genericContent.contentEditable = isEditMode;
            genericContent.innerHTML = block.content;
            contentWrapper.appendChild(genericContent);
            break;
    }

    blockEl.appendChild(contentWrapper);

    // 3. Attach Edit Listeners to ContentEditable areas
    const editableEl = contentWrapper.querySelector(".block-content[contenteditable='true']");
    if (editableEl) {
        // Prevent double space default actions, register autocomplete popovers
        editableEl.addEventListener("input", (e) => {
            block.content = editableEl.innerHTML;
            handleAutocompleteTrigger(e, editableEl, block.id);
            autoSave();
        });

        // Close autocomplete popup when clicking out
        editableEl.addEventListener("blur", () => {
            setTimeout(() => {
                if (autocompleteBlockId === block.id) {
                    hideAutocompletePopover();
                }
            }, 200);
        });

        // Prevent enter key default behavior inside titles to create a new block
        editableEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                // Add a paragraph block directly after this
                insertBlockAfter(block.id, "paragraph");
            }
        });
    }

    // 4. Click routing for internal wiki-links in View Mode
    if (!isEditMode) {
        contentWrapper.querySelectorAll(".wiki-link").forEach(link => {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                const targetId = link.dataset.pageId;
                if (targetId) {
                    // Dispatch change active page event
                    window.dispatchEvent(new CustomEvent("eschaton_page_change", { detail: { pageId: targetId } }));
                }
            });
        });
    }

    // 5. HTML5 Drag-and-drop handlers for block sorting
    if (isEditMode) {
        blockEl.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", block.id);
            blockEl.classList.add("dragging");
        });
        
        blockEl.addEventListener("dragend", () => {
            blockEl.classList.remove("dragging");
        });

        blockEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            const draggingEl = document.querySelector(".dragging");
            if (draggingEl && draggingEl !== blockEl) {
                const bounding = blockEl.getBoundingClientRect();
                const offset = e.clientY - bounding.top;
                if (offset > bounding.height / 2) {
                    blockEl.after(draggingEl);
                } else {
                    blockEl.before(draggingEl);
                }
            }
        });
        
        blockEl.addEventListener("drop", (e) => {
            e.preventDefault();
            reorderBlocksFromDOM();
        });
    }

    return blockEl;
}

// Render dynamic custom D&D Stat Block Card
function renderStatBlockWidget(wrapper, block) {
    let statsData;
    try {
        statsData = JSON.parse(block.content);
    } catch (e) {
        statsData = {
            name: "New Monster",
            type: "Medium humanoid, unaligned",
            ac: "10",
            hp: "10 (2d8)",
            speed: "30 ft.",
            stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
            abilities: []
        };
    }

    const mod = (val) => {
        const m = Math.floor((val - 10) / 2);
        return m >= 0 ? `+${m}` : `${m}`;
    };

    const statBlockHtml = `
        <div class="stat-block">
            <div class="stat-block-name">${statsData.name}</div>
            <div class="stat-block-type">${statsData.type}</div>
            
            <div class="stat-block-info">
                <span><strong>Armor Class</strong> ${statsData.ac}</span>
                <span><strong>Hit Points</strong> ${statsData.hp}</span>
                <span><strong>Speed</strong> ${statsData.speed}</span>
            </div>
            
            <div class="stat-grid">
                <div class="stat-box"><span class="stat-label">STR</span><span class="stat-val">${statsData.stats.str}</span><span class="stat-mod">(${mod(statsData.stats.str)})</span></div>
                <div class="stat-box"><span class="stat-label">DEX</span><span class="stat-val">${statsData.stats.dex}</span><span class="stat-mod">(${mod(statsData.stats.dex)})</span></div>
                <div class="stat-box"><span class="stat-label">CON</span><span class="stat-val">${statsData.stats.con}</span><span class="stat-mod">(${mod(statsData.stats.con)})</span></div>
                <div class="stat-box"><span class="stat-label">INT</span><span class="stat-val">${statsData.stats.int}</span><span class="stat-mod">(${mod(statsData.stats.int)})</span></div>
                <div class="stat-box"><span class="stat-label">WIS</span><span class="stat-val">${statsData.stats.wis}</span><span class="stat-mod">(${mod(statsData.stats.wis)})</span></div>
                <div class="stat-box"><span class="stat-label">CHA</span><span class="stat-val">${statsData.stats.cha}</span><span class="stat-mod">(${mod(statsData.stats.cha)})</span></div>
            </div>

            <div class="stat-block-abilities">
                ${statsData.abilities.map(a => `
                    <div class="stat-ability-item"><strong>${a.name}.</strong> ${a.desc}</div>
                `).join("")}
            </div>

            ${isEditMode ? `
                <button class="footer-btn secondary-btn stat-edit-toggle-btn" style="margin-top: 15px; padding: 6px 12px; font-size: 11px;">
                    <i class="fa-solid fa-sliders"></i> Edit Stat Details
                </button>
                <div class="stat-block-form hidden" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <div class="form-group"><label>JSON Editor</label><textarea class="stat-json-textarea" style="width: 100%; height: 150px; background-color: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); font-family: monospace; font-size: 11px; padding: 8px; border-radius: 4px; outline: none;"></textarea></div>
                </div>
            ` : ""}
        </div>
    `;

    wrapper.innerHTML = statBlockHtml;

    if (isEditMode) {
        const toggleBtn = wrapper.querySelector(".stat-edit-toggle-btn");
        const formDiv = wrapper.querySelector(".stat-block-form");
        const textarea = wrapper.querySelector(".stat-json-textarea");
        
        textarea.value = JSON.stringify(statsData, null, 4);

        toggleBtn.addEventListener("click", () => {
            formDiv.classList.toggle("hidden");
        });

        textarea.addEventListener("input", () => {
            try {
                const parsed = JSON.parse(textarea.value);
                block.content = JSON.stringify(parsed);
                // Re-render stat headers live in background without resetting cursor
                wrapper.querySelector(".stat-block-name").innerText = parsed.name || "Unnamed";
                wrapper.querySelector(".stat-block-type").innerText = parsed.type || "Medium humanoid";
                autoSave();
            } catch (err) {
                // Invalid JSON, wait for user to fix
            }
        });
    }
}

// Render interactive Checklist items
function renderCheckboxBlockWidget(wrapper, block) {
    let checked = false;
    let text = block.content;
    
    // Parse checked status from internal markup if present
    if (block.content.startsWith("[x] ")) {
        checked = true;
        text = block.content.slice(4);
    } else if (block.content.startsWith("[ ] ")) {
        checked = false;
        text = block.content.slice(4);
    }

    const item = document.createElement("div");
    item.className = `checklist-item ${checked ? "checked" : ""}`;
    item.innerHTML = `
        <div class="checklist-checkbox ${checked ? "checked" : ""}">
            <i class="fa-solid fa-check"></i>
        </div>
        <div class="block-content" contenteditable="${isEditMode}">${text}</div>
    `;

    wrapper.appendChild(item);

    // Dynamic check trigger in both Edit & View modes!
    const checkbox = item.querySelector(".checklist-checkbox");
    checkbox.addEventListener("click", () => {
        checked = !checked;
        checkbox.classList.toggle("checked", checked);
        item.classList.toggle("checked", checked);
        
        // Update model content
        block.content = (checked ? "[x] " : "[ ] ") + text;
        autoSave();
    });

    const editableEl = item.querySelector(".block-content");
    if (isEditMode) {
        editableEl.addEventListener("input", () => {
            text = editableEl.innerHTML;
            block.content = (checked ? "[x] " : "[ ] ") + text;
            autoSave();
        });
    }
}

// Create Adder Bar for inserting new blocks
function createAddBlockBar(index) {
    const bar = document.createElement("div");
    bar.className = "add-block-bar";
    bar.innerHTML = `
        <span class="add-block-label">Add Block</span>
        <div class="add-block-btn-list">
            <button class="add-block-btn" data-type="paragraph"><i class="fa-solid fa-paragraph"></i> Text</button>
            <button class="add-block-btn" data-type="h2"><i class="fa-solid fa-heading"></i> Heading H2</button>
            <button class="add-block-btn" data-type="h3"><i class="fa-solid fa-heading"></i> Heading H3</button>
            <button class="add-block-btn" data-type="list-bullet"><i class="fa-solid fa-list-ul"></i> Bullet</button>
            <button class="add-block-btn" data-type="list-numbered"><i class="fa-solid fa-list-ol"></i> Numbered</button>
            <button class="add-block-btn" data-type="list-checkbox"><i class="fa-solid fa-square-check"></i> Checklist</button>
            <button class="add-block-btn" data-type="callout"><i class="fa-solid fa-quote-left"></i> Callout</button>
            <button class="add-block-btn" data-type="statblock"><i class="fa-solid fa-user-shield"></i> D&D Statblock</button>
        </div>
    `;

    bar.querySelectorAll(".add-block-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            insertBlockAtIndex(index, btn.dataset.type);
        });
    });

    return bar;
}

// Reordering blocks inside model array matching the DOM drag layout
function reorderBlocksFromDOM() {
    const canvas = document.getElementById("doc-canvas");
    const domIds = Array.from(canvas.querySelectorAll(".editor-block")).map(el => el.dataset.id);
    
    const reorderedBlocks = [];
    domIds.forEach(id => {
        const blk = activePage.blocks.find(b => b.id === id);
        if (blk) reorderedBlocks.push(blk);
    });
    
    activePage.blocks = reorderedBlocks;
    autoSave();
}

// Move block up/down
function moveBlock(blockId, direction) {
    const idx = activePage.blocks.findIndex(b => b.id === blockId);
    if (idx < 0) return;
    
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= activePage.blocks.length) return;
    
    // Swap blocks
    const temp = activePage.blocks[idx];
    activePage.blocks[idx] = activePage.blocks[targetIdx];
    activePage.blocks[targetIdx] = temp;
    
    // Re-render
    renderEditor(activePage.id, isEditMode);
    autoSave();
}

// Insert new block at index
function insertBlockAtIndex(index, type) {
    let content = "";
    if (type === "h2") content = "Sub-section Title";
    else if (type === "h3") content = "Minor Section";
    else if (type === "callout") content = "Enter important notes or lore secrets here...";
    else if (type === "list-checkbox") content = "[ ] Task item description...";
    else if (type === "paragraph") content = "Click to write notes...";
    else if (type === "list-bullet") content = "List bullet item...";
    else if (type === "list-numbered") content = "Numbered item...";
    
    const newBlock = {
        id: "b_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        type: type,
        content: content
    };

    activePage.blocks.splice(index, 0, newBlock);
    renderEditor(activePage.id, isEditMode);
    autoSave();
}

// Insert block immediately following another block
function insertBlockAfter(currentBlockId, type) {
    const idx = activePage.blocks.findIndex(b => b.id === currentBlockId);
    if (idx >= 0) {
        insertBlockAtIndex(idx + 1, type);
        
        // Set focus to the newly created element
        setTimeout(() => {
            const canvas = document.getElementById("doc-canvas");
            const newBlockEl = canvas.querySelector(`.editor-block:nth-child(${idx + 2}) .block-content[contenteditable='true']`);
            if (newBlockEl) {
                newBlockEl.focus();
                // Select all text inside
                const range = document.createRange();
                range.selectNodeContents(newBlockEl);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }, 50);
    }
}

// Delete block
function deleteBlock(blockId) {
    activePage.blocks = activePage.blocks.filter(b => b.id !== blockId);
    renderEditor(activePage.id, isEditMode);
    autoSave();
}

// Auto Save mechanism (Debounced)
let saveTimeout = null;
export function autoSave() {
    if (!activePage) return;
    
    const saveStatus = document.getElementById("save-status");
    saveStatus.innerHTML = `<i class="fa-solid fa-spinner"></i> Saving...`;
    saveStatus.classList.add("saving");
    saveStatus.style.opacity = "1";
    
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        // Collect latest Title
        const titleInput = document.getElementById("doc-title-input");
        activePage.title = titleInput.value.trim() || "Untitled Page";
        
        // Save
        await savePage(activePage);
        
        saveStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> Saved`;
        saveStatus.classList.remove("saving");
        setTimeout(() => {
            if (!saveStatus.classList.contains("saving")) {
                saveStatus.style.opacity = "0.5";
            }
        }, 2000);
    }, 1000);
}

// Handles Intercepting typing and looking for "[[ "
async function handleAutocompleteTrigger(e, element, blockId) {
    const text = element.innerText;
    
    // Check if we are searching
    if (!autocompleteActive) {
        const doubleBracketIndex = text.lastIndexOf("[[");
        if (doubleBracketIndex >= 0) {
            // Check if cursor is right after "[["
            const sel = window.getSelection();
            if (sel.rangeCount > 0) {
                autocompleteActive = true;
                autocompleteBlockId = blockId;
                autocompleteQueryStartIndex = doubleBracketIndex + 2;
                showAutocompletePopover(element);
            }
        }
    } else {
        // Check if query is closed
        const query = text.substring(autocompleteQueryStartIndex);
        if (query.includes("]]") || text.lastIndexOf("[[") < 0) {
            hideAutocompletePopover();
            return;
        }
        
        // Search & filter pages
        const pages = await getPages();
        const matches = pages.filter(p => {
            const matchesTitle = p.title.toLowerCase().includes(query.toLowerCase());
            const matchesAlias = p.aliases && p.aliases.some(a => a.toLowerCase().includes(query.toLowerCase()));
            return matchesTitle || matchesAlias;
        });
        renderAutocompleteList(matches, element, query);
    }
}

function showAutocompletePopover(element) {
    const popover = document.getElementById("autocomplete-popover");
    popover.classList.remove("hidden");
    
    // Position near the contenteditable editor element
    const rect = element.getBoundingClientRect();
    popover.style.left = rect.left + "px";
    popover.style.top = (rect.bottom + window.scrollY + 5) + "px";
}

function hideAutocompletePopover() {
    autocompleteActive = false;
    autocompleteBlockId = null;
    autocompleteQueryStartIndex = -1;
    document.getElementById("autocomplete-popover").classList.add("hidden");
}

function renderAutocompleteList(matches, targetElement, query) {
    const list = document.getElementById("autocomplete-list");
    list.innerHTML = "";
    
    if (matches.length === 0) {
        list.innerHTML = `<li class="autocomplete-item">No pages found matching "${query}"</li>`;
        return;
    }
    
    matches.slice(0, 5).forEach((match, idx) => {
        const li = document.createElement("li");
        li.className = `autocomplete-item ${idx === 0 ? "selected" : ""}`;
        
        let displayTitle = match.title;
        const matchingAlias = match.aliases?.find(a => a.toLowerCase().includes(query.toLowerCase()));
        if (matchingAlias) {
            displayTitle = `${match.title} (~${matchingAlias})`;
        }
        li.innerHTML = `<i class="fa-solid fa-file-invoice"></i> <span>${displayTitle}</span>`;
        
        li.addEventListener("mousedown", (e) => {
            e.preventDefault();
            insertWikiLink(matchingAlias || match.title, match.id, targetElement);
        });
        list.appendChild(li);
    });
}

function insertWikiLink(pageTitle, pageId, element) {
    const text = element.innerHTML;
    // Replace from the last "[[" with the link span tag
    const idx = text.lastIndexOf("[[");
    if (idx >= 0) {
        const replacement = `<span class="wiki-link" data-page-id="${pageId}">${pageTitle}</span>&nbsp;`;
        element.innerHTML = text.substring(0, idx) + replacement;
        
        // Trigger page content model update
        const block = activePage.blocks.find(b => b.id === autocompleteBlockId);
        if (block) {
            block.content = element.innerHTML;
            autoSave();
        }
        
        // Move caret to end
        setTimeout(() => {
            element.focus();
            const range = document.createRange();
            range.selectNodeContents(element);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }, 10);
    }
    hideAutocompletePopover();
}

async function renderTemplateSelector() {
    const overlay = document.getElementById("template-overlay");
    if (!overlay) return;
    overlay.classList.remove("hidden");

    const grid = overlay.querySelector(".template-grid");
    if (!grid) return;
    grid.innerHTML = "";

    // Add a default "Blank Page" option
    const blankCard = document.createElement("div");
    blankCard.className = "template-card-item";
    blankCard.innerHTML = `
        <div class="template-icon"><i class="fa-solid fa-file"></i></div>
        <h4>Blank Page</h4>
        <p>Start with a completely empty canvas.</p>
    `;
    blankCard.addEventListener("click", async () => {
        activePage.blocks = [
            { id: "b_" + Date.now() + "_1", type: "h1", content: "New Page Title" },
            { id: "b_" + Date.now() + "_2", type: "paragraph", content: "Start writing here..." }
        ];
        await savePage(activePage);
        overlay.classList.add("hidden");
        renderEditor(activePage.id, isEditMode);
    });
    grid.appendChild(blankCard);

    // Fetch customizable Template pages from Firestore
    const pages = await getPages();
    const templates = pages.filter(p => p.tags && p.tags.includes("Template"));

    templates.forEach(tpl => {
        const card = document.createElement("div");
        card.className = "template-card-item";
        card.innerHTML = `
            <div class="template-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
            <h4>${tpl.title || "Untitled Template"}</h4>
            <p>Use blocks from this custom template.</p>
        `;
        card.addEventListener("click", async () => {
            activePage.blocks = tpl.blocks.map((block, idx) => ({
                id: "b_" + Date.now() + "_" + idx + "_" + Math.floor(Math.random() * 1000),
                type: block.type,
                content: block.content
            }));
            activePage.title = tpl.title;
            activePage.tags = (tpl.tags || []).filter(t => t !== "Template");
            await savePage(activePage);
            overlay.classList.add("hidden");
            renderEditor(activePage.id, isEditMode);
        });
        grid.appendChild(card);
    });
}
