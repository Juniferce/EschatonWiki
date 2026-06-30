/*
   Eschaton Wiki - Visual Connections Engine & Interactive Map (nodemap.js)
   Maps structural hierarchy and inline hyperlinked network connections.
*/

export function getConnections(pages) {
    const nodes = pages.map(p => ({
        id: p.id,
        title: p.title || "Untitled Page",
        tags: p.tags || []
    }));

    const edges = [];
    const addedEdges = new Set();
    const folderGroups = new Map(); // Map: parentId -> [childId1, childId2, ...]

    const addEdge = (source, target, type) => {
        const key = source < target ? `${source}-${target}` : `${target}-${source}`;
        if (!addedEdges.has(key)) {
            addedEdges.add(key);
            edges.push({ source, target, type });
        }
    };

    pages.forEach(p => {
        // Add parentId to node for easier lookup in map
        const node = nodes.find(n => n.id === p.id);
        if (node) node.parentId = p.parentId || null;

        // Hierarchy connections
        if (p.parentId) {
            const parentExists = pages.some(parent => parent.id === p.parentId);
            if (parentExists) {
                if (!folderGroups.has(p.parentId)) {
                    folderGroups.set(p.parentId, []);
                }
                folderGroups.get(p.parentId).push(p.id);
                addEdge(p.id, p.parentId, "hierarchy");
            }
        }

        // Content hyperlinks parser
        if (p.blocks) {
            p.blocks.forEach(b => {
                if (b.content) {
                    const regex = /data-page-id="([^"]+)"/g;
                    let match;
                    while ((match = regex.exec(b.content)) !== null) {
                        const targetId = match[1];
                        const targetExists = pages.some(target => target.id === targetId);
                        if (targetExists && targetId !== p.id) {
                            addEdge(p.id, targetId, "link");
                        }
                    }
                }
            });
        }
    });

    return { nodes, edges, folderGroups };
}

export class InteractiveMap {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext("2d");
        this.isLocal = options.isLocal || false;
        this.activePageId = options.activePageId || null;
        this.onNodeClick = options.onNodeClick || (() => {});

        this.nodes = [];
        this.edges = [];
        this.folderGroups = new Map(); // All folder groups
        this.currentFolderGroups = new Map(); // Filtered groups for drawing (local vs full)
        this.nodeMap = new Map();

        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;

        this.hoveredNode = null;
        this.draggedNode = null;
        this.isPanning = false;
        this.startX = 0;
        this.startY = 0;
        this.loopActive = false;

        this.initEvents();
    }

    setData(nodes, edges, folderGroups, activePageId = null) {
        this.activePageId = activePageId;
        this.folderGroups = folderGroups; // Store the full set of groups
        
        let filteredNodes = nodes;
        let filteredEdges = edges;
        let currentFolderGroupsForDrawing = new Map();

        if (this.isLocal && activePageId) {
            const relevantNodeIds = new Set([activePageId]);
            
            // Add direct neighbors
            edges.forEach(e => { // Use original 'edges' for neighbor calculation
                if (e.source === activePageId) relevantNodeIds.add(e.target);
                if (e.target === activePageId) relevantNodeIds.add(e.source);
            });

            // Identify all nodes that are part of any folder group containing a relevant node
            const nodesToIncludeFromGroups = new Set();
            folderGroups.forEach((groupChildrenIds, parentId) => {
                const parentNodeIsRelevant = relevantNodeIds.has(parentId);
                const anyChildIsRelevant = groupChildrenIds.some(childId => relevantNodeIds.has(childId));

                if (parentNodeIsRelevant || anyChildIsRelevant) {
                    nodesToIncludeFromGroups.add(parentId); // Always include parent if group is relevant
                    groupChildrenIds.forEach(childId => nodesToIncludeFromGroups.add(childId)); // Include all children
                }
            });
            nodesToIncludeFromGroups.forEach(id => relevantNodeIds.add(id)); // Add these to the overall relevant set

            filteredNodes = nodes.filter(n => relevantNodeIds.has(n.id));
            filteredEdges = edges.filter(e => relevantNodeIds.has(e.source) && relevantNodeIds.has(e.target));
            
            // Reconstruct folder groups based on filtered nodes
            folderGroups.forEach((groupChildrenIds, parentId) => {
                if (relevantNodeIds.has(parentId)) { // Only consider groups whose parent is relevant
                    const filteredChildren = groupChildrenIds.filter(childId => relevantNodeIds.has(childId));
                    if (filteredChildren.length > 0) { // If there are relevant children
                        currentFolderGroupsForDrawing.set(parentId, filteredChildren);
                    }
                }
            });

        } else {
            filteredNodes = nodes;
            filteredEdges = edges;
            currentFolderGroupsForDrawing = folderGroups;
        }

        const oldCoords = new Map(this.nodes.map(n => [n.id, { x: n.x, y: n.y }]));
        this.nodes = filteredNodes.map(n => ({
                ...n,
                x: oldCoords.get(n.id)?.x || (Math.random() - 0.5) * (this.isLocal ? 120 : 300),
                y: oldCoords.get(n.id)?.y || (Math.random() - 0.5) * (this.isLocal ? 120 : 300),
                vx: 0,
                vy: 0
            }));
        this.edges = filteredEdges;
        this.nodeMap = new Map(this.nodes.map(n => [n.id, n]));
        this.currentFolderGroups = currentFolderGroupsForDrawing;
        
        if (this.isLocal) {
            this.panX = this.canvas.width / 2;
            this.panY = this.canvas.height / 2;
            this.zoom = 1;
        } else if (this.panX === 0 && this.panY === 0) {
            this.panX = this.canvas.width / 2;
            this.panY = this.canvas.height / 2;
        }
    }

    initEvents() {
        this.canvas.addEventListener("mousedown", (e) => {
            const mousePos = this.getTransformedMousePos(e);
            const clickedNode = this.getNodeAt(mousePos.x, mousePos.y);

            if (clickedNode) {
                this.draggedNode = clickedNode;
            } else {
                this.isPanning = true;
                this.startX = e.clientX - this.panX;
                this.startY = e.clientY - this.panY;
            }
        });

        this.canvas.addEventListener("mousemove", (e) => {
            const mousePos = this.getTransformedMousePos(e);
            
            if (this.draggedNode) {
                this.draggedNode.x = mousePos.x;
                this.draggedNode.y = mousePos.y;
            } else if (this.isPanning) {
                this.panX = e.clientX - this.startX;
                this.panY = e.clientY - this.startY;
            } else {
                this.hoveredNode = this.getNodeAt(mousePos.x, mousePos.y);
                this.canvas.style.cursor = this.hoveredNode ? "pointer" : "default";
            }
        });

        this.canvas.addEventListener("mouseup", () => {
            this.draggedNode = null;
            this.isPanning = false;
        });

        this.canvas.addEventListener("mouseleave", () => {
            this.draggedNode = null;
            this.isPanning = false;
            this.hoveredNode = null;
        });

        this.canvas.addEventListener("click", (e) => {
            const mousePos = this.getTransformedMousePos(e);
            const clickedNode = this.getNodeAt(mousePos.x, mousePos.y);
            if (clickedNode) {
                this.onNodeClick(clickedNode.id);
            }
        });

        this.canvas.addEventListener("wheel", (e) => {
            e.preventDefault();
            const zoomIntensity = 0.05;
            const mousePos = this.getCanvasMousePos(e);

            const mouseXInWorld = (mousePos.x - this.panX) / this.zoom;
            const mouseYInWorld = (mousePos.y - this.panY) / this.zoom;

            if (e.deltaY < 0) {
                this.zoom += this.zoom * zoomIntensity;
            } else {
                this.zoom -= this.zoom * zoomIntensity;
            }
            this.zoom = Math.max(0.1, Math.min(this.zoom, 4));

            this.panX = mousePos.x - mouseXInWorld * this.zoom;
            this.panY = mousePos.y - mouseYInWorld * this.zoom;
        }, { passive: false });
    }

    getCanvasMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    getTransformedMousePos(e) {
        const mousePos = this.getCanvasMousePos(e);
        return {
            x: (mousePos.x - this.panX) / this.zoom,
            y: (mousePos.y - this.panY) / this.zoom
        };
    }

    getNodeAt(x, y) {
        for (const n of this.nodes) {
            const dx = n.x - x;
            const dy = n.y - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= 15) return n;
        }
        return null;
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    updatePhysics() {
        const kRepulsion = 1200;
        const kAttraction = 0.04;
        const kGravity = 0.015;
        const damping = 0.85;

        for (let i = 0; i < this.nodes.length; i++) {
            const n1 = this.nodes[i];
            if (n1 === this.draggedNode) continue;

            for (let j = i + 1; j < this.nodes.length; j++) {
                const n2 = this.nodes[j];
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const distSq = dx * dx + dy * dy || 1;
                const dist = Math.sqrt(distSq);

                if (dist < 300) {
                    const force = kRepulsion / distSq;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;

                    n1.vx -= fx;
                    n1.vy -= fy;
                    n2.vx += fx;
                    n2.vy += fy;
                }
            }
        }

        this.edges.forEach(e => {
            const n1 = this.nodeMap.get(e.source);
            const n2 = this.nodeMap.get(e.target);
            if (!n1 || !n2) return;

            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            
            const desiredDist = e.type === "hierarchy" ? 60 : 100;
            const force = (dist - desiredDist) * kAttraction;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (n1 !== this.draggedNode) {
                n1.vx += fx;
                n1.vy += fy;
            }
            if (n2 !== this.draggedNode) {
                n2.vx -= fx;
                n2.vy -= fy;
            }
        });

        // Group-to-Group Repulsion to prevent folder blobs from overlapping
        const groups = [];
        const groupedNodeIds = new Set();
        this.currentFolderGroups.forEach((groupChildrenIds, parentId) => {
            const parentNode = this.nodeMap.get(parentId);
            const childNodes = groupChildrenIds.map(id => this.nodeMap.get(id)).filter(Boolean);
            const allNodes = parentNode ? [parentNode, ...childNodes] : childNodes;
            
            if (allNodes.length === 0) return;

            groupedNodeIds.add(parentId);
            groupChildrenIds.forEach(id => groupedNodeIds.add(id));

            // Calculate centroid of the group
            let sumX = 0, sumY = 0;
            allNodes.forEach(n => {
                sumX += n.x;
                sumY += n.y;
            });
            const cx = sumX / allNodes.length;
            const cy = sumY / allNodes.length;

            // Calculate bounding radius based on max distance to centroid
            let maxDist = 0;
            allNodes.forEach(n => {
                const dx = n.x - cx;
                const dy = n.y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > maxDist) maxDist = dist;
            });

            groups.push({
                nodes: allNodes,
                cx,
                cy,
                radius: maxDist + 35, // Bounding radius with safety padding
                isFolderGroup: true
            });
        });

        // Add independent nodes as single-node entities in the repulsion system
        this.nodes.forEach(n => {
            if (!groupedNodeIds.has(n.id)) {
                groups.push({
                    nodes: [n],
                    cx: n.x,
                    cy: n.y,
                    radius: 25, // Base buffer radius for independent nodes
                    isFolderGroup: false
                });
            }
        });

        const kGroupRepulsion = 0.08;
        for (let i = 0; i < groups.length; i++) {
            const g1 = groups[i];
            for (let j = i + 1; j < groups.length; j++) {
                const g2 = groups[j];
                
                // If both are independent nodes, skip (handled by standard node repulsion)
                if (!g1.isFolderGroup && !g2.isFolderGroup) continue;

                const dx = g2.cx - g1.cx;
                const dy = g2.cy - g1.cy;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const minDist = g1.radius + g2.radius;

                if (dist < minDist) {
                    const overlap = minDist - dist;
                    const force = overlap * kGroupRepulsion;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;

                    // Apply outward forces to all member nodes
                    g1.nodes.forEach(n => {
                        if (n !== this.draggedNode) {
                            n.vx -= fx;
                            n.vy -= fy;
                        }
                    });
                    g2.nodes.forEach(n => {
                        if (n !== this.draggedNode) {
                            n.vx += fx;
                            n.vy += fy;
                        }
                    });
                }
            }
        }

        this.nodes.forEach(n => {
            if (n === this.draggedNode) return;
            n.vx -= n.x * kGravity;
            n.vy -= n.y * kGravity;

            n.x += n.vx;
            n.y += n.vy;
            n.vx *= damping;
            n.vy *= damping;
        });
    }

    getNodeColor(node) {
        if (node.tags) {
            if (node.tags.includes("NPC")) return "#e06c75";
            if (node.tags.includes("Location")) return "#98c379";
            if (node.tags.includes("Faction")) return "#56b6c2";
            if (node.tags.includes("Item")) return "#c678dd";
            if (node.tags.includes("Session-Log")) return "#e5c07b";
        }
        return "#61afef";
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.translate(this.panX, this.panY);
        this.ctx.scale(this.zoom, this.zoom);

        // 1. Draw Folder Blobs
        this.currentFolderGroups.forEach((groupChildrenIds, parentId) => {
            const parentNode = this.nodeMap.get(parentId);
            const childNodes = groupChildrenIds.map(id => this.nodeMap.get(id)).filter(Boolean);

            let allBlobNodes = [...childNodes];
            if (parentNode) { // Include parent node in blob calculation if it exists
                allBlobNodes.push(parentNode);
            }

            if (allBlobNodes.length < 1) return; // Need at least one node to draw a blob

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            allBlobNodes.forEach(n => {
                minX = Math.min(minX, n.x);
                minY = Math.min(minY, n.y);
                maxX = Math.max(maxX, n.x);
                maxY = Math.max(maxY, n.y);
            });

            const padding = 30; // Padding around the nodes for the blob
            minX -= padding;
            minY -= padding;
            maxX += padding;
            maxY += padding;

            const cornerRadius = 20; // Rounded corners for the blob
            const wiggleAmount = 8; // How much the line wiggles
            const segmentLength = 15; // Length of segments for wiggling

            this.ctx.beginPath();
            // Start near top-left corner
            this.ctx.moveTo(minX + cornerRadius + (Math.random() - 0.5) * wiggleAmount, minY + (Math.random() - 0.5) * wiggleAmount);

            // Top edge
            for (let x = minX + cornerRadius; x <= maxX - cornerRadius; x += segmentLength) {
                this.ctx.lineTo(x + (Math.random() - 0.5) * wiggleAmount, minY + (Math.random() - 0.5) * wiggleAmount);
            }
            this.ctx.arcTo(maxX, minY, maxX, minY + cornerRadius, cornerRadius);

            // Right edge
            for (let y = minY + cornerRadius; y <= maxY - cornerRadius; y += segmentLength) {
                this.ctx.lineTo(maxX + (Math.random() - 0.5) * wiggleAmount, y + (Math.random() - 0.5) * wiggleAmount);
            }
            this.ctx.arcTo(maxX, maxY, maxX - cornerRadius, maxY, cornerRadius);

            // Bottom edge
            for (let x = maxX - cornerRadius; x >= minX + cornerRadius; x -= segmentLength) {
                this.ctx.lineTo(x + (Math.random() - 0.5) * wiggleAmount, maxY + (Math.random() - 0.5) * wiggleAmount);
            }
            this.ctx.arcTo(minX, maxY, minX, maxY - cornerRadius, cornerRadius);

            // Left edge
            for (let y = maxY - cornerRadius; y >= minY + cornerRadius; y -= segmentLength) {
                this.ctx.lineTo(minX + (Math.random() - 0.5) * wiggleAmount, y + (Math.random() - 0.5) * wiggleAmount);
            }
            this.ctx.arcTo(minX, minY, minX + cornerRadius, minY, cornerRadius);
            this.ctx.closePath();

            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; // Dashed line for folder
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([8, 8]);
            this.ctx.stroke();
            this.ctx.setLineDash([]); // Reset line dash
        });

        this.edges.forEach(e => {
            const n1 = this.nodeMap.get(e.source);
            const n2 = this.nodeMap.get(e.target);
            if (!n1 || !n2) return;

            // Check if both nodes are part of the same folder group
            let inSameFolderGroup = false;
            for (const [parentId, groupChildrenIds] of this.currentFolderGroups.entries()) {
                // A node is considered "in a folder group" if it's the parent or one of the children
                const n1InGroup = groupChildrenIds.includes(n1.id) || (n1.parentId === parentId && n1.id === parentId);
                const n2InGroup = groupChildrenIds.includes(n2.id) || (n2.parentId === parentId && n2.id === parentId);
                if (n1InGroup && n2InGroup && n1.parentId === n2.parentId && n1.parentId !== null) {
                    inSameFolderGroup = true;
                    break;
                }
            }

            if (e.type === "hierarchy" && inSameFolderGroup) {
                return; // Don't draw hierarchy lines if they are within the same blob
            }

            this.ctx.beginPath();
            this.ctx.moveTo(n1.x, n1.y);
            this.ctx.lineTo(n2.x, n2.y);

            const isHoveredEdge = this.hoveredNode && (this.hoveredNode.id === e.source || this.hoveredNode.id === e.target);
            
            if (isHoveredEdge) {
                this.ctx.strokeStyle = "rgba(97, 175, 239, 0.8)";
                this.ctx.lineWidth = 2;
            } else {
                this.ctx.strokeStyle = e.type === "hierarchy" ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.08)";
                this.ctx.lineWidth = 1;
                if (e.type === "hierarchy") {
                    this.ctx.setLineDash([4, 4]);
                } else {
                    this.ctx.setLineDash([]);
                }
            }
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        });

        this.nodes.forEach(n => {
            const color = this.getNodeColor(n);
            const isHovered = this.hoveredNode === n;
            const isActive = n.id === this.activePageId;
            const radius = isActive ? 12 : (isHovered ? 10 : 8);

            if (isActive) {
                this.ctx.beginPath();
                this.ctx.arc(n.x, n.y, radius + 5, 0, Math.PI * 2);
                this.ctx.fillStyle = "rgba(229, 192, 123, 0.15)";
                this.ctx.fill();
            }

            this.ctx.beginPath();
            this.ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
            this.ctx.fillStyle = color;
            this.ctx.fill();

            this.ctx.lineWidth = 2;
            if (isActive) {
                this.ctx.strokeStyle = "#e5c07b";
            } else if (isHovered) {
                this.ctx.strokeStyle = "#ffffff";
            } else {
                this.ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
            }
            this.ctx.stroke();

            this.ctx.font = isActive ? "bold 11px Inter, sans-serif" : "10px Inter, sans-serif";
            this.ctx.textAlign = "center";
            
            const labelY = n.y + radius + 14;
            const textWidth = this.ctx.measureText(n.title).width;
            
            this.ctx.fillStyle = "rgba(20, 20, 20, 0.65)";
            this.ctx.fillRect(n.x - textWidth / 2 - 4, labelY - 9, textWidth + 8, 13);
            
            this.ctx.fillStyle = isActive ? "#ffffff" : (isHovered ? "#61afef" : "rgba(255, 255, 255, 0.8)");
            this.ctx.fillText(n.title, n.x, labelY);
        });

        this.ctx.restore();
    }

    startLoop() {
        if (this.loopActive) return;
        this.loopActive = true;
        const tick = () => {
            if (!this.loopActive) return;
            this.updatePhysics();
            this.draw();
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    stopLoop() {
        this.loopActive = false;
    }
}