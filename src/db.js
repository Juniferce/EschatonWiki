/*
   Eschaton Wiki - Database Interface (db.js)
   Uses the shared Firebase Firestore instance. Includes
   version history snapshot recording on every page save.
*/

import {
    collection,
    getDocs,
    getDoc,
    setDoc,
    deleteDoc,
    doc,
    query,
    orderBy
} from "firebase/firestore";

import { db } from "./firebase.js";
import { recordSnapshot } from "./history.js";

// LocalStorage key for offline cache
const PAGES_KEY = "eschaton_wiki_pages";

// Sample campaign data (used to seed an empty wiki on first load)
export const SAMPLE_PAGES = [
    {
        id: "world-of-eschaton",
        title: "The World of Eschaton",
        parentId: "",
        tags: ["Lore", "Campaign-Intro"],
        blocks: [
            { id: "b1", type: "h1", content: "Welcome to Eschaton" },
            { id: "b2", type: "paragraph", content: "Eschaton is a world balanced on the precipice of a magical singularity. Once a golden empire ruled by god-monarchs, it was shattered during the Great Inversion. Today, cities are protected by gargantuan magical shields called Aegis Spheres, keeping out the wild, mutated chaotic magic of the Outlands." },
            { id: "b3", type: "callout", content: "Active Campaign Theme: 'The dying light of magic must be sustained, or the sphere-cities will fall into the void.'" },
            { id: "b4", type: "h2", content: "The Three Spheres" },
            { id: "b5", type: "paragraph", content: "Most mortal life resides inside three main shield cities:" },
            { id: "b6", type: "list-bullet", content: "<strong>Solaria</strong>: The glittering capital of science, clockwork, and arcane engineering." },
            { id: "b7", type: "list-bullet", content: "<strong>Nox</strong>: A subterranean sanctuary governed by the Shadow Council, trading in obsidian and soul-gems." },
            { id: "b8", type: "list-bullet", content: "<strong>Verdantia</strong>: A city-forest governed by Druid-Lords, sustained by the Heart of Yggdrasil." }
        ],
        updatedAt: Date.now()
    },
    {
        id: "npcs",
        title: "NPCs & Factions",
        parentId: "",
        tags: ["Campaign-Index"],
        blocks: [
            { id: "b1", type: "h1", content: "Characters & Coalitions" },
            { id: "b2", type: "paragraph", content: "Use this page to catalog important personalities, quest givers, and adversaries your party encounters across the spheres." },
            { id: "b3", type: "connections", content: "Quick Links: [[Lord Malakor]] | [[The Syndicate]]" }
        ],
        updatedAt: Date.now()
    },
    {
        id: "lord-malakor",
        title: "Lord Malakor",
        parentId: "npcs",
        tags: ["NPC", "Adversary", "Nox"],
        blocks: [
            { id: "b1", type: "h1", content: "Lord Malakor, the Shadow Viceroy" },
            { id: "b2", type: "paragraph", content: "The current regent of Nox. Malakor is a half-elf vampire who controls the flows of soul-gems in the Undercity. He appears polite and cultured, but has zero tolerance for defiance." },
            { id: "b3", type: "statblock", content: JSON.stringify({
                name: "Lord Malakor",
                type: "Medium undead (half-elf), lawful evil",
                ac: "16 (natural armor)",
                hp: "144 (18d8 + 63)",
                speed: "30 ft.",
                stats: { str: 18, dex: 16, con: 18, int: 15, wis: 14, cha: 18 },
                abilities: [
                    { name: "Regeneration", desc: "Malakor regains 10 hit points at the start of his turn if he has at least 1 hit point and isn't in sunlight." },
                    { name: "Vampiric Bite", desc: "Melee Weapon Attack: +9 to hit, reach 5 ft., one willing creature. Hit: 7 (1d6 + 4) piercing damage plus 10 (3d6) necrotic damage." }
                ]
            })},
            { id: "b4", type: "h2", content: "GM Secrets" },
            { id: "b5", type: "callout", content: "Secrets: Lord Malakor is secretly funding the rebels in Solaria to destabilize the High Council, hoping to steal the Solar Engine core." }
        ],
        updatedAt: Date.now()
    },
    {
        id: "the-syndicate",
        title: "The Syndicate",
        parentId: "npcs",
        tags: ["Faction", "Nox"],
        blocks: [
            { id: "b1", type: "h1", content: "The Obsidian Syndicate" },
            { id: "b2", type: "paragraph", content: "A network of rogue spellcasters, thieves, and smugglers based in Nox. They smuggle raw chaos residue out of the Outlands to sell as high-grade arcane fuel inside Solaria." },
            { id: "b3", type: "h2", content: "Key Operations" },
            { id: "b4", type: "list-numbered", content: "Controlling the black-market imports in Solaria's Lower District." },
            { id: "b5", type: "list-numbered", content: "Bribing Aegis sentinels to look the other way during gate deliveries." },
            { id: "b6", type: "list-numbered", content: "Assassinating agents of the High Council who get too close." }
        ],
        updatedAt: Date.now()
    },
    {
        id: "locations",
        title: "Locations & Maps",
        parentId: "",
        tags: ["Campaign-Index"],
        blocks: [
            { id: "b1", type: "h1", content: "Locations & Landmarks" },
            { id: "b2", type: "paragraph", content: "Click on any sub-page to view maps, environmental keys, and quest lists for specific structures." },
            { id: "b3", type: "connections", content: "Current Target: [[The Obsidian Tower]]" }
        ],
        updatedAt: Date.now()
    },
    {
        id: "the-obsidian-tower",
        title: "The Obsidian Tower",
        parentId: "locations",
        tags: ["Location", "Dungeon", "Nox"],
        blocks: [
            { id: "b1", type: "h1", content: "The Obsidian Tower" },
            { id: "b2", type: "paragraph", content: "A jagged spire rising 200 feet above the Nox under-gulf. Built from basalt and solid dark magic, it serves as the sanctuary for Malakor's elite guard." },
            { id: "b3", type: "callout", content: "Environmental Hazard: Spells cast on the top floor of the tower trigger a Chaos Magic Surge on a roll of 1 or 2 on the d20." },
            { id: "b4", type: "h2", content: "Dungeon Map Outline" },
            { id: "b5", type: "list-bullet", content: "<strong>Floor 1 (The Dungeons)</strong>: Iron cells holding captured Solarian spies. Guarded by 4 Shadow Ghouls." },
            { id: "b6", type: "list-bullet", content: "<strong>Floor 2 (The Laboratory)</strong>: Soul-gem refinement refinery. Overseen by Alchemist Vesper." },
            { id: "b7", type: "list-bullet", content: "<strong>Floor 3 (The Zenith Chamber)</strong>: Lord Malakor's private quarters and the rift siphon portal." }
        ],
        updatedAt: Date.now()
    }
];

// --- Page CRUD Operations ---

/** Loads all pages from Firestore, falls back to localStorage on error. */
export async function getPages() {
    try {
        const localPages = getLocalPages();

        // 1. Fetch the lightweight manifest document
        const manifestRef = doc(db, "meta", "manifest");
        const manifestSnap = await getDoc(manifestRef);

        // 2. If no manifest exists, rebuild it from the current Firestore database
        if (!manifestSnap.exists()) {
            const q = query(collection(db, "pages"), orderBy("updatedAt", "desc"));
            const snap = await getDocs(q);
            const dbPages = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (dbPages.length === 0 && localPages.length > 0) {
                // Seed Firestore from local backup
                for (const p of localPages) {
                    const docData = { ...p };
                    delete docData.id;
                    await setDoc(doc(db, "pages", p.id), docData);
                }
                await rebuildManifest(localPages);
                return localPages;
            }

            localStorage.setItem(PAGES_KEY, JSON.stringify(dbPages));
            await rebuildManifest(dbPages);
            return dbPages;
        }

        const remoteManifest = manifestSnap.data().pages || {};
        const localMap = new Map(localPages.map(p => [p.id, p]));
        let cacheUpdated = false;
        const pagesToFetch = [];
        const localIdsToDelete = [];

        // 3. Find stale or missing pages
        for (const [id, remoteUpdatedAt] of Object.entries(remoteManifest)) {
            const localPage = localMap.get(id);
            if (!localPage || localPage.updatedAt < remoteUpdatedAt) {
                pagesToFetch.push(id);
            }
        }

        // 4. Find locally cached pages that have been deleted from Firestore
        for (const localPage of localPages) {
            if (!(localPage.id in remoteManifest)) {
                localIdsToDelete.push(localPage.id);
            }
        }

        // Quick escape if database is completely empty
        if (Object.keys(remoteManifest).length === 0) {
            localStorage.setItem(PAGES_KEY, JSON.stringify([]));
            return [];
        }

        // 5. Fetch entire database only if cache is blank or mostly stale to minimize individual requests
        if (localPages.length === 0 || pagesToFetch.length > (Object.keys(remoteManifest).length / 2)) {
            const q = query(collection(db, "pages"), orderBy("updatedAt", "desc"));
            const snap = await getDocs(q);
            const dbPages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            localStorage.setItem(PAGES_KEY, JSON.stringify(dbPages));
            return dbPages;
        }

        // 6. Otherwise, fetch ONLY the stale/missing page documents
        if (pagesToFetch.length > 0) {
            for (const id of pagesToFetch) {
                try {
                    const pageSnap = await getDoc(doc(db, "pages", id));
                    if (pageSnap.exists()) {
                        localMap.set(id, { id: pageSnap.id, ...pageSnap.data() });
                        cacheUpdated = true;
                    }
                } catch (err) {
                    console.warn(`Failed to sync stale page ${id}:`, err.message);
                }
            }
        }

        // 7. Remove locally cached deleted pages
        if (localIdsToDelete.length > 0) {
            localIdsToDelete.forEach(id => localMap.delete(id));
            cacheUpdated = true;
        }

        const updatedPages = Array.from(localMap.values());
        if (cacheUpdated) {
            updatedPages.sort((a, b) => b.updatedAt - a.updatedAt);
            localStorage.setItem(PAGES_KEY, JSON.stringify(updatedPages));
        }

        return updatedPages;
    } catch (err) {
        console.warn("Firestore getPages failed, using local cache:", err.message);
        return getLocalPages();
    }
}

/** Gets a single page by ID from the synchronized local cache. */
export async function getPage(id) {
    // Serving from local cache directly is safe and instant, as getPages() runs
    // during bootstrap and validates / updates stale entries via the manifest.
    return getLocalPages().find(p => p.id === id) || null;
}

/**
 * Saves (creates or updates) a page.
 * Records a history snapshot BEFORE overwriting the Firestore document.
 */
export async function savePage(page) {
    page.updatedAt = Date.now();

    // 1. Fetch current version to save as history snapshot (before overwrite)
    try {
        const current = await getPage(page.id);
        if (current && current.blocks) {
            // Only record history if the page already exists (not first-time saves)
            await recordSnapshot(page.id, current);
        }
    } catch (err) {
        // Non-critical, don't block the save
        console.warn("Pre-save history snapshot skipped:", err.message);
    }

    // 2. Write to Firestore
    try {
        const docData = { ...page };
        delete docData.id;
        await setDoc(doc(db, "pages", page.id), docData);

        // Update manifest in Firestore
        await updateManifest(page.id, page.updatedAt);
    } catch (err) {
        console.warn("Firestore savePage failed:", err.message);
    }

    // 3. Always keep a local cache backup
    const local = getLocalPages();
    const idx = local.findIndex(p => p.id === page.id);
    if (idx >= 0) local[idx] = page; else local.push(page);
    localStorage.setItem(PAGES_KEY, JSON.stringify(local));

    window.dispatchEvent(new CustomEvent("eschaton_db_updated"));
}

/** Deletes a page from Firestore and local cache. */
export async function deletePage(id) {
    try {
        await deleteDoc(doc(db, "pages", id));

        // Remove from manifest
        await updateManifest(id, 0, true);
    } catch (err) {
        console.warn("Firestore deletePage failed:", err.message);
    }

    let local = getLocalPages().filter(p => p.id !== id);
    localStorage.setItem(PAGES_KEY, JSON.stringify(local));
    window.dispatchEvent(new CustomEvent("eschaton_db_updated"));
}

/** Replaces all pages in Firestore (used for backup restore and sample seeding). */
export async function restoreDatabase(pagesList) {
    localStorage.setItem(PAGES_KEY, JSON.stringify(pagesList));
    try {
        for (const page of pagesList) {
            const docData = { ...page };
            delete docData.id;
            await setDoc(doc(db, "pages", page.id), docData);
        }
        // Overwrite complete manifest
        await rebuildManifest(pagesList);
    } catch (err) {
        console.warn("Firestore bulk restore failed:", err.message);
    }
    window.dispatchEvent(new CustomEvent("eschaton_db_updated"));
}

// --- Manifest Management Helpers ---

/** Updates a single page entry in the Firestore index manifest. */
async function updateManifest(pageId, updatedAt, isDelete = false) {
    try {
        const manifestRef = doc(db, "meta", "manifest");
        const snap = await getDoc(manifestRef);
        let pagesMap = snap.exists() ? (snap.data().pages || {}) : {};
        
        if (isDelete) delete pagesMap[pageId];
        else pagesMap[pageId] = updatedAt;

        await setDoc(manifestRef, { pages: pagesMap });
    } catch (err) {
        console.warn("Failed to update manifest:", err.message);
    }
}

/** Rebuilds the entire index manifest in Firestore. */
async function rebuildManifest(pagesList) {
    const manifest = {};
    pagesList.forEach(p => { manifest[p.id] = p.updatedAt || Date.now(); });
    try {
        await setDoc(doc(db, "meta", "manifest"), { pages: manifest });
    } catch (err) {
        console.warn("Failed to rebuild manifest:", err.message);
    }
}

// --- Local Storage Helpers ---
function getLocalPages() {
    const raw = localStorage.getItem(PAGES_KEY);
    return raw ? JSON.parse(raw) : [];
}
