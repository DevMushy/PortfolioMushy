import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Variabili globali
let scene, camera, renderer;
let model = null;
let meteorites = [];
let loaded = false;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// Drag controls
let isDragging = false;
let lastX = 0, lastY = 0;
let moved = false;
let startX = 0, startY = 0;

const autoRotateSpeed = 0.0015;

// === SETUP SCENA ===
function initScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.touchAction = 'none';
    document.body.appendChild(renderer.domElement);

    // Luci
    scene.add(new THREE.AmbientLight(0xffffff, 2.2));

    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    // Sfondo
    scene.background = new THREE.Color(0x1b1e24);

    // Resize
    window.addEventListener('resize', onWindowResize);
}

// === LOADING SCREEN ===
function createLoadingOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "loadingOverlay";
    overlay.style.position = "fixed";
    overlay.style.top = 0;
    overlay.style.left = 0;
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "#1b1e24";
    overlay.style.color = "white";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.fontSize = "1.5rem";
    overlay.style.zIndex = 9999;
    overlay.innerText = "Loading...";
    document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.remove();
}

// === CARICAMENTO MODELLO ===
function loadModel() {
    const loader = new GLTFLoader();
    loader.load(
        './planet_with_asteroid_belt.glb',
        gltf => {
            model = gltf.scene;
            scene.add(model);

            centerAndScaleModel(model);

            setupMeteorites(model);

            loaded = true;
            hideLoadingOverlay();
        },
        undefined,
        err => console.error("Errore caricamento GLB:", err)
    );
}

function centerAndScaleModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    const sizeVec = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const dist = maxDim / (2 * Math.tan(fov / 2));
    camera.position.set(0, maxDim * 0, dist * 1.3);
    camera.rotation.set(0, 0, 0);
    camera.near = dist / 50;
    camera.far = dist * 50;
    camera.updateProjectionMatrix();
}

function setupMeteorites(model) {
    let autoId = 0;
    model.traverse(child => {
        if (child.isMesh) {
            if (!child.name || !child.name.trim()) child.name = 'Part_' + autoId++;
            if (!(child.material instanceof THREE.MeshStandardMaterial)) {
                child.material = new THREE.MeshStandardMaterial({
                    color: child.material.color?.clone?.() || new THREE.Color(0xaaaaaa)
                });
            }
            child.material.roughness = 0.8;
            child.material.metalness = 0.1;
            child.userData.originalColor = child.material.color.clone();

            if (/asteroid|meteor/i.test(child.name)) {
                const pos = child.position.clone();
                const r = Math.hypot(pos.x, pos.z);
                if (r < minRadius) r = minRadius + Math.random() * 6;
                child.userData.orbitRadius = r;
                child.userData.orbitAngle = Math.atan2(pos.x, pos.z);
                child.userData.orbitSpeed = 0.0006 + Math.random() * 0.0005;
                meteorites.push(child);

            }
        }
    });

    addExtraAsteroids(model);
}

function addExtraAsteroids(model) {
    const maxDim = 10; // fallback dimension
    const extraCount = 5;
    const baseRadius = maxDim * 0.5;
    const geometries = [
        new THREE.IcosahedronGeometry(0.34, 1),
        new THREE.DodecahedronGeometry(0.38, 0),
        new THREE.OctahedronGeometry(0.33, 0),
        new THREE.TetrahedronGeometry(0.36, 0),
        new THREE.SphereGeometry(0.32, 6, 4)
    ];

    for (let i = 0; i < extraCount; i++) {
        const geom = geometries[i % geometries.length];
        const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(Math.random(), 0.45, 0.5),
            roughness: 0.9,
            metalness: 0.08
        });
        const a = new THREE.Mesh(geom, mat);

        const radius = baseRadius + (Math.random() * maxDim * 0.16) + i * (maxDim * 0.10);
        const angle = Math.random() * Math.PI * 2;

        a.position.set(Math.sin(angle) * radius, (Math.random() - 0.5) * maxDim * 0.06, Math.cos(angle) * radius);

        a.scale.setScalar(1);

        a.userData = {
            orbitRadius: radius,
            orbitAngle: angle,
            orbitSpeed: 0,
            originalColor: mat.color.clone()
        };

        model.add(a);
        meteorites.push(a);
    }
}

// === INTERAZIONI ===
function highlightMesh(mesh) {
    if (!mesh.material || !mesh.userData.originalColor) return;
    const orig = mesh.userData.originalColor;
    mesh.material.color = mesh.material.color.clone();
    mesh.material.color.offsetHSL(0, 0.3, 0.2);
    setTimeout(() => {
        if (mesh.material && orig) mesh.material.color.copy(orig);
    }, 600);
}

function performPick(e) {
    if (!loaded) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const root = model || scene;
    const intersects = raycaster.intersectObjects(root.children, true);
    if (intersects.length) highlightMesh(intersects[0].object);
}

function onPointerDown(e) {
    if (!loaded) return;
    isDragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    lastX = e.clientX;
    lastY = e.clientY;
}

function onPointerMove(e) {
    if (!isDragging || !loaded) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) moved = true;
    if (model) {
        model.rotation.y += dx * 0.01;
        model.rotation.x += dy * 0.01;
        model.rotation.x = THREE.MathUtils.clamp(model.rotation.x, -Math.PI / 3, Math.PI / 3);
    }
    lastX = e.clientX;
    lastY = e.clientY;
}

function onPointerUp(e) {
    if (!loaded) return;
    if (!moved) performPick(e);
    isDragging = false;
}

function setupEventListeners() {
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', () => { isDragging = false; });
}

// === ANIMAZIONE ===
function animate() {
    if (model) model.rotation.y += autoRotateSpeed;

    for (const m of meteorites) {
        if (m.userData.orbitRadius) {
            m.userData.orbitAngle += m.userData.orbitSpeed;
            const r = m.userData.orbitRadius;
            m.position.x = Math.sin(m.userData.orbitAngle) * r;
            m.position.z = Math.cos(m.userData.orbitAngle) * r;
            m.rotation.y += 0.01;
        }
    }

    renderer.render(scene, camera);
    renderer.setAnimationLoop(animate);
}

// === RESIZE ===
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// === MAIN ===
function main() {
    createLoadingOverlay();
    initScene();
    loadModel();
    setupEventListeners();
    animate();
}

main();
