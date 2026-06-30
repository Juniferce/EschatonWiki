/*
   Eschaton Wiki - Page Templates (templates.js)
   Predefined layouts for different D&D notes page types.
*/

export const TEMPLATES = {
    blank: {
        title: "New Page",
        tags: ["General"],
        blocks: [
            { id: "tb1", type: "h1", content: "New Page Title" },
            { id: "tb2", type: "paragraph", content: "Start writing here. Use the buttons below to add headers, lists, callouts, or interactive stat blocks. Type <strong>[[</strong> to link to other pages." }
        ]
    },
    
    npc: {
        title: "New NPC Profile",
        tags: ["NPC", "Character"],
        blocks: [
            { id: "tb1", type: "h1", content: "NPC Name" },
            { id: "tb2", type: "paragraph", content: "Provide a quick summary of this NPC: what is their role in the campaign, what do they want, and where do they reside?" },
            
            { id: "tb3", type: "h2", content: "Appearance & Personality" },
            { id: "tb4", type: "paragraph", content: "<strong>Mannerisms:</strong> Speaks slowly, constantly checks a pocketwatch.<br><strong>Appearance:</strong> Wears a heavy slate-gray cloak with glowing blue runes." },
            
            { id: "tb5", type: "h2", content: "D&D Stat Block" },
            { id: "tb6", type: "statblock", content: JSON.stringify({
                name: "NPC Name",
                type: "Medium humanoid, neutral",
                ac: "10 (natural armor)",
                hp: "18 (4d8)",
                speed: "30 ft.",
                stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
                abilities: [
                    { name: "Ability Name", desc: "Short description of an action, spell, or passive ability here." }
                ]
            })},
            
            { id: "tb7", type: "h2", content: "Lore & Relationships" },
            { id: "tb8", type: "connections", content: "Affiliated Faction: [[The Syndicate]]<br>Allies: [[]]<br>Rivals: [[]]" },
            
            { id: "tb9", type: "h2", content: "GM Secrets" },
            { id: "tb10", type: "callout", content: "Secrets: What is this NPC hiding from the players? What quests do they have?" }
        ]
    },
    
    location: {
        title: "New Location",
        tags: ["Location", "Dungeon"],
        blocks: [
            { id: "tb1", type: "h1", content: "Location Name" },
            { id: "tb2", type: "paragraph", content: "Describe this location in broad strokes. Is it a bustling district, a long-abandoned dwarven ruin, or an isolated tavern?" },
            
            { id: "tb3", type: "callout", content: "<strong>Sensory Details:</strong> Damp moss smell, sound of dripping water, absolute pitch black darkness." },
            
            { id: "tb4", type: "h2", content: "Notable Areas" },
            { id: "tb5", type: "list-bullet", content: "<strong>Area 1: The Vestibule</strong>. A crumbling entryway with double stone doors carved with dragon scales." },
            { id: "tb6", type: "list-bullet", content: "<strong>Area 2: The Main Vault</strong>. A large room housing a drained fountain and columns carved like weeping titans." },
            
            { id: "tb7", type: "h2", content: "Hazards & Secrets" },
            { id: "tb8", type: "list-checkbox", content: "Hidden door in Area 2 (requires DC 15 Investigation check)." },
            { id: "tb9", type: "list-checkbox", content: "Poison dart trap on the chest in Area 2 (requires DC 14 Sleight of Hand to disarm)." },
            
            { id: "tb10", type: "h2", content: "Encounters & Lore" },
            { id: "tb11", type: "paragraph", content: "Who controls this area? Add a list of monsters or link to the owner: [[Lord Malakor]]." }
        ]
    },
    
    faction: {
        title: "New Faction",
        tags: ["Faction", "Group"],
        blocks: [
            { id: "tb1", type: "h1", content: "Faction Name" },
            { id: "tb2", type: "paragraph", content: "What is this organization's history? What is their public reputation, and what is their secret agenda?" },
            
            { id: "tb3", type: "h2", content: "Command & Hierarchy" },
            { id: "tb4", type: "list-bullet", content: "<strong>Leader</strong>: [[Lord Malakor]]" },
            { id: "tb5", type: "list-bullet", content: "<strong>Key Lieutenants</strong>: List prominent members here." },
            { id: "tb6", type: "list-bullet", content: "<strong>Bases of Operation</strong>: [[The Obsidian Tower]]" },
            
            { id: "tb7", type: "h2", content: "Goals & Resources" },
            { id: "tb8", type: "paragraph", content: "Detail what they own (ships, libraries, soldiers) and what they want to achieve in the current campaign." },
            
            { id: "tb9", type: "h2", content: "Relations & Influence" },
            { id: "tb10", type: "callout", content: "<strong>Solaria Council</strong>: Hostile | <strong>The Syndicate</strong>: Friendly | <strong>The Outland Rangers</strong>: Neutral" }
        ]
    },
    
    item: {
        title: "New Magic Item",
        tags: ["Item", "Loot"],
        blocks: [
            { id: "tb1", type: "h1", content: "Magic Item Name" },
            { id: "tb2", type: "callout", content: "<em>Item, rarity (requires attunement)</em>" },
            
            { id: "tb3", type: "paragraph", content: "Describe the physical details: is it cold to the touch, does it hum with electric blue magic, or is it heavy and covered in dust?" },
            
            { id: "tb4", type: "h2", content: "Item Properties" },
            { id: "tb5", type: "list-bullet", content: "<strong>Bonus</strong>: You gain a +1 bonus to attack and damage rolls made with this magic weapon." },
            { id: "tb6", type: "list-bullet", content: "<strong>Active Ability</strong>: Once per long rest, you can use a bonus action to shroud yourself in shadow for 1 minute." },
            
            { id: "tb7", type: "h2", content: "History & Curses" },
            { id: "tb8", type: "paragraph", content: "Who forged it? Are there side effects or curses associated with carrying it?" }
        ]
    },
    
    session: {
        title: "New Session Log",
        tags: ["Session-Log"],
        blocks: [
            { id: "tb1", type: "h1", content: "Session # Log: Title" },
            { id: "tb2", type: "callout", content: "<strong>Campaign Date:</strong> Day 12 of the Solar Cycle<br><strong>Real Date:</strong> " + new Date().toLocaleDateString() + "<br><strong>Attendees:</strong> Player A, Player B, Player C" },
            
            { id: "tb3", type: "h2", content: "Summary of Events" },
            { id: "tb4", type: "list-numbered", content: "The party arrived in Solaria and bypassed the checkpoint guard by bribing them with raw soul-gems." },
            { id: "tb5", type: "list-numbered", content: "Met with their contact at the Tavern who told them about [[Lord Malakor]]." },
            { id: "tb6", type: "list-numbered", content: "Fought a group of Shadow Ghouls in the alleyway behind the market." },
            
            { id: "tb7", type: "h2", content: "Quests & Threads" },
            { id: "tb8", type: "list-checkbox", content: "Investigate [[The Obsidian Tower]] (Active)" },
            { id: "tb9", type: "list-checkbox", content: "Report back to Solaria Council (Pending)" },
            
            { id: "tb10", type: "h2", content: "Loot & Rewards" },
            { id: "tb11", type: "paragraph", content: "<strong>Gold:</strong> 150 gp<br><strong>Items Found:</strong> [[Magic Item Name]]<br><strong>XP:</strong> 400 XP per player." }
        ]
    }
};

// Generates a clean copy of blocks for a template
export function getTemplateBlocks(templateName) {
    const template = TEMPLATES[templateName] || TEMPLATES.blank;
    
    // Deep clone blocks and assign unique IDs to prevent block collision
    return template.blocks.map((block, idx) => ({
        id: "b_" + Date.now() + "_" + idx + "_" + Math.floor(Math.random() * 1000),
        type: block.type,
        content: block.content
    }));
}
