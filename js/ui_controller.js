import { CathedralAudio } from './cathedral_audio.js';
import { ChronosEngine } from './chronos_engine.js';

const audio = new CathedralAudio();
const fallbackEngine = new ChronosEngine();

let worker = null;
try {
    worker = new Worker('/js/chronos_worker.js', { type: 'module' });
} catch (e) {
    console.warn('[Worker] Web Worker initialization failed; using main-thread fallback:', e);
}

class WizardChessApp {
    constructor() {
        this.setupMode = 'standard';
        this.skillLevel = 'chronos'; // Default to Chronos (Stockfish Slayer)
        this.gameMode = 'ai'; // 'ai' | 'showcase' | '2p'
        this.coinFlipEnabled = true; // Chronos rule enabled by default
        this.fairnessAlgorithm = 'balanced';
        this.snowballCap = 2; // User choice: 2x Chained Cap
        this.consecutiveBonusTurns = 0;
        this.bonusTurnActive = false;
        this.isGameOver = false;
        this.isCoinFlipping = false;
        this.selectedSquare = null;
        this.validMovesForSelected = [];
        this.lastMoveSquares = null;
        this.pendingPromotionMove = null;
        this.history = [];
        this.capturedCount = { w: 0, b: 0 };
        this.nextPieceId = 1;
        this.turn = 'w';
        this.board = Array(8).fill(null).map(() => Array(8).fill(null));

        this.coinStats = {
            totalFlips: 0,
            heads: 0,
            tails: 0,
            marbleBonus: 0,
            obsidianBonus: 0,
            consecutiveCount: 0,
            lastFace: null
        };

        this.initBoard();
    }

    generateBackRank(mode) {
        if (mode === 'standard') {
            return ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
        }
        if (mode === '960') {
            const rank = Array(8).fill(null);
            const lightSquares = [0, 2, 4, 6];
            const darkSquares = [1, 3, 5, 7];
            rank[lightSquares[Math.floor(Math.random() * 4)]] = 'b';
            rank[darkSquares[Math.floor(Math.random() * 4)]] = 'b';
            const emptyIndices = () => rank.map((v, i) => v === null ? i : -1).filter(i => i !== -1);
            let empty = emptyIndices();
            rank[empty[Math.floor(Math.random() * empty.length)]] = 'q';
            empty = emptyIndices();
            const n1 = empty.splice(Math.floor(Math.random() * empty.length), 1)[0];
            const n2 = empty.splice(Math.floor(Math.random() * empty.length), 1)[0];
            rank[n1] = 'n';
            rank[n2] = 'n';
            empty.sort((a, b) => a - b);
            rank[empty[0]] = 'r';
            rank[empty[1]] = 'k';
            rank[empty[2]] = 'r';
            return rank;
        }
        const pool = ['r', 'n', 'b', 'q'];
        const rank = Array(8).fill(null).map(() => pool[Math.floor(Math.random() * pool.length)]);
        rank[2 + Math.floor(Math.random() * 4)] = 'k';
        return rank;
    }

    initBoard() {
        this.board = Array(8).fill(null).map(() => Array(8).fill(null));
        this.turn = 'w';
        this.bonusTurnActive = false;
        this.consecutiveBonusTurns = 0;
        this.history = [];
        this.capturedCount = { w: 0, b: 0 };
        this.nextPieceId = 1;

        const whiteRank = this.generateBackRank(this.setupMode);
        const blackRank = this.setupMode === 'chaos' ? this.generateBackRank('chaos') : [...whiteRank];

        for (let c = 0; c < 8; c++) {
            this.board[0][c] = { id: this.nextPieceId++, type: blackRank[c], color: 'b' };
            this.board[1][c] = { id: this.nextPieceId++, type: 'p', color: 'b' };
            this.board[6][c] = { id: this.nextPieceId++, type: 'p', color: 'w' };
            this.board[7][c] = { id: this.nextPieceId++, type: whiteRank[c], color: 'w' };
        }
    }

    inBounds(r, c) {
        return r >= 0 && r < 8 && c >= 0 && c < 8;
    }

    findKing(color, boardState = this.board) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = boardState[r][c];
                if (p && p.color === color && p.type === 'k') return { r, c };
            }
        }
        return null;
    }

    isSquareAttacked(targetR, targetC, attackerColor, boardState = this.board) {
        const pawnDir = attackerColor === 'w' ? 1 : -1;
        for (const dc of [-1, 1]) {
            const pr = targetR + pawnDir;
            const pc = targetC + dc;
            if (this.inBounds(pr, pc)) {
                const p = boardState[pr][pc];
                if (p && p.color === attackerColor && p.type === 'p') return true;
            }
        }
        const knightOffsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        for (const [dr, dc] of knightOffsets) {
            const nr = targetR + dr;
            const nc = targetC + dc;
            if (this.inBounds(nr, nc)) {
                const p = boardState[nr][nc];
                if (p && p.color === attackerColor && p.type === 'n') return true;
            }
        }
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const kr = targetR + dr;
                const kc = targetC + dc;
                if (this.inBounds(kr, kc)) {
                    const p = boardState[kr][kc];
                    if (p && p.color === attackerColor && p.type === 'k') return true;
                }
            }
        }
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
        for (let i = 0; i < dirs.length; i++) {
            const [dr, dc] = dirs[i];
            const isOrtho = i < 4;
            let nr = targetR + dr;
            let nc = targetC + dc;
            while (this.inBounds(nr, nc)) {
                const p = boardState[nr][nc];
                if (p) {
                    if (p.color === attackerColor) {
                        if (isOrtho && (p.type === 'r' || p.type === 'q')) return true;
                        if (!isOrtho && (p.type === 'b' || p.type === 'q')) return true;
                    }
                    break;
                }
                nr += dr;
                nc += dc;
            }
        }
        return false;
    }

    inCheck(color, boardState = this.board) {
        const kPos = this.findKing(color, boardState);
        if (!kPos) return true;
        const enemy = color === 'w' ? 'b' : 'w';
        return this.isSquareAttacked(kPos.r, kPos.c, enemy, boardState);
    }

    getLegalMovesForSquare(r, c) {
        const piece = this.board[r][c];
        if (!piece || piece.color !== this.turn) return [];
        const enemy = piece.color === 'w' ? 'b' : 'w';
        const pseudo = [];

        if (piece.type === 'p') {
            const dir = piece.color === 'w' ? -1 : 1;
            const startRow = piece.color === 'w' ? 6 : 1;
            const promoRow = piece.color === 'w' ? 0 : 7;
            const r1 = r + dir;
            if (this.inBounds(r1, c) && !this.board[r1][c]) {
                pseudo.push({ from: { r, c }, to: { r: r1, c }, promotion: r1 === promoRow });
                const r2 = r + dir * 2;
                if (r === startRow && this.inBounds(r2, c) && !this.board[r2][c]) {
                    pseudo.push({ from: { r, c }, to: { r: r2, c } });
                }
            }
            for (const dc of [-1, 1]) {
                const cr = r + dir;
                const cc = c + dc;
                if (this.inBounds(cr, cc)) {
                    const target = this.board[cr][cc];
                    if (target && target.color === enemy) {
                        pseudo.push({ from: { r, c }, to: { r: cr, c: cc }, captured: target, promotion: cr === promoRow });
                    }
                }
            }
        } else if (piece.type === 'n') {
            const offsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
            for (const [dr, dc] of offsets) {
                const nr = r + dr;
                const nc = c + dc;
                if (this.inBounds(nr, nc)) {
                    const target = this.board[nr][nc];
                    if (!target || target.color === enemy) {
                        pseudo.push({ from: { r, c }, to: { r: nr, c: nc }, captured: target || null });
                    }
                }
            }
        } else if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
            const dirs = [];
            if (piece.type === 'b' || piece.type === 'q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
            if (piece.type === 'r' || piece.type === 'q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
            for (const [dr, dc] of dirs) {
                let nr = r + dr;
                let nc = c + dc;
                while (this.inBounds(nr, nc)) {
                    const target = this.board[nr][nc];
                    if (!target) {
                        pseudo.push({ from: { r, c }, to: { r: nr, c: nc } });
                    } else {
                        if (target.color === enemy) {
                            pseudo.push({ from: { r, c }, to: { r: nr, c: nc }, captured: target });
                        }
                        break;
                    }
                    nr += dr;
                    nc += dc;
                }
            }
        } else if (piece.type === 'k') {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr;
                    const nc = c + dc;
                    if (this.inBounds(nr, nc)) {
                        const target = this.board[nr][nc];
                        if (!target || target.color === enemy) {
                            pseudo.push({ from: { r, c }, to: { r: nr, c: nc }, captured: target || null });
                        }
                    }
                }
            }
        }

        const legal = [];
        for (const m of pseudo) {
            if (m.captured && m.captured.type === 'k') {
                legal.push(m);
                continue;
            }
            const test = this.board.map(row => row.map(cell => cell ? { ...cell } : null));
            const moving = test[m.from.r][m.from.c];
            test[m.from.r][m.from.c] = null;
            test[m.to.r][m.to.c] = moving;
            if (m.promotion) moving.type = 'q';
            if (!this.inCheck(piece.color, test)) {
                legal.push(m);
            }
        }
        return legal;
    }

    getAllLegalMoves(color = this.turn) {
        const saved = this.turn;
        this.turn = color;
        const all = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.board[r][c] && this.board[r][c].color === color) {
                    all.push(...this.getLegalMovesForSquare(r, c));
                }
            }
        }
        this.turn = saved;
        return all;
    }

    getCryptoFairFlip(moverColor) {
        const array = new Uint32Array(1);
        window.crypto.getRandomValues(array);
        const rawProb = array[0] / (0xffffffff + 1);
        let isHeads = rawProb < 0.5;

        if (this.fairnessAlgorithm === 'balanced' && this.coinStats.consecutiveCount >= 2) {
            if (this.coinStats.lastFace === 'heads') isHeads = false;
            else if (this.coinStats.lastFace === 'tails') isHeads = true;
        }

        this.coinStats.totalFlips++;
        if (isHeads) {
            this.coinStats.heads++;
            if (moverColor === 'w') this.coinStats.marbleBonus++;
            else this.coinStats.obsidianBonus++;
        } else {
            this.coinStats.tails++;
        }

        if (this.coinStats.lastFace === (isHeads ? 'heads' : 'tails')) {
            this.coinStats.consecutiveCount++;
        } else {
            this.coinStats.lastFace = isHeads ? 'heads' : 'tails';
            this.coinStats.consecutiveCount = 1;
        }
        return { isHeads, rawEntropy: rawProb.toFixed(5) };
    }

    executeMove(move, chosenPromotion = 'q') {
        const snapshot = {
            board: this.board.map(row => row.map(c => c ? { ...c } : null)),
            turn: this.turn,
            consecutiveBonusTurns: this.consecutiveBonusTurns,
            bonusTurnActive: this.bonusTurnActive,
            capturedCount: { ...this.capturedCount }
        };

        const piece = this.board[move.from.r][move.from.c];
        this.board[move.from.r][move.from.c] = null;

        if (move.captured) {
            this.capturedCount[piece.color]++;
        }
        if (move.promotion) {
            piece.type = chosenPromotion || 'q';
        }
        this.board[move.to.r][move.to.c] = piece;

        const files = 'abcdefgh';
        const notation = `${piece.type.toUpperCase()}${files[move.from.c]}${8 - move.from.r}${move.captured ? 'x' : '→'}${files[move.to.c]}${8 - move.to.r}`;

        this.turn = this.turn === 'w' ? 'b' : 'w';
        this.history.push({ snapshot, move, notation });
        return notation;
    }
}

// Instantiate Game Application
const game = new WizardChessApp();

// THREE.JS 3D SCENE SETUP
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0a0f);
scene.fog = new THREE.FogExp2(0x0b0a0f, 0.018);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Materials & Textures
function createStoneTexture(baseColor, veinColor) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = veinColor;
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 18; i++) {
        ctx.beginPath();
        let x = Math.random() * 256;
        let y = 0;
        ctx.moveTo(x, y);
        while (y < 256) {
            y += 24;
            x += (Math.random() - 0.5) * 36;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

const marbleTex = createStoneTexture('#f3efe6', 'rgba(160, 152, 140, 0.28)');
const obsidianTex = createStoneTexture('#14111d', 'rgba(168, 85, 247, 0.22)');

const marblePieceMat = new THREE.MeshStandardMaterial({ map: marbleTex, color: 0xf7f4eb, roughness: 0.22, metalness: 0.08 });
const marbleGoldTrimMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.25, metalness: 0.85, emissive: 0x3b2806, emissiveIntensity: 0.35 });
const obsidianPieceMat = new THREE.MeshStandardMaterial({ map: obsidianTex, color: 0x1a1528, roughness: 0.14, metalness: 0.48 });
const obsidianRuneTrimMat = new THREE.MeshStandardMaterial({ color: 0xa855f7, roughness: 0.2, metalness: 0.6, emissive: 0x6b21a8, emissiveIntensity: 0.75 });

// Lighting
const ambientLight = new THREE.AmbientLight(0x2e2640, 1.15);
scene.add(ambientLight);

const moonSpot = new THREE.SpotLight(0xc4b5fd, 2.2);
moonSpot.position.set(0, 26, -12);
moonSpot.angle = Math.PI / 3;
moonSpot.penumbra = 0.6;
moonSpot.castShadow = true;
scene.add(moonSpot);

const warmLight1 = new THREE.PointLight(0xf59e0b, 1.35, 32);
warmLight1.position.set(-10, 8, 8);
scene.add(warmLight1);

const warmLight2 = new THREE.PointLight(0xf59e0b, 1.35, 32);
warmLight2.position.set(10, 8, -8);
scene.add(warmLight2);

// Cathedral Architecture
const cathedralGroup = new THREE.Group();
scene.add(cathedralGroup);

const gothicStoneMat = new THREE.MeshStandardMaterial({ color: 0x1c1926, roughness: 0.85, metalness: 0.12 });
const darkFloorMat = new THREE.MeshStandardMaterial({ color: 0x110f18, roughness: 0.7, metalness: 0.2 });

const naveFloor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), darkFloorMat);
naveFloor.rotation.x = -Math.PI / 2;
naveFloor.position.y = -2.2;
naveFloor.receiveShadow = true;
cathedralGroup.add(naveFloor);

for (let i = 0; i < 3; i++) {
    const size = 16.5 - i * 1.6;
    const step = new THREE.Mesh(new THREE.BoxGeometry(size, 0.6, size), gothicStoneMat);
    step.position.y = -1.9 + i * 0.6;
    step.receiveShadow = true;
    cathedralGroup.add(step);
}

// Gothic Columns & Vault Ribs
[-18, -9, 0, 9, 18].forEach(z => {
    [-14, 14].forEach(x => {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 26, 12), gothicStoneMat);
        col.position.set(x, 10.8, z);
        col.castShadow = true;
        cathedralGroup.add(col);
    });
});

// Cathedral Rose Stained Glass
const roseGroup = new THREE.Group();
roseGroup.position.set(0, 14, -26);
roseGroup.add(new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.55, 12, 48), gothicStoneMat));
roseGroup.add(new THREE.Mesh(new THREE.CircleGeometry(6.2, 32), new THREE.MeshBasicMaterial({ color: 0x6d28d9, transparent: true, opacity: 0.42 })));
cathedralGroup.add(roseGroup);

// Dust Motes
const dustGeo = new THREE.BufferGeometry();
const dustPositions = new Float32Array(220 * 3);
for (let i = 0; i < 220 * 3; i += 3) {
    dustPositions[i] = (Math.random() - 0.5) * 30;
    dustPositions[i + 1] = Math.random() * 18;
    dustPositions[i + 2] = (Math.random() - 0.5) * 30;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
const dustParticles = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xe9d5ff, size: 0.11, transparent: true, opacity: 0.55 }));
scene.add(dustParticles);

// Board Setup
const TILE_SIZE = 1.35;
const BOARD_OFFSET = (8 * TILE_SIZE) / 2 - TILE_SIZE / 2;
const boardGroup = new THREE.Group();
scene.add(boardGroup);

const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(8 * TILE_SIZE + 1.2, 0.55, 8 * TILE_SIZE + 1.2), new THREE.MeshStandardMaterial({ color: 0x231d30, roughness: 0.5 }));
boardFrame.position.y = -0.32;
boardGroup.add(boardFrame);

const tileMeshes = Array(8).fill(null).map(() => Array(8).fill(null));
const tileOverlays = Array(8).fill(null).map(() => Array(8).fill(null));

function boardToWorld(r, c) {
    return new THREE.Vector3(c * TILE_SIZE - BOARD_OFFSET, 0, r * TILE_SIZE - BOARD_OFFSET);
}

for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
        const isLight = (r + c) % 2 === 0;
        const tile = new THREE.Mesh(
            new THREE.BoxGeometry(TILE_SIZE * 0.98, 0.25, TILE_SIZE * 0.98),
            new THREE.MeshStandardMaterial({
                map: isLight ? marbleTex : obsidianTex,
                color: isLight ? 0xe7e0d3 : 0x211b2e,
                roughness: 0.25
            })
        );
        const pos = boardToWorld(r, c);
        tile.position.set(pos.x, -0.125, pos.z);
        tile.receiveShadow = true;
        tile.userData = { isTile: true, r, c };
        boardGroup.add(tile);
        tileMeshes[r][c] = tile;

        const overlay = new THREE.Mesh(
            new THREE.RingGeometry(TILE_SIZE * 0.16, TILE_SIZE * 0.39, 24),
            new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.0 })
        );
        overlay.rotation.x = -Math.PI / 2;
        overlay.position.set(pos.x, 0.015, pos.z);
        overlay.userData = { isTile: true, r, c };
        boardGroup.add(overlay);
        tileOverlays[r][c] = overlay;
    }
}

// 3D Piece Models Generator
function createWizardPieceMesh(type, color) {
    const root = new THREE.Group();
    const bodyGroup = new THREE.Group();
    const crownGroup = new THREE.Group();
    bodyGroup.add(crownGroup);
    root.add(bodyGroup);

    const isWhite = color === 'w';
    const mainMat = isWhite ? marblePieceMat : obsidianPieceMat;
    const trimMat = isWhite ? marbleGoldTrimMat : obsidianRuneTrimMat;

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.54, 0.22, 8), mainMat);
    plinth.position.y = 0.11;
    plinth.castShadow = true;
    bodyGroup.add(plinth);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.04, 8, 16), trimMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.22;
    bodyGroup.add(collar);

    if (type === 'p') {
        const torso = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.72, 8), mainMat);
        torso.position.y = 0.58;
        bodyGroup.add(torso);
        const helm = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 1), mainMat);
        helm.position.y = 1.08;
        crownGroup.add(helm);
    } else if (type === 'r') {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.44, 1.05, 8), mainMat);
        tower.position.y = 0.74;
        bodyGroup.add(tower);
        const merlons = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.38, 0.32, 8), mainMat);
        merlons.position.y = 1.38;
        crownGroup.add(merlons);
    } else if (type === 'n') {
        const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.65, 8), mainMat);
        lower.position.y = 0.54;
        bodyGroup.add(lower);
        const snout = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.52, 6), mainMat);
        snout.rotation.x = isWhite ? -Math.PI / 2.3 : Math.PI / 2.3;
        snout.position.set(0, 1.28, isWhite ? -0.32 : 0.32);
        crownGroup.add(snout);
    } else if (type === 'b') {
        const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.44, 1.15, 10), mainMat);
        robe.position.y = 0.78;
        bodyGroup.add(robe);
        const mitre = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.58, 8), mainMat);
        mitre.position.y = 1.56;
        crownGroup.add(mitre);
    } else if (type === 'q') {
        const gown = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.48, 1.32, 12), mainMat);
        gown.position.y = 0.88;
        bodyGroup.add(gown);
        const coronet = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.24, 0.28, 8, 1, true), trimMat);
        coronet.position.y = 1.72;
        crownGroup.add(coronet);
    } else if (type === 'k') {
        const mantle = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 1.42, 8), mainMat);
        mantle.position.y = 0.92;
        bodyGroup.add(mantle);
        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), trimMat);
        cross.position.y = 2.12;
        crownGroup.add(cross);
    }

    root.userData = { bodyGroup, crownGroup, type, color, phaseOffset: Math.random() * Math.PI * 2 };
    return root;
}

// Particle & Shockwave Systems
const activeShatterShards = [];
const activeShockwaves = [];
const pieceMeshesById = new Map();

function spawnShatterExplosion(worldPos, victimColor, attackDir) {
    const isWhite = victimColor === 'w';
    const shardMat = isWhite ? marblePieceMat : obsidianPieceMat;
    const trimMat = isWhite ? marbleGoldTrimMat : obsidianRuneTrimMat;

    for (let i = 0; i < 32; i++) {
        const radius = 0.08 + Math.random() * 0.16;
        const geo = new THREE.DodecahedronGeometry(radius, 0);
        const mesh = new THREE.Mesh(geo, i % 5 === 0 ? trimMat : shardMat);
        mesh.position.set(worldPos.x + (Math.random() - 0.5) * 0.5, 0.35 + Math.random() * 1.2, worldPos.z + (Math.random() - 0.5) * 0.5);
        mesh.castShadow = true;
        scene.add(mesh);

        const spread = Math.random() * Math.PI * 2;
        const spd = 2.2 + Math.random() * 4.5;
        const vel = new THREE.Vector3(Math.cos(spread) * spd + attackDir.x * 3.2, 3.2 + Math.random() * 4.8, Math.sin(spread) * spd + attackDir.z * 3.2);

        activeShatterShards.push({ mesh, vel, rotVel: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), age: 0, maxAge: 1.4 });
    }

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.38, 32), new THREE.MeshBasicMaterial({ color: isWhite ? 0xfbbf24 : 0xa855f7, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(worldPos.x, 0.03, worldPos.z);
    scene.add(ring);
    activeShockwaves.push({ mesh: ring, age: 0, maxAge: 0.6 });
}

// 2D CANVAS SYNCHRONIZATION
const canvas2D = document.getElementById('board-2d-canvas');
const ctx2D = canvas2D.getContext('2d');
const active2DShards = [];

function spawn2DShatter(r, c, victimColor, attackDir) {
    const pad = 28;
    const sqSize = (canvas2D.width - pad * 2) / 8;
    const cx = pad + (c + 0.5) * sqSize;
    const cy = pad + (r + 0.5) * sqSize;

    for (let i = 0; i < 28; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 190;
        active2DShards.push({
            x: cx, y: cy,
            vx: Math.cos(ang) * spd + attackDir.x * 90,
            vy: Math.sin(ang) * spd + attackDir.z * 90,
            rot: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 10,
            size: 4 + Math.random() * 7,
            color: victimColor === 'w' ? '#f5f2eb' : '#1e192b',
            age: 0, maxAge: 0.8
        });
    }
}

function syncAllPieces() {
    const activeIds = new Set();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = game.board[r][c];
            if (!p) continue;
            activeIds.add(p.id);

            let mesh = pieceMeshesById.get(p.id);
            if (mesh && mesh.userData.type !== p.type) {
                scene.remove(mesh);
                pieceMeshesById.delete(p.id);
                mesh = null;
            }
            if (!mesh) {
                mesh = createWizardPieceMesh(p.type, p.color);
                mesh.userData.pieceId = p.id;
                scene.add(mesh);
                pieceMeshesById.set(p.id, mesh);
            }
            const worldPos = boardToWorld(r, c);
            mesh.position.set(worldPos.x, 0, worldPos.z);
            mesh.userData.bodyGroup.position.set(0, 0, 0);
        }
    }
    for (const [id, mesh] of pieceMeshesById.entries()) {
        if (!activeIds.has(id)) {
            scene.remove(mesh);
            pieceMeshesById.delete(id);
        }
    }
    updateTileHighlights();
    updateHUD();
}

function updateTileHighlights() {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            tileOverlays[r][c].material.opacity = 0;
            tileMeshes[r][c].material.emissive.setHex(0x000000);
        }
    }
    if (game.lastMoveSquares) {
        [game.lastMoveSquares.from, game.lastMoveSquares.to].forEach(sq => {
            tileMeshes[sq.r][sq.c].material.emissive.setHex(0x2e1065);
        });
    }
    if (game.inCheck(game.turn)) {
        const k = game.findKing(game.turn);
        if (k) {
            tileOverlays[k.r][k.c].material.color.setHex(0xef4444);
            tileOverlays[k.r][k.c].material.opacity = 0.85;
            tileMeshes[k.r][k.c].material.emissive.setHex(0x7f1d1d);
        }
    }
    if (game.selectedSquare) {
        const { r, c } = game.selectedSquare;
        tileOverlays[r][c].material.color.setHex(0xc084fc);
        tileOverlays[r][c].material.opacity = 0.85;
    }
    game.validMovesForSelected.forEach(m => {
        tileOverlays[m.to.r][m.to.c].material.color.setHex(m.captured ? 0xf43f5e : 0x38bdf8);
        tileOverlays[m.to.r][m.to.c].material.opacity = 0.8;
    });
}

function updateHUD() {
    const isWhite = game.turn === 'w';
    const turnDot = document.getElementById('turn-dot');
    const turnText = document.getElementById('turn-text');
    const capStr = game.snowballCap === Infinity ? '∞' : `${game.snowballCap}x`;

    if (isWhite) {
        turnDot.className = 'w-3 h-3 rounded-full bg-stone-100 shadow-[0_0_8px_#fff] transition-colors';
        turnText.textContent = game.bonusTurnActive ? `Marble Bonus (${game.consecutiveBonusTurns}/${capStr})` : "Marble's Turn";
    } else {
        turnDot.className = 'w-3 h-3 rounded-full bg-purple-400 shadow-[0_0_8px_#a855f7] transition-colors';
        turnText.textContent = game.bonusTurnActive ? `Obsidian Bonus (${game.consecutiveBonusTurns}/${capStr})` : "Obsidian's Turn";
    }

    document.getElementById('captured-by-white').textContent = `${game.capturedCount.w} shattered`;
    document.getElementById('captured-by-black').textContent = `${game.capturedCount.b} shattered`;
    document.getElementById('undo-btn').disabled = game.history.length === 0 || game.isCoinFlipping;
    document.getElementById('coin-mode-label').textContent = game.coinFlipEnabled ? 'Coin: Fair' : 'Coin: Off';
    document.getElementById('snowball-cap-label').textContent = `Cap: ${capStr}`;
}

// ANIMATED MOVE EXECUTION
let activeMoveAnim = null;

function triggerMove(move, promo = 'q', onDone = null) {
    const movingPiece = game.board[move.from.r][move.from.c];
    if (!movingPiece) return;

    const attackerMesh = pieceMeshesById.get(movingPiece.id);
    const startPos = boardToWorld(move.from.r, move.from.c);
    const endPos = boardToWorld(move.to.r, move.to.c);
    const attackDir = new THREE.Vector3().subVectors(endPos, startPos).normalize();
    const isCapture = Boolean(move.captured);

    let victimMesh = null;
    if (isCapture && move.captured) {
        victimMesh = pieceMeshesById.get(move.captured.id);
    }

    game.selectedSquare = null;
    game.validMovesForSelected = [];
    updateTileHighlights();
    audio.playSlide();

    activeMoveAnim = {
        move, promo, attackerMesh, victimMesh, victimPos: endPos.clone(),
        victimColor: move.captured ? move.captured.color : null,
        attackDir, startPos, endPos, isCapture, isKnight: movingPiece.type === 'n',
        elapsed: 0, duration: isCapture ? 0.85 : 0.45, shatteredTriggered: false, onDone
    };
}

function updateActiveAnimation(dt) {
    if (!activeMoveAnim) return;
    const anim = activeMoveAnim;
    anim.elapsed += dt;
    const t = Math.min(1, anim.elapsed / anim.duration);
    const body = anim.attackerMesh.userData.bodyGroup;

    if (!anim.isCapture) {
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        anim.attackerMesh.position.lerpVectors(anim.startPos, anim.endPos, ease);
        body.position.y = Math.sin(t * Math.PI) * (anim.isKnight ? 1.5 : 0.2);
    } else {
        const approach = new THREE.Vector3().lerpVectors(anim.startPos, anim.endPos, 0.72);
        if (t < 0.5) {
            anim.attackerMesh.position.lerpVectors(anim.startPos, approach, t / 0.5);
        } else if (t < 0.8) {
            const p = (t - 0.5) / 0.3;
            anim.attackerMesh.position.lerpVectors(approach, anim.endPos, p);
            if (!anim.shatteredTriggered && t >= 0.72) {
                anim.shatteredTriggered = true;
                if (anim.victimMesh) {
                    scene.remove(anim.victimMesh);
                    pieceMeshesById.delete(anim.move.captured.id);
                }
                spawnShatterExplosion(anim.victimPos, anim.victimColor, anim.attackDir);
                spawn2DShatter(anim.move.to.r, anim.move.to.c, anim.victimColor, anim.attackDir);
                audio.playShatter();
            }
        } else {
            anim.attackerMesh.position.copy(anim.endPos);
        }
    }

    if (t >= 1) {
        body.position.set(0, 0, 0);
        const finished = activeMoveAnim;
        activeMoveAnim = null;

        const moverColor = game.turn;
        const capturedKing = finished.move.captured && finished.move.captured.type === 'k';
        const notation = game.executeMove(finished.move, finished.promo);
        game.lastMoveSquares = { from: finished.move.from, to: finished.move.to };
        syncAllPieces();
        document.getElementById('last-move-label').textContent = `${Math.ceil(game.history.length / 2)}. ${notation}`;

        if (capturedKing) {
            handleGameOver(moverColor, 'Sudden-Death King Capture');
            if (finished.onDone) finished.onDone();
            return;
        }

        const nextLegal = game.getAllLegalMoves(game.turn);
        if (nextLegal.length === 0) {
            handleGameOver(game.inCheck(game.turn) ? (moverColor === 'w' ? 'w' : 'b') : null, 'Checkmate / Stalemate');
            if (finished.onDone) finished.onDone();
            return;
        }

        if (game.coinFlipEnabled) {
            if (game.consecutiveBonusTurns >= game.snowballCap) {
                game.bonusTurnActive = false;
                game.consecutiveBonusTurns = 0;
                document.getElementById('status-text').textContent = 'Snowball cap reached — Turn passes';
                postMoveTurnHandler();
                if (finished.onDone) finished.onDone();
            } else {
                runCoinFlip(moverColor, () => {
                    postMoveTurnHandler();
                    if (finished.onDone) finished.onDone();
                });
            }
        } else {
            postMoveTurnHandler();
            if (finished.onDone) finished.onDone();
        }
    }
}

// 3D COIN FLIP SIMULATION
let coinRestingAngle = 0;

function runCoinFlip(moverColor, onDone) {
    game.isCoinFlipping = true;
    const overlay = document.getElementById('coin-flip-overlay');
    const coinEl = document.getElementById('arcane-coin');
    const titleEl = document.getElementById('coin-result-title');
    const subEl = document.getElementById('coin-result-subtitle');
    const entropyLabel = document.getElementById('coin-entropy-label');

    const { isHeads, rawEntropy } = game.getCryptoFairFlip(moverColor);
    const moverName = moverColor === 'w' ? 'Marble' : 'Obsidian';
    const capStr = game.snowballCap === Infinity ? '∞' : `${game.snowballCap}x`;

    overlay.classList.remove('hidden');
    titleEl.textContent = `Flipping for ${moverName}...`;
    subEl.textContent = `Heads grants 1 bonus turn (Cap: ${capStr})`;
    entropyLabel.textContent = `Crypto Entropy: ${rawEntropy}`;
    audio.playCoinSpin();

    const spins = 5;
    const targetMod = isHeads ? 0 : 180;
    const currentMod = ((coinRestingAngle % 360) + 360) % 360;
    const delta = ((targetMod - currentMod) % 360 + 360) % 360;
    const startAngle = coinRestingAngle;
    const finalAngle = startAngle + spins * 360 + delta;

    const duration = 850;
    const startT = performance.now();

    function step(now) {
        const p = Math.min(1, (now - startT) / duration);
        const ease = 1 - Math.pow(1 - p, 3);
        const curDeg = startAngle + ease * (finalAngle - startAngle);
        coinEl.style.transform = `scale(${1 + Math.sin(p * Math.PI) * 0.3}) rotateY(${curDeg}deg)`;

        if (p < 1) {
            requestAnimationFrame(step);
        } else {
            coinRestingAngle = finalAngle;
            audio.playCoinLand(isHeads);

            if (isHeads) {
                game.turn = moverColor;
                game.consecutiveBonusTurns++;
                game.bonusTurnActive = true;
                titleEl.textContent = `HEADS — ${moverName} Extra Turn!`;
                subEl.textContent = `Granted bonus move #${game.consecutiveBonusTurns} (Cap: ${capStr})`;
            } else {
                game.bonusTurnActive = false;
                game.consecutiveBonusTurns = 0;
                titleEl.textContent = 'TAILS — Turn Passes';
                subEl.textContent = `Command passes fairly to ${game.turn === 'w' ? 'Marble' : 'Obsidian'}.`;
            }

            updateHUD();
            updateTileHighlights();
            setTimeout(() => {
                overlay.classList.add('hidden');
                game.isCoinFlipping = false;
                if (onDone) onDone();
            }, 800);
        }
    }
    requestAnimationFrame(step);
}

// POST MOVE & AI DISPATCH
function postMoveTurnHandler() {
    if (game.isGameOver) return;

    if (game.inCheck(game.turn)) {
        audio.playCheckFanfare();
        document.getElementById('turn-badge').classList.add('check-alert');
        document.getElementById('status-text').textContent = `${game.turn === 'w' ? 'Marble' : 'Obsidian'} King in Check!`;
    } else {
        document.getElementById('turn-badge').classList.remove('check-alert');
        document.getElementById('status-text').textContent = 'Select a piece to command';
    }

    // Trigger AI Move
    if (game.gameMode === 'ai' && game.turn === 'b') {
        dispatchAIMove('b');
    } else if (game.gameMode === 'showcase') {
        setTimeout(() => {
            if (!game.isGameOver && !activeMoveAnim && !game.isCoinFlipping) {
                dispatchAIMove(game.turn);
            }
        }, 350);
    }
}

function dispatchAIMove(color) {
    document.getElementById('status-text').textContent = `AI calculating optimal Chronos move...`;

    if (game.skillLevel === 'chronos') {
        // High Performance Chronos Expectiminimax
        const payload = {
            board: game.board,
            color,
            consecutiveBonus: game.consecutiveBonusTurns,
            snowballCap: game.snowballCap,
            maxTimeMs: 100
        };

        if (worker) {
            worker.onmessage = (e) => {
                if (e.data.type === 'MOVE_READY') {
                    handleAIResult(e.data.payload);
                }
            };
            worker.postMessage({ type: 'CALCULATE_MOVE', payload });
        } else {
            const res = fallbackEngine.getBestMove(game.board, color, game.consecutiveBonusTurns, game.snowballCap, 100);
            handleAIResult(res);
        }
    } else {
        // Cathedral Novice / Adept / Master
        const legal = game.getAllLegalMoves(color);
        if (legal.length === 0) return;
        const chosen = legal[Math.floor(Math.random() * legal.length)];
        triggerMove(chosen, chosen.promotion ? 'q' : null);
    }
}

function handleAIResult(res) {
    if (!res || !res.move) return;

    // Update Tactical Analysis HUD
    document.getElementById('eval-win-prob').textContent = `${Math.round(res.winProb * 100)}%`;
    const scoreStr = res.evalScore >= 0 ? `+${(res.evalScore / 100).toFixed(1)}` : `${(res.evalScore / 100).toFixed(1)}`;
    document.getElementById('eval-score').textContent = scoreStr;
    document.getElementById('eval-threat-label').textContent = res.reason || `Search Depth Complete (${res.searchDurationMs}ms)`;

    triggerMove(res.move, res.move.promotion ? 'q' : null);
}

function handleGameOver(winnerColor, reason) {
    game.isGameOver = true;
    const banner = document.getElementById('gameover-banner');
    banner.classList.remove('hidden');

    const winnerName = winnerColor === 'w' ? 'Marble' : (winnerColor === 'b' ? 'Obsidian' : 'Neither (Draw)');
    document.getElementById('gameover-title').textContent = winnerColor ? `${winnerName} Victory!` : 'Stalemate';
    document.getElementById('gameover-subtitle').textContent = reason || 'Game concluded in Cathedral.';
    audio.playCheckFanfare();

    // Record to Server / Supabase
    fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            playerWhite: 'Marble Player',
            playerBlack: game.skillLevel === 'chronos' ? 'Chronos Grandmaster' : 'Cathedral AI',
            winner: winnerName,
            reason: reason || 'Normal',
            plies: game.history.length,
            bonusTurns: game.coinStats.marbleBonus + game.coinStats.obsidianBonus,
            setupMode: game.setupMode
        })
    }).catch(err => console.log('Match record sync:', err));
}

// POINTER & SELECTION
function handleSquareClick(r, c) {
    if (game.isGameOver || activeMoveAnim || game.isCoinFlipping) return;
    if (game.gameMode === 'ai' && game.turn === 'b') return;
    if (game.gameMode === 'showcase') return;

    if (game.selectedSquare) {
        const m = game.validMovesForSelected.find(cand => cand.to.r === r && cand.to.c === c);
        if (m) {
            if (m.promotion) {
                game.pendingPromotionMove = m;
                document.getElementById('promotion-modal').classList.remove('hidden');
                document.getElementById('promotion-modal').classList.add('flex');
            } else {
                triggerMove(m);
            }
            return;
        }
    }

    const p = game.board[r][c];
    if (p && p.color === game.turn) {
        game.selectedSquare = { r, c };
        game.validMovesForSelected = game.getLegalMovesForSquare(r, c);
        audio.playSelect();
    } else {
        game.selectedSquare = null;
        game.validMovesForSelected = [];
    }
    updateTileHighlights();
}

// Camera Spherical Controller
const camSpherical = { radius: 15.8, theta: 0, phi: 0.92, targetRadius: 15.8, targetTheta: 0, targetPhi: 0.92, autoOrbit: false };

function setCameraPreset(preset) {
    camSpherical.autoOrbit = (preset === 'orbit');
    if (preset === 'white') { camSpherical.targetTheta = 0; camSpherical.targetPhi = 0.92; camSpherical.targetRadius = 15.8; }
    else if (preset === 'black') { camSpherical.targetTheta = Math.PI; camSpherical.targetPhi = 0.92; camSpherical.targetRadius = 15.8; }
    else if (preset === 'top') { camSpherical.targetTheta = 0; camSpherical.targetPhi = 0.18; camSpherical.targetRadius = 16.5; }
    else if (preset === 'orbit') { camSpherical.targetPhi = 1.02; camSpherical.targetRadius = 18.5; }

    document.querySelectorAll('.cam-btn').forEach(btn => btn.classList.toggle('md3-btn-active', btn.dataset.cam === preset));
}

let isPointerDown = false;
let startX = 0, startY = 0, lastX = 0, lastY = 0;
let isDragging = false;

renderer.domElement.addEventListener('pointerdown', (e) => {
    isPointerDown = true;
    isDragging = false;
    startX = e.clientX; startY = e.clientY;
    lastX = e.clientX; lastY = e.clientY;
});

window.addEventListener('pointermove', (e) => {
    if (!isPointerDown) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 6) {
        isDragging = true;
        camSpherical.autoOrbit = false;
        camSpherical.targetTheta -= dx * 0.0075;
        camSpherical.targetPhi = Math.max(0.15, Math.min(1.42, camSpherical.targetPhi - dy * 0.0065));
    }
    lastX = e.clientX; lastY = e.clientY;
});

window.addEventListener('pointerup', (e) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    if (!isDragging && e.target === renderer.domElement) {
        const rect = renderer.domElement.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
        const hits = raycaster.intersectObjects([...boardGroup.children, ...pieceMeshesById.values()], true);
        if (hits.length > 0) {
            let hit = hits[0].object;
            while (hit) {
                if (hit.userData && hit.userData.isTile) {
                    handleSquareClick(hit.userData.r, hit.userData.c);
                    break;
                }
                if (hit.userData && hit.userData.pieceId) {
                    for (let r = 0; r < 8; r++) {
                        for (let c = 0; c < 8; c++) {
                            if (game.board[r][c] && game.board[r][c].id === hit.userData.pieceId) {
                                handleSquareClick(r, c);
                                break;
                            }
                        }
                    }
                    break;
                }
                hit = hit.parent;
            }
        }
    }
});

// UI EVENT BINDINGS
document.querySelectorAll('.cam-btn').forEach(btn => btn.addEventListener('click', () => setCameraPreset(btn.dataset.cam)));

document.getElementById('view-3d-btn').addEventListener('click', () => {
    document.getElementById('view-3d-btn').classList.add('md3-btn-active');
    document.getElementById('view-2d-btn').classList.remove('md3-btn-active');
    document.getElementById('view-2d-container').classList.add('hidden');
    document.getElementById('view-2d-container').classList.remove('flex');
    document.getElementById('camera-segment').classList.remove('hidden');
});

document.getElementById('view-2d-btn').addEventListener('click', () => {
    document.getElementById('view-2d-btn').classList.add('md3-btn-active');
    document.getElementById('view-3d-btn').classList.remove('md3-btn-active');
    document.getElementById('view-2d-container').classList.remove('hidden');
    document.getElementById('view-2d-container').classList.add('flex');
    document.getElementById('camera-segment').classList.add('hidden');
});

document.querySelectorAll('.skill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        game.skillLevel = btn.dataset.skill;
        document.querySelectorAll('.skill-btn').forEach(b => {
            const isTarget = b === btn;
            b.classList.toggle('md3-btn-active', isTarget && b.dataset.skill !== 'chronos');
            b.classList.toggle('md3-btn-chronos', isTarget && b.dataset.skill === 'chronos');
        });
        audio.playSelect();
    });
});

document.getElementById('mode-ai-btn').addEventListener('click', () => {
    game.gameMode = 'ai';
    document.getElementById('mode-ai-btn').classList.add('md3-btn-active');
    document.getElementById('mode-showcase-btn').classList.remove('md3-btn-active');
    document.getElementById('mode-2p-btn').classList.remove('md3-btn-active');
});

document.getElementById('mode-showcase-btn').addEventListener('click', () => {
    game.gameMode = 'showcase';
    document.getElementById('mode-showcase-btn').classList.add('md3-btn-active');
    document.getElementById('mode-ai-btn').classList.remove('md3-btn-active');
    document.getElementById('mode-2p-btn').classList.remove('md3-btn-active');
    postMoveTurnHandler();
});

document.getElementById('mode-2p-btn').addEventListener('click', () => {
    game.gameMode = '2p';
    document.getElementById('mode-2p-btn').classList.add('md3-btn-active');
    document.getElementById('mode-ai-btn').classList.remove('md3-btn-active');
    document.getElementById('mode-showcase-btn').classList.remove('md3-btn-active');
});

document.getElementById('coin-mode-btn').addEventListener('click', () => {
    game.coinFlipEnabled = !game.coinFlipEnabled;
    document.getElementById('coin-mode-btn').classList.toggle('md3-btn-active', game.coinFlipEnabled);
    updateHUD();
});

const caps = [1, 2, 3, Infinity];
document.getElementById('snowball-cap-btn').addEventListener('click', () => {
    const idx = (caps.indexOf(game.snowballCap) + 1) % caps.length;
    game.snowballCap = caps[idx];
    updateHUD();
});

document.getElementById('setup-mode-btn').addEventListener('click', () => {
    const modes = ['standard', '960', 'chaos'];
    const idx = (modes.indexOf(game.setupMode) + 1) % modes.length;
    game.setupMode = modes[idx];
    document.getElementById('setup-mode-label').textContent = `Setup: ${game.setupMode.toUpperCase()}`;
    resetGame();
});

function resetGame() {
    activeMoveAnim = null;
    game.isGameOver = false;
    game.initBoard();
    document.getElementById('gameover-banner').classList.add('hidden');
    syncAllPieces();
}

document.getElementById('reset-btn').addEventListener('click', resetGame);
document.getElementById('banner-newgame-btn').addEventListener('click', resetGame);

document.getElementById('sound-btn').addEventListener('click', () => {
    audio.enabled = !audio.enabled;
    document.getElementById('sound-icon').textContent = audio.enabled ? 'volume_up' : 'volume_off';
});

// Modals
const tourneyModal = document.getElementById('tournament-modal');
document.getElementById('open-tournament-btn').addEventListener('click', () => tourneyModal.classList.remove('hidden'));
document.getElementById('close-tournament-btn').addEventListener('click', () => tourneyModal.classList.add('hidden'));

const historyModal = document.getElementById('history-modal');
document.getElementById('open-history-btn').addEventListener('click', () => {
    historyModal.classList.remove('hidden');
    loadMatches();
});
document.getElementById('close-history-btn').addEventListener('click', () => historyModal.classList.add('hidden'));

const fairnessModal = document.getElementById('fairness-modal');
document.getElementById('fairness-btn').addEventListener('click', () => fairnessModal.classList.remove('hidden'));
document.getElementById('close-fairness-btn').addEventListener('click', () => fairnessModal.classList.add('hidden'));

async function loadMatches() {
    const container = document.getElementById('history-list-container');
    try {
        const res = await fetch('/api/matches');
        const matches = await res.json();
        if (matches && matches.length > 0) {
            container.innerHTML = matches.map(m => `
                <div class="p-2.5 rounded-2xl bg-stone-900/80 border border-stone-800 text-xs flex items-center justify-between">
                    <div>
                        <div class="font-semibold text-white">${m.player_white} vs ${m.player_black}</div>
                        <div class="text-[10px] text-stone-400">${new Date(m.created_at).toLocaleTimeString()} • ${m.setup_mode} • ${m.plies} plies</div>
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${m.winner.includes('Chronos') || m.winner.includes('Marble') ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30' : 'bg-purple-950 text-purple-300 border border-purple-500/30'}">
                        ${m.winner}
                    </span>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div class="text-xs text-stone-400 text-center py-4">No match records yet. Play a game to record stats!</div>';
        }
    } catch (e) {
        container.innerHTML = '<div class="text-xs text-stone-400 text-center py-4">Local storage active.</div>';
    }
}

// 2D Canvas click handler
canvas2D.addEventListener('pointerup', (e) => {
    const rect = canvas2D.getBoundingClientRect();
    const sq = (canvas2D.width - 56) / 8;
    const px = (e.clientX - rect.left) * (canvas2D.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas2D.height / rect.height);
    const c = Math.floor((px - 28) / sq);
    const r = Math.floor((py - 28) / sq);
    if (r >= 0 && r < 8 && c >= 0 && c < 8) handleSquareClick(r, c);
});

// Render 2D
function render2DBoard() {
    const W = canvas2D.width;
    const pad = 28;
    const sq = (W - pad * 2) / 8;
    ctx2D.clearRect(0, 0, W, W);
    ctx2D.fillStyle = '#181520';
    ctx2D.fillRect(0, 0, W, W);

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const isLight = (r + c) % 2 === 0;
            ctx2D.fillStyle = isLight ? '#e5dfd5' : '#241f30';
            ctx2D.fillRect(pad + c * sq, pad + r * sq, sq, sq);
        }
    }
    if (game.selectedSquare) {
        ctx2D.fillStyle = 'rgba(168, 85, 247, 0.4)';
        ctx2D.fillRect(pad + game.selectedSquare.c * sq, pad + game.selectedSquare.r * sq, sq, sq);
    }
    game.validMovesForSelected.forEach(m => {
        ctx2D.fillStyle = m.captured ? '#f43f5e' : '#38bdf8';
        ctx2D.beginPath();
        ctx2D.arc(pad + (m.to.c + 0.5) * sq, pad + (m.to.r + 0.5) * sq, sq * 0.18, 0, Math.PI * 2);
        ctx2D.fill();
    });
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = game.board[r][c];
            if (!p) continue;
            ctx2D.fillStyle = p.color === 'w' ? '#f3efe6' : '#2e2640';
            ctx2D.strokeStyle = p.color === 'w' ? '#eab308' : '#a855f7';
            ctx2D.lineWidth = 2;
            ctx2D.beginPath();
            ctx2D.arc(pad + (c + 0.5) * sq, pad + (r + 0.5) * sq, sq * 0.35, 0, Math.PI * 2);
            ctx2D.fill();
            ctx2D.stroke();
            ctx2D.fillStyle = p.color === 'w' ? '#261452' : '#f3e8ff';
            ctx2D.font = 'bold 16px Inter';
            ctx2D.textAlign = 'center';
            ctx2D.textBaseline = 'middle';
            ctx2D.fillText(p.type.toUpperCase(), pad + (c + 0.5) * sq, pad + (r + 0.5) * sq);
        }
    }
}

// MAIN RENDER LOOP
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (camSpherical.autoOrbit) camSpherical.targetTheta += dt * 0.22;
    camSpherical.theta += (camSpherical.targetTheta - camSpherical.theta) * 0.08;
    camSpherical.phi += (camSpherical.targetPhi - camSpherical.phi) * 0.08;
    camSpherical.radius += (camSpherical.targetRadius - camSpherical.radius) * 0.08;

    camera.position.x = camSpherical.radius * Math.sin(camSpherical.phi) * Math.sin(camSpherical.theta);
    camera.position.y = camSpherical.radius * Math.cos(camSpherical.phi);
    camera.position.z = camSpherical.radius * Math.sin(camSpherical.phi) * Math.cos(camSpherical.theta);
    camera.lookAt(0, 0.4, 0);

    updateActiveAnimation(dt);

    for (let i = activeShatterShards.length - 1; i >= 0; i--) {
        const s = activeShatterShards[i];
        s.age += dt;
        if (s.age >= s.maxAge) {
            scene.remove(s.mesh);
            activeShatterShards.splice(i, 1);
            continue;
        }
        s.vel.y -= 13.5 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
    }

    renderer.render(scene, camera);
    render2DBoard();
}

window.onload = () => {
    syncAllPieces();
    animate();
};
