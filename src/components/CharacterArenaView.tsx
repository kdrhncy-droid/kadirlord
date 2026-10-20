import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ArmorTier,
  CharacterRig,
  CharacterVisualOptions,
  HelmetType,
  ShieldType,
  WeaponType,
  applyEquipmentToRig,
  applyCosmeticsToRig,
  setRigWireframe,
  createArcheryTarget,
  createArrowMesh,
  createCharacterRig,
  createPracticeDummy,
} from '../game/characterRig';
import {
  CharacterAnimator,
  CharacterAnimState,
  AttackDirection,
  weaponClassOf,
} from '../game/characterAnimator';
import { sound } from '../game/sound';

/* ─── Interfaces ─── */

interface FlyingArrow {
  mesh: THREE.Group;
  velocity: THREE.Vector3;
  inFlight: boolean;
  spawnTime: number;
}

interface FloatingText {
  id: string;
  text: string;
  color: string;
  worldX: number;
  worldY: number;
  worldZ: number;
  createdAt: number;
}

interface CharacterArenaViewProps {
  onReturnToMap: () => void;
  onOpenMarket?: () => void;
}

/* ─── Constants ─── */

const ARENA_RADIUS = 17;
const MOVE_SPEED = 3.4;
const SPRINT_SPEED = 5.8;
const CAM_DISTANCE = 3.8;
const CAM_HEIGHT = 1.8;
const CAM_LOOK_HEIGHT = 1.3;
const CAM_LERP = 0.12;
const MOUSE_SENSITIVITY = 0.002;
const ARROW_SPEED = 34;
const ARROW_LIFETIME = 4000; // ms
const DMG_TEXT_LIFETIME = 2400; // ms

/* ─── Component ─── */

export const CharacterArenaView: React.FC<CharacterArenaViewProps> = ({
  onReturnToMap,
  onOpenMarket,
}) => {
  // ---- UI State (causes React re-render but NOT scene rebuild) ----
  const [weaponType, setWeaponType] = useState<WeaponType>('ONE_HANDED_SWORD');
  const [shieldType, setShieldType] = useState<ShieldType>('ROUND_SHIELD');
  const [helmetType, setHelmetType] = useState<HelmetType>('SPANGENHELM');
  const [armorTier, setArmorTier] = useState<ArmorTier>('CHAINMAIL');
  const [factionColor, setFactionColor] = useState<string>('#991b1b');
  const [hasBeard, setHasBeard] = useState<boolean>(true);

  const [controlMode, setControlMode] = useState<'INSPECTOR' | 'PLAYABLE'>('PLAYABLE');
  const [activeAnimLabel, setActiveAnimLabel] = useState<string>('IDLE');
  const [animSpeed, setAnimSpeed] = useState<number>(1.0);
  const [isWireframe, setIsWireframe] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [activeDockTab, setActiveDockTab] = useState<'ARMOR' | 'WEAPON' | 'ANIM' | 'SETTINGS'>('WEAPON');
  const [arrowCount, setArrowCount] = useState<number>(32);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [dummyHitCount, setDummyHitCount] = useState<number>(0);
  const [combatDirection, setCombatDirection] = useState<AttackDirection>('up');
  const [isAimingBow, setIsAimingBow] = useState<boolean>(false);

  const canvasMountRef = useRef<HTMLDivElement>(null);

  // ---- Persistent refs (survive across renders, hold 3D world state) ----
  const sceneCreatedRef = useRef(false);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const playerRigRef = useRef<CharacterRig | null>(null);
  const playerAnimatorRef = useRef<CharacterAnimator | null>(null);
  const botRigRef = useRef<CharacterRig | null>(null);
  const botAnimatorRef = useRef<CharacterAnimator | null>(null);
  const dummyRef = useRef<ReturnType<typeof createPracticeDummy> | null>(null);
  const flyingArrowsRef = useRef<FlyingArrow[]>([]);
  const animIdRef = useRef<number>(0);
  const clockRef = useRef(new THREE.Clock());

  // ---- Player movement/input refs ----
  const playerPosRef = useRef(new THREE.Vector3(0, 0, 4));
  const playerYawRef = useRef(Math.PI);
  const playerPitchRef = useRef(0);
  const keysDownRef = useRef<Record<string, boolean>>({});
  const controlModeRef = useRef<'INSPECTOR' | 'PLAYABLE'>('PLAYABLE');
  const animSpeedRef = useRef(1.0);
  const weaponTypeRef = useRef<WeaponType>('ONE_HANDED_SWORD');
  const shieldTypeRef = useRef<ShieldType>('ROUND_SHIELD');
  const combatDirRef = useRef<AttackDirection>('up');
  const isAimingBowRef = useRef<boolean>(false);

  // Inspector orbit refs
  const orbitRef = useRef({ azimuth: 0, polar: 0.35, distance: 5.2, dragging: false, lastX: 0, lastY: 0 });

  // Keep refs in sync with state (so the animation loop reads latest values without re-mounting)
  useEffect(() => { controlModeRef.current = controlMode; }, [controlMode]);
  useEffect(() => { animSpeedRef.current = animSpeed; }, [animSpeed]);
  useEffect(() => { weaponTypeRef.current = weaponType; }, [weaponType]);
  useEffect(() => { shieldTypeRef.current = shieldType; }, [shieldType]);
  useEffect(() => { combatDirRef.current = combatDirection; }, [combatDirection]);
  useEffect(() => { isAimingBowRef.current = isAimingBow; }, [isAimingBow]);

  // ── Floating damage text helper ──
  const spawnDamageText = useCallback((text: string, color: string, pos: THREE.Vector3) => {
    const newId = `dmg-${Date.now()}-${Math.random()}`;
    setFloatingTexts((prev) => [
      ...prev.slice(-8),
      {
        id: newId,
        text,
        color,
        worldX: pos.x,
        worldY: pos.y + 1.6,
        worldZ: pos.z,
        createdAt: Date.now(),
      },
    ]);
  }, []);

  // ══════════════════════════════════════════════════════════════════════
  //  ONE-TIME SCENE SETUP (runs once on mount, never re-runs)
  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (sceneCreatedRef.current) return;
    const container = canvasMountRef.current;
    if (!container) return;
    sceneCreatedRef.current = true;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // ---- Scene ----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f0c09');
    scene.fog = new THREE.FogExp2('#0f0c09', 0.022);
    sceneRef.current = scene;

    // ---- Camera ----
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 80);
    // Player starts at (0, 0, 4) with yaw = Math.PI (facing -Z into the arena)
    // Initial camera placed behind player's right shoulder:
    camera.position.set(0.40, 1.76, 4 + 3.4);
    cameraRef.current = camera;

    // ---- Renderer ----
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ---- Arena Environment ----
    const floorGeo = new THREE.CylinderGeometry(18, 18, 0.2, 32);
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#453526',
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    scene.add(floor);

    // Stone wall
    const wallGeo = new THREE.TorusGeometry(17.8, 0.4, 8, 32);
    const wallMat = new THREE.MeshStandardMaterial({ color: '#2b231a', roughness: 0.9, flatShading: true });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.rotation.x = Math.PI * 0.5;
    wall.position.y = 0.2;
    scene.add(wall);

    // Palisade posts
    const palisadeGroup = new THREE.Group();
    const postGeo = new THREE.CylinderGeometry(0.12, 0.15, 2.8, 5);
    const postMat = new THREE.MeshStandardMaterial({ color: '#2d1e13', roughness: 0.9 });
    for (let i = 0; i < 32; i++) {
      const angle = (i / 32) * Math.PI * 2;
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(Math.cos(angle) * 18.2, 1.4, Math.sin(angle) * 18.2);
      post.castShadow = true;
      palisadeGroup.add(post);
    }
    scene.add(palisadeGroup);

    // ---- Lighting ----
    const sunLight = new THREE.DirectionalLight('#fffbeb', 2.2);
    sunLight.position.set(12, 18, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 40;
    sunLight.shadow.camera.left = -15;
    sunLight.shadow.camera.right = 15;
    sunLight.shadow.camera.top = 15;
    sunLight.shadow.camera.bottom = -15;
    scene.add(sunLight);

    const skyFill = new THREE.HemisphereLight('#fef08a', '#181410', 0.85);
    scene.add(skyFill);

    const rimLight = new THREE.DirectionalLight('#93c5fd', 0.7);
    rimLight.position.set(-10, 8, -12);
    scene.add(rimLight);

    // ---- Interactive Targets ----
    const archeryTarget = createArcheryTarget();
    archeryTarget.position.set(-5.5, 0, -8);
    archeryTarget.rotation.y = 0.5;
    scene.add(archeryTarget);

    const dummy = createPracticeDummy();
    dummy.group.position.set(4.5, 0, -5.5);
    dummy.group.rotation.y = -0.5;
    scene.add(dummy.group);
    dummyRef.current = dummy;

    // ---- Bot Sparring Partner ----
    const botRig = createCharacterRig({
      skinTone: '#c68a62',
      hairColor: '#1c1917',
      factionColor: '#581c87',
      weaponType: 'ONE_HANDED_SWORD',
      shieldType: 'ROUND_SHIELD',
      helmetType: 'KETTLE_HAT',
      armorTier: 'LEATHER',
    });
    botRig.root.position.set(0, 0, -6.5);
    scene.add(botRig.root);
    botRigRef.current = botRig;
    const botAnimator = new CharacterAnimator(botRig);
    botAnimator.block();
    botAnimatorRef.current = botAnimator;

    // ---- Player Hero Rig ----
    const playerRig = createCharacterRig({
      skinTone: '#dfa882',
      hairColor: '#382212',
      beardColor: '#382212',
      factionColor: '#991b1b',
      hasBeard: true,
      weaponType: 'ONE_HANDED_SWORD',
      shieldType: 'ROUND_SHIELD',
      helmetType: 'SPANGENHELM',
      armorTier: 'CHAINMAIL',
    });
    playerRig.root.position.set(0, 0, 4);
    playerRig.root.rotation.y = Math.PI;
    scene.add(playerRig.root);
    playerRigRef.current = playerRig;
    const playerAnimator = new CharacterAnimator(playerRig);
    playerAnimatorRef.current = playerAnimator;

    // ── Event handler: hit detection, arrow firing, sounds ──
    playerAnimator.onEvent = (event, clipName) => {
      if (event === 'hit') {
        sound.playSwordSwoosh();
        const pPos = playerPosRef.current;
        const forward = new THREE.Vector3(
          Math.sin(playerYawRef.current),
          0,
          Math.cos(playerYawRef.current),
        );

        const dummyObj = dummyRef.current;
        if (dummyObj) {
          const toDummy = new THREE.Vector3().subVectors(dummyObj.group.position, pPos);
          const distToDummy = toDummy.length();
          if (distToDummy < 2.6 && toDummy.normalize().dot(forward) > 0.15) {
            dummyObj.hit();
            sound.playShieldHit();
            spawnDamageText('💥 68 KESİCİ!', '#facc15', dummyObj.group.position);
            setDummyHitCount((c) => c + 1);
          }
        }
        const botRoot = botRigRef.current?.root;
        if (botRoot) {
          const toBot = new THREE.Vector3().subVectors(botRoot.position, pPos);
          const distToBot = toBot.length();
          if (distToBot < 2.4 && toBot.normalize().dot(forward) > 0.15) {
            sound.playShieldHit();
            spawnDamageText('🛡️ BLOKLANDI! (0 Hasar)', '#93c5fd', botRoot.position);
          }
        }
      }
      if (event === 'release' && clipName === 'bow_release') {
        fireArrowProjectile();
      }
    };

    // ── Arrow projectile spawning ──
    function fireArrowProjectile() {
      const rig = playerRigRef.current;
      const anim = playerAnimatorRef.current;
      if (!rig || !anim) return;

      sound.playArrowFly();
      const arrowMesh = createArrowMesh(rig.materials);
      arrowMesh.castShadow = true;

      const spawnPos = new THREE.Vector3();
      const spawnDir = new THREE.Vector3();

      // Try the animator's arrow launch data first
      if (anim.getArrowLaunch(spawnPos, spawnDir)) {
        spawnDir.y += 0.08; // slight loft
        spawnDir.normalize();
      } else {
        // Fallback: spawn from left hand along facing direction + pitch
        rig.leftHand.getWorldPosition(spawnPos);
        spawnPos.y += 0.15;
        spawnDir.set(
          Math.sin(playerYawRef.current),
          Math.sin(playerPitchRef.current) + 0.08,
          Math.cos(playerYawRef.current),
        ).normalize();
      }

      arrowMesh.position.copy(spawnPos);
      arrowMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), spawnDir);
      scene.add(arrowMesh);

      flyingArrowsRef.current.push({
        mesh: arrowMesh,
        velocity: spawnDir.clone().multiplyScalar(ARROW_SPEED),
        inFlight: true,
        spawnTime: Date.now(),
      });

      setArrowCount((prev) => Math.max(0, prev - 1));
    }

    // ══════════════════════════════════════════════════════════════════
    //  INPUT HANDLERS
    // ══════════════════════════════════════════════════════════════════

    const onMouseDown = (e: MouseEvent) => {
      if (e.target !== renderer.domElement) return;
      const mode = controlModeRef.current;
      if (mode === 'INSPECTOR') {
        orbitRef.current.dragging = true;
        orbitRef.current.lastX = e.clientX;
        orbitRef.current.lastY = e.clientY;
      } else if (mode === 'PLAYABLE') {
        // Request pointer lock on first click
        if (document.pointerLockElement !== renderer.domElement) {
          renderer.domElement.requestPointerLock();
          return;
        }

        const anim = playerAnimatorRef.current;
        if (!anim) return;

        if (e.button === 0) {
          // Left click → Attack / Bow Draw
          const wt = weaponTypeRef.current;
          if (wt === 'BOW') {
            isAimingBowRef.current = true;
            setIsAimingBow(true);
            anim.play('bow_draw', { hold: true });
          } else {
            // Directional melee attack: hold windup until mouse release
            anim.attack(combatDirRef.current, true);
          }
        } else if (e.button === 2) {
          // Right click → Block or Cancel Bow Draw
          e.preventDefault();
          const wt = weaponTypeRef.current;
          if (wt === 'BOW' && isAimingBowRef.current) {
            // Cancel bow draw without firing
            isAimingBowRef.current = false;
            setIsAimingBow(false);
            anim.cancelAction();
          } else {
            // Directional block / Shield block (shield blocks omnidirectional, weapons parry in combatDir)
            anim.block(combatDirRef.current);
          }
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      orbitRef.current.dragging = false;
      const mode = controlModeRef.current;
      if (mode === 'PLAYABLE') {
        const anim = playerAnimatorRef.current;
        if (!anim) return;
        if (e.button === 0) {
          // Release bow draw (fires arrow) / release melee attack (executes swing)
          if (isAimingBowRef.current) {
            isAimingBowRef.current = false;
            setIsAimingBow(false);
          }
          anim.release();
        }
        if (e.button === 2) {
          // Release block
          anim.release();
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const mode = controlModeRef.current;
      if (mode === 'INSPECTOR' && orbitRef.current.dragging) {
        const o = orbitRef.current;
        const dx = e.clientX - o.lastX;
        const dy = e.clientY - o.lastY;
        o.lastX = e.clientX;
        o.lastY = e.clientY;
        o.azimuth -= dx * 0.01;
        o.polar = Math.max(0.05, Math.min(Math.PI * 0.48, o.polar - dy * 0.01));
      } else if (mode === 'PLAYABLE' && document.pointerLockElement === renderer.domElement) {
        // Pointer Lock provides movementX/Y — rotate camera view
        playerYawRef.current -= e.movementX * MOUSE_SENSITIVITY;
        playerPitchRef.current = THREE.MathUtils.clamp(
          playerPitchRef.current - e.movementY * MOUSE_SENSITIVITY,
          -0.8,
          0.8,
        );
        // Feed pitch to bow aim
        const anim = playerAnimatorRef.current;
        if (anim) anim.setAimPitch(playerPitchRef.current);

        // Bannerlord-style directional combat gesture detection:
        // Decisive mouse flicks select attack & block direction (Up, Down, Left, Right)
        const mx = e.movementX;
        const my = e.movementY;
        const absX = Math.abs(mx);
        const absY = Math.abs(my);

        if (absX > 3 || absY > 3) {
          let chosenDir: AttackDirection = combatDirRef.current;
          if (absX > absY * 0.95) {
            // Horizontal flick
            chosenDir = mx > 0 ? 'right' : 'left';
          } else {
            // Vertical flick (inverted screen Y: negative is moving mouse up)
            chosenDir = my < 0 ? 'up' : 'down';
          }
          if (chosenDir !== combatDirRef.current) {
            combatDirRef.current = chosenDir;
            setCombatDirection(chosenDir);
          }
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (controlModeRef.current === 'INSPECTOR') {
        orbitRef.current.distance = Math.max(1.8, Math.min(16, orbitRef.current.distance + e.deltaY * 0.006));
      }
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      keysDownRef.current[e.code] = true;
      // Quick weapon swap keys (1-5)
      // These set React state which triggers the equipment-sync effect
      if (e.code === 'Digit1') setWeaponType('ONE_HANDED_SWORD');
      if (e.code === 'Digit2') setWeaponType('TWO_HANDED_SWORD');
      if (e.code === 'Digit3') setWeaponType('BOW');
      if (e.code === 'Digit4') setWeaponType('SPEAR');
      if (e.code === 'Digit5') setWeaponType('UNARMED');
      if (e.code === 'KeyH') setDockCollapsed((prev) => !prev);

      // Space → quick attack in selected direction
      if (e.code === 'Space' && controlModeRef.current === 'PLAYABLE') {
        const anim = playerAnimatorRef.current;
        if (anim) anim.attack(combatDirRef.current, false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDownRef.current[e.code] = false;
    };

    const onPointerLockChange = () => {
      // If pointer lock is released while in PLAYABLE mode, optionally do something
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    // ══════════════════════════════════════════════════════════════════
    //  ANIMATION LOOP (60 FPS)
    // ══════════════════════════════════════════════════════════════════

    const gravity = new THREE.Vector3(0, -9.8, 0);
    const _tmpV = new THREE.Vector3();

    const loop = () => {
      animIdRef.current = requestAnimationFrame(loop);
      const rawDelta = clockRef.current.getDelta();
      const speed = animSpeedRef.current;
      const delta = rawDelta * speed;
      const mode = controlModeRef.current;

      // ─ 1. Player movement ─
      const anim = playerAnimatorRef.current;
      const keys = keysDownRef.current;

      if (mode === 'PLAYABLE' && anim) {
        // Local movement in character's local coordinates:
        // +Z is forward (character eyes/nose direction)
        // -Z is backward
        // +X is left (character's left arm)
        // -X is right (character's right arm)
        const localMove = new THREE.Vector3();
        if (keys['KeyW'] || keys['ArrowUp']) localMove.z += 1;
        if (keys['KeyS'] || keys['ArrowDown']) localMove.z -= 1;
        if (keys['KeyA'] || keys['ArrowLeft']) localMove.x += 1;
        if (keys['KeyD'] || keys['ArrowRight']) localMove.x -= 1;

        const isSprint = keys['ShiftLeft'] || keys['ShiftRight'];

        if (localMove.lengthSq() > 0) {
          localMove.normalize();
          const moveSpeed = isSprint ? SPRINT_SPEED : MOVE_SPEED;
          anim.setMove(localMove.x * moveSpeed, localMove.z * moveSpeed);

          // Convert local movement direction to world space using character yaw
          const worldMove = localMove.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), playerYawRef.current);
          playerPosRef.current.addScaledVector(worldMove, moveSpeed * delta);

          // Clamp inside arena
          if (playerPosRef.current.length() > ARENA_RADIUS - 0.5) {
            playerPosRef.current.setLength(ARENA_RADIUS - 0.5);
          }
        } else {
          anim.setMove(0, 0);
        }

        const rig = playerRigRef.current!;
        rig.root.position.copy(playerPosRef.current);
        rig.root.rotation.y = playerYawRef.current;
        anim.update(delta);
      } else if (mode === 'INSPECTOR' && anim) {
        // Inspector mode: just idle with whatever anim is active
        anim.update(delta);
      }

      // ─ 2. Dummy update ─
      const dm = dummyRef.current;
      if (dm) dm.update(delta);

      // ─ 3. Bot AI ─
      const botAnim = botAnimatorRef.current;
      if (botAnim) {
        const botRoot = botRigRef.current!.root;
        botRoot.rotation.y = Math.atan2(
          playerPosRef.current.x - botRoot.position.x,
          playerPosRef.current.z - botRoot.position.z,
        );
        botAnim.update(delta);
      }

      // ─ 4. Camera (Bannerlord Over-the-shoulder view with dynamic aim zoom) ─
      if (mode === 'PLAYABLE') {
        const isAiming = isAimingBowRef.current;
        const targetFov = isAiming ? 34 : 46;
        if (Math.abs(camera.fov - targetFov) > 0.05) {
          camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.12);
          camera.updateProjectionMatrix();
        }

        const targetCamDist = isAiming ? 2.3 : 3.4;
        const targetCamHeight = isAiming ? 1.62 : 1.76;
        const targetRightOffset = isAiming ? 0.48 : 0.38;

        const fwdX = Math.sin(playerYawRef.current);
        const fwdZ = Math.cos(playerYawRef.current);
        const rightX = -Math.cos(playerYawRef.current);
        const rightZ = Math.sin(playerYawRef.current);

        const targetCamPos = _tmpV.set(
          playerPosRef.current.x - fwdX * targetCamDist + rightX * targetRightOffset,
          playerPosRef.current.y + targetCamHeight - Math.sin(playerPitchRef.current) * targetCamDist * 0.32,
          playerPosRef.current.z - fwdZ * targetCamDist + rightZ * targetRightOffset,
        );
        camera.position.lerp(targetCamPos, CAM_LERP);

        // Look at point: extends far forward along the character's line of sight
        const lookDist = 12.0;
        camera.lookAt(
          playerPosRef.current.x + fwdX * lookDist + rightX * 0.08,
          playerPosRef.current.y + CAM_LOOK_HEIGHT + Math.sin(playerPitchRef.current) * lookDist * 0.9,
          playerPosRef.current.z + fwdZ * lookDist + rightZ * 0.08,
        );
      } else {
        const o = orbitRef.current;
        camera.position.set(
          Math.sin(o.azimuth) * Math.cos(o.polar) * o.distance,
          Math.sin(o.polar) * o.distance + 0.8,
          Math.cos(o.azimuth) * Math.cos(o.polar) * o.distance,
        );
        camera.lookAt(0, 1.1, 0);
      }

      // ─ 5. Flying arrows ─
      const arrows = flyingArrowsRef.current;
      for (const arrow of arrows) {
        if (!arrow.inFlight) continue;

        arrow.velocity.addScaledVector(gravity, delta);
        arrow.mesh.position.addScaledVector(arrow.velocity, delta);

        const forward = arrow.velocity.clone().normalize();
        arrow.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);

        // Ground collision
        if (arrow.mesh.position.y <= 0.05) {
          arrow.inFlight = false;
          arrow.mesh.position.y = 0.05;
          sound.playShieldHit();
          spawnDamageText('🎯 TOPRAĞA SAPLANDI', '#a8a29e', arrow.mesh.position);
          continue;
        }

        // Archery target collision
        const distToTarget = arrow.mesh.position.distanceTo(new THREE.Vector3(-5.5, 1.25, -8));
        if (distToTarget < 0.6) {
          arrow.inFlight = false;
          sound.playShieldHit();
          const score = distToTarget < 0.2 ? '🎯 100 TAM 12\'DEN!' : '🎯 75 İSABET!';
          spawnDamageText(score, '#facc15', arrow.mesh.position);
          continue;
        }

        // Dummy collision
        const dummyObj = dummyRef.current;
        if (dummyObj) {
          const distToDummy = arrow.mesh.position.distanceTo(new THREE.Vector3(4.5, 1.2, -5.5));
          if (distToDummy < 0.7) {
            arrow.inFlight = false;
            dummyObj.hit();
            sound.playShieldHit();
            spawnDamageText('💥 82 DELİCİ OK HASARI!', '#ef4444', arrow.mesh.position);
            setDummyHitCount((c) => c + 1);
            continue;
          }
        }

        // Bot collision
        const botRoot = botRigRef.current?.root;
        if (botRoot) {
          const distToBot = arrow.mesh.position.distanceTo(botRoot.position);
          if (distToBot < 0.8) {
            arrow.inFlight = false;
            sound.playShieldHit();
            spawnDamageText('🛡️ KALKAN OKU YUTTU!', '#38bdf8', botRoot.position);
            continue;
          }
        }

        // Lifetime
        if (Date.now() - arrow.spawnTime > ARROW_LIFETIME) {
          arrow.inFlight = false;
          scene.remove(arrow.mesh);
        }
      }

      renderer.render(scene, camera);
    };

    loop();

    // ── Resize handler ──
    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // ── Cleanup ──
    return () => {
      cancelAnimationFrame(animIdRef.current);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
      }
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneCreatedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // EMPTY DEPS — scene created once

  // ══════════════════════════════════════════════════════════════════════
  //  EQUIPMENT SYNC — reacts to React state changes, updates the rig
  //  WITHOUT rebuilding the 3D scene
  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const rig = playerRigRef.current;
    const anim = playerAnimatorRef.current;
    if (!rig) return;

    const opts: CharacterVisualOptions = {
      skinTone: '#dfa882',
      hairColor: '#382212',
      beardColor: '#382212',
      factionColor,
      hasBeard,
      weaponType,
      shieldType,
      helmetType,
      armorTier,
    };

    applyEquipmentToRig(rig, opts);

    // Animator needs to reset to pick up new weapon class
    if (anim) anim.reset();
  }, [weaponType, shieldType, helmetType, armorTier, factionColor, hasBeard]);

  // ── Wireframe toggle ──
  useEffect(() => {
    const rig = playerRigRef.current;
    if (rig) setRigWireframe(rig, isWireframe);
  }, [isWireframe]);

  // ── Cosmetics-only changes (faction color, beard) ──
  useEffect(() => {
    const rig = playerRigRef.current;
    if (rig) {
      applyCosmeticsToRig(rig, { factionColor, hasBeard });
    }
  }, [factionColor, hasBeard]);

  // ── Animation panel trigger ──
  const triggerAnimation = useCallback((anim: CharacterAnimState) => {
    setActiveAnimLabel(anim);
    const animator = playerAnimatorRef.current;
    if (animator) {
      animator.applyLegacyState(anim);
    }
  }, []);

  const triggerDirectionalAction = useCallback((type: 'attack' | 'block', dir: AttackDirection) => {
    setCombatDirection(dir);
    combatDirRef.current = dir;
    setActiveAnimLabel(`${type.toUpperCase()}_${dir.toUpperCase()}`);
    const animator = playerAnimatorRef.current;
    if (animator) {
      if (type === 'attack') animator.attack(dir, false);
      else animator.block(dir);
    }
  }, []);

  // ══════════════════════════════════════════════════════════════════════
  //  JSX UI (unchanged layout, slightly cleaner code)
  // ══════════════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 z-40 bg-[#0d0c0a] text-[#f3ead8] overflow-hidden select-none flex flex-col justify-between pointer-events-auto">
      {/* 3D WebGL Arena Canvas */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full cursor-crosshair" />

      {/* FLOATING 3D HIT DAMAGE LABELS */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {floatingTexts.map((txt) => {
          const age = Date.now() - txt.createdAt;
          if (age > DMG_TEXT_LIFETIME) return null;
          const opacity = Math.max(0, 1 - age / DMG_TEXT_LIFETIME);
          const offsetY = (age / DMG_TEXT_LIFETIME) * 45;
          return (
            <div
              key={txt.id}
              className="absolute font-display font-black text-sm tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] animate-bounce"
              style={{
                left: '50%',
                top: `calc(42% - ${offsetY}px)`,
                transform: 'translate(-50%, -50%)',
                color: txt.color,
                opacity,
              }}
            >
              {txt.text}
            </div>
          );
        })}
      </div>

      {/* TOP STATUS & NAVIGATION BAR */}
      <header className="relative z-30 p-4 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              if (document.pointerLockElement) document.exitPointerLock();
              onReturnToMap();
            }}
            className="px-4 py-2 rounded text-xs font-bold bg-[#1e1913] hover:bg-[#2b2218] text-[#fde68a] border border-[#c6a15b]/40 shadow-lg flex items-center gap-1.5 transition-colors"
          >
            <span>←</span>
            <span>Kalradya Sefer Haritasına Dön</span>
          </button>

          {onOpenMarket && (
            <button
              type="button"
              onClick={onOpenMarket}
              className="px-3 py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fbbf24]/50 shadow transition-colors flex items-center gap-1.5"
            >
              <span>⚖️</span>
              <span>Pazar & Envanter</span>
            </button>
          )}

          <div className="px-3 py-1.5 rounded bg-[#18130e]/90 border border-[#c6a15b]/30 text-xs font-semibold text-[#e2d6c1] hidden sm:flex items-center gap-2 shadow">
            <span className="text-[#fbbf24] font-bold">🏹 Sadak: {arrowCount} Ok</span>
            <span>·</span>
            <span className="text-[#34d399]">🎯 Kukla İsabeti: {dummyHitCount}</span>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="p-1 rounded bg-[#1c1711] border border-[#c6a15b]/30 flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => {
                if (document.pointerLockElement) document.exitPointerLock();
                setControlMode('PLAYABLE');
              }}
              className={`px-3 py-1 rounded font-bold transition-colors ${
                controlMode === 'PLAYABLE'
                  ? 'bg-[#b45309] text-white'
                  : 'text-[#a89b84] hover:text-white'
              }`}
            >
              🎮 3. Şahıs Savaşçı
            </button>
            <button
              type="button"
              onClick={() => {
                if (document.pointerLockElement) document.exitPointerLock();
                setControlMode('INSPECTOR');
              }}
              className={`px-3 py-1 rounded font-bold transition-colors ${
                controlMode === 'INSPECTOR'
                  ? 'bg-[#b45309] text-white'
                  : 'text-[#a89b84] hover:text-white'
              }`}
            >
              🔍 360° İnceleme Manken
            </button>
          </div>

          <div className="hidden lg:block px-3 py-1 rounded bg-[#16120e]/80 border border-[#c6a15b]/20 text-[11px] text-[#c6a15b]">
            {controlMode === 'PLAYABLE'
              ? 'WASD: Yürü · Shift: Koş · Sol Tık: Saldır · Sağ Tık: Blok · 1-5: Silah'
              : 'Sol Sürükle: Döndür · Tekerlek: Yakınlaş · H: Menü Gizle'}
          </div>
        </div>
      </header>

      {/* BANNERLORD / WARBAND 4-DIRECTIONAL COMBAT RETICLE (PLAYABLE MODE ONLY) */}
      {controlMode === 'PLAYABLE' && (
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-25">
          {weaponType === 'BOW' ? (
            /* Archery Reticle */
            <div className="relative flex flex-col items-center justify-center">
              <div
                className={`relative flex items-center justify-center transition-all duration-150 ${
                  isAimingBow ? 'scale-75' : 'scale-100'
                }`}
              >
                {/* Crosshair Brackets */}
                <div
                  className={`w-10 h-10 border border-[#fde68a]/60 rounded-full transition-all duration-200 ${
                    isAimingBow ? 'scale-60 border-amber-400 bg-amber-400/10' : 'scale-100'
                  }`}
                />
                <div className="absolute w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
              </div>
              <div className="mt-5 text-[11px] font-bold tracking-wider px-2.5 py-0.5 rounded bg-black/60 border border-[#c6a15b]/40 backdrop-blur-none text-[#fbbf24]">
                {isAimingBow ? '🏹 NİŞAN ALINIYOR (Bırak: Fırlat | Sağ Tık: İptal)' : '🏹 Sol Tık: Ger & Nişan Al'}
              </div>
            </div>
          ) : (
            /* Melee 4-Directional Reticle */
            <div className="relative flex flex-col items-center justify-center">
              <div className="relative w-20 h-20 flex items-center justify-center">
                {/* Center dot */}
                <div className="w-1.5 h-1.5 rounded-full bg-amber-200/60 shadow-[0_0_4px_rgba(251,191,36,0.6)]" />

                {/* UP Arrow (Overhead) */}
                <div
                  className={`absolute top-0 transition-all duration-100 ${
                    combatDirection === 'up'
                      ? 'text-amber-400 scale-125 drop-shadow-[0_0_8px_rgba(251,191,36,1)] -translate-y-1'
                      : 'text-stone-400/30 scale-100'
                  }`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4l-7 7h4v9h6v-9h4z" />
                  </svg>
                </div>

                {/* DOWN Arrow (Thrust) */}
                <div
                  className={`absolute bottom-0 transition-all duration-100 ${
                    combatDirection === 'down'
                      ? 'text-amber-400 scale-125 drop-shadow-[0_0_8px_rgba(251,191,36,1)] translate-y-1'
                      : 'text-stone-400/30 scale-100'
                  }`}
                >
                  <svg className="w-5 h-5 rotate-180" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4l-7 7h4v9h6v-9h4z" />
                  </svg>
                </div>

                {/* LEFT Arrow (Left Slash) */}
                <div
                  className={`absolute left-0 transition-all duration-100 ${
                    combatDirection === 'left'
                      ? 'text-amber-400 scale-125 drop-shadow-[0_0_8px_rgba(251,191,36,1)] -translate-x-1'
                      : 'text-stone-400/30 scale-100'
                  }`}
                >
                  <svg className="w-5 h-5 -rotate-90" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4l-7 7h4v9h6v-9h4z" />
                  </svg>
                </div>

                {/* RIGHT Arrow (Right Slash) */}
                <div
                  className={`absolute right-0 transition-all duration-100 ${
                    combatDirection === 'right'
                      ? 'text-amber-400 scale-125 drop-shadow-[0_0_8px_rgba(251,191,36,1)] translate-x-1'
                      : 'text-stone-400/30 scale-100'
                  }`}
                >
                  <svg className="w-5 h-5 rotate-90" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4l-7 7h4v9h6v-9h4z" />
                  </svg>
                </div>
              </div>

              {/* Combat direction label badge */}
              <div className="mt-4 flex items-center gap-2 text-[11px] font-bold tracking-wider px-2.5 py-0.5 rounded bg-black/60 border border-[#c6a15b]/40 backdrop-blur-none text-[#fbbf24]">
                <span>
                  {combatDirection === 'up' && '⬆️ ÜST DARBE / BLOK'}
                  {combatDirection === 'down' && '⬇️ DÜZ DELİCİ HAMLE / ALT BLOK'}
                  {combatDirection === 'left' && '⬅️ SOL KESİK / SOL SAVUNMA'}
                  {combatDirection === 'right' && '➡️ SAĞ KESİK / SAĞ SAVUNMA'}
                </span>
                {shieldType !== 'NONE' && (
                  <span className="text-emerald-400 font-semibold border-l border-[#c6a15b]/40 pl-2">
                    🛡️ Kalkan (Tüm Yönler Korunur)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* BOTTOM CONTROL DOCK */}
      <footer className="relative z-30 pb-3 px-4 flex flex-col items-center pointer-events-none">
        <button
          type="button"
          onClick={() => setDockCollapsed((prev) => !prev)}
          className="mb-1.5 px-4 py-1 rounded-t bg-[#1a140f] border-t border-x border-[#c6a15b]/40 text-[11px] font-bold text-[#fde68a] hover:bg-[#261f18] transition-colors pointer-events-auto shadow-md"
        >
          {dockCollapsed ? '▴ Savaş & Karakter Kontrol Paneli [H]' : '▾ Paneli Gizle [H]'}
        </button>

        {!dockCollapsed && (
          <div
            className="w-full max-w-4xl p-3 rounded-lg border border-[#c6a15b]/40 bg-[#14100c]/95 shadow-2xl pointer-events-auto flex flex-col gap-2.5"
            style={{ backdropFilter: 'none' }}
          >
            {/* DOCK TABS */}
            <div className="flex items-center justify-between border-b border-[#c6a15b]/20 pb-2 text-xs">
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'WEAPON', label: '⚔️ Silah & Duruş' },
                    { id: 'ARMOR', label: '🪖 Zırh & Görünüm' },
                    { id: 'ANIM', label: '🎬 Animasyon Testi' },
                    { id: 'SETTINGS', label: '⚙️ Fizik & Ağır Çekim' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveDockTab(tab.id)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                      activeDockTab === tab.id
                        ? 'bg-[#b45309] text-white border border-[#fde68a]/40 shadow'
                        : 'bg-[#1e1913] text-[#b5a890] hover:text-white border border-transparent'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="text-[11px] text-[#fbbf24] font-semibold hidden sm:block">
                Karakter: {weaponType} · {armorTier} · {helmetType}
              </div>
            </div>

            {/* TAB 1: WEAPON */}
            {activeDockTab === 'WEAPON' && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                {(
                  [
                    { id: 'ONE_HANDED_SWORD', label: 'Tek Elli Kılıç & Kalkan', sub: 'Spatha & Yuvarlak Kalkan', icon: '⚔️' },
                    { id: 'TWO_HANDED_SWORD', label: 'Çift Elli Kılıç (Falx)', sub: 'Yıkıcı Alan Darbesi', icon: '🗡️' },
                    { id: 'BOW', label: 'Kompozit Yay & Ok', sub: 'Menzilli Fizik Atışı', icon: '🏹' },
                    { id: 'SPEAR', label: 'Süvari Kargısı & Mızrak', sub: 'Düz Delici Hamle', icon: '🔱' },
                    { id: 'UNARMED', label: 'Silahsız / Yumruk', sub: 'Güreş & Sokak Dövüşü', icon: '🥊' },
                  ] as const
                ).map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setWeaponType(w.id)}
                    className={`p-2 rounded text-left border transition-all ${
                      weaponType === w.id
                        ? 'bg-[#2b1f13] border-[#f59e0b] text-[#fef08a] shadow'
                        : 'bg-[#18130e] border-[#c6a15b]/20 text-[#a89b84] hover:border-[#c6a15b]/50'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5 truncate">
                      <span>{w.icon}</span>
                      <span className="truncate">{w.label}</span>
                    </div>
                    <div className="text-[10px] text-[#c6a15b] truncate mt-0.5">{w.sub}</div>
                  </button>
                ))}
              </div>
            )}

            {/* TAB 2: ARMOR */}
            {activeDockTab === 'ARMOR' && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                {/* Helmets */}
                <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 space-y-1.5">
                  <span className="text-[10px] text-[#c6a15b] font-bold block">🪖 Miğfer Tipi:</span>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        { id: 'NONE', label: 'Yok' },
                        { id: 'KETTLE_HAT', label: 'Çanak' },
                        { id: 'SPANGENHELM', label: 'Spangen' },
                        { id: 'IMPERIAL_VISOR', label: 'Katafrakt' },
                      ] as const
                    ).map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setHelmetType(h.id)}
                        className={`py-1 px-1.5 rounded text-[10px] font-bold text-center ${
                          helmetType === h.id
                            ? 'bg-[#b45309] text-white'
                            : 'bg-[#241c14] text-[#a89b84] hover:text-white'
                        }`}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Armor */}
                <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 space-y-1.5">
                  <span className="text-[10px] text-[#c6a15b] font-bold block">🥋 Gövde Zırhı:</span>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        { id: 'CIVILIAN', label: 'Sivil Tunik' },
                        { id: 'LEATHER', label: 'Deri Gambeson' },
                        { id: 'CHAINMAIL', label: 'Örme Zincir' },
                        { id: 'PLATE', label: 'Ağır Katafrakt' },
                      ] as const
                    ).map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setArmorTier(a.id)}
                        className={`py-1 px-1.5 rounded text-[10px] font-bold text-center ${
                          armorTier === a.id
                            ? 'bg-[#b45309] text-white'
                            : 'bg-[#241c14] text-[#a89b84] hover:text-white'
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Shields */}
                <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 space-y-1.5">
                  <span className="text-[10px] text-[#c6a15b] font-bold block">🛡️ Kalkan Modeli:</span>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        { id: 'NONE', label: 'Yok' },
                        { id: 'ROUND_SHIELD', label: 'Yuvarlak' },
                        { id: 'KITE_SHIELD', label: 'Damla' },
                        { id: 'PAVISE', label: 'Pavise' },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setShieldType(s.id)}
                        className={`py-1 px-1.5 rounded text-[10px] font-bold text-center ${
                          shieldType === s.id
                            ? 'bg-[#b45309] text-white'
                            : 'bg-[#241c14] text-[#a89b84] hover:text-white'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Faction Colors & Beard */}
                <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 space-y-1.5">
                  <span className="text-[10px] text-[#c6a15b] font-bold block">🚩 Krallık Renkleri:</span>
                  <div className="flex items-center gap-1.5">
                    {[
                      { color: '#991b1b', name: 'Vlandia' },
                      { color: '#581c87', name: 'Empire' },
                      { color: '#166534', name: 'Battania' },
                      { color: '#1e3a8a', name: 'Sturgia' },
                      { color: '#b45309', name: 'Aserai' },
                      { color: '#047857', name: 'Khuzait' },
                    ].map((f) => (
                      <button
                        key={f.color}
                        type="button"
                        onClick={() => setFactionColor(f.color)}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                          factionColor === f.color ? 'scale-110 border-white' : 'border-black/50'
                        }`}
                        style={{ backgroundColor: f.color }}
                        title={f.name}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setHasBeard((b) => !b)}
                    className="w-full mt-1 py-0.5 rounded text-[10px] font-bold bg-[#241c14] hover:bg-[#34281c] text-[#d6cbb5]"
                  >
                    {hasBeard ? '🧔 Sakal: Var' : '🧑 Sakal: Yok (Tıraşlı)'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: ANIMATION TESTER */}
            {activeDockTab === 'ANIM' && (
              <div className="flex flex-col gap-2 text-xs">
                {/* 4 Directional Attacks & Blocks */}
                <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded bg-[#18130e] border border-[#c6a15b]/20">
                  <span className="text-[10px] text-[#fbbf24] font-bold mr-1">⚔️ 4 Yönlü Saldırı:</span>
                  {(
                    [
                      { dir: 'up', label: '⬆️ Üst (Overhead)' },
                      { dir: 'down', label: '⬇️ Delici (Thrust)' },
                      { dir: 'left', label: '⬅️ Sol Savurma' },
                      { dir: 'right', label: '➡️ Sağ Savurma' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.dir}
                      type="button"
                      onClick={() => triggerDirectionalAction('attack', item.dir)}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                        activeAnimLabel === `ATTACK_${item.dir.toUpperCase()}`
                          ? 'bg-[#b45309] text-white shadow'
                          : 'bg-[#221c15] text-[#d1c5b0] hover:text-white hover:bg-[#30271e]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}

                  <span className="text-[10px] text-[#38bdf8] font-bold ml-2 mr-1">🛡️ 4 Yönlü Blok:</span>
                  {(
                    [
                      { dir: 'up', label: '⬆️ Üst Blok' },
                      { dir: 'down', label: '⬇️ Alt Blok' },
                      { dir: 'left', label: '⬅️ Sol Blok' },
                      { dir: 'right', label: '➡️ Sağ Blok' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.dir}
                      type="button"
                      onClick={() => triggerDirectionalAction('block', item.dir)}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                        activeAnimLabel === `BLOCK_${item.dir.toUpperCase()}`
                          ? 'bg-[#0369a1] text-white shadow'
                          : 'bg-[#221c15] text-[#d1c5b0] hover:text-white hover:bg-[#30271e]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* General Actions */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'IDLE', label: 'Duruş (Idle)' },
                      { id: 'WALK', label: 'Yürü' },
                      { id: 'RUN', label: 'Koş' },
                      { id: 'BOW_DRAW', label: '🏹 Yay Çek' },
                      { id: 'BOW_RELEASE', label: '🎯 Oku Fırlat' },
                      { id: 'HIT_STAGGER', label: '💥 Darbe Al' },
                      { id: 'FALL_DEFEAT', label: '☠️ Yere Düş (Yenilgi)' },
                    ] as const
                  ).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => triggerAnimation(a.id)}
                      className={`px-2.5 py-1.5 rounded text-[11px] font-bold transition-colors ${
                        activeAnimLabel === a.id
                          ? 'bg-[#b45309] text-white shadow'
                          : 'bg-[#221c15] text-[#d1c5b0] hover:text-white hover:bg-[#30271e]'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: SETTINGS */}
            {activeDockTab === 'SETTINGS' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center text-xs">
                {/* Speed slider */}
                <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-[#c6a15b] font-bold">⏱️ Animasyon & Fizik Hızı:</span>
                    <span className="font-mono text-[#fbbf24] font-bold">{animSpeed.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.5"
                    step="0.1"
                    value={animSpeed}
                    onChange={(e) => setAnimSpeed(parseFloat(e.target.value))}
                    className="w-full accent-[#f59e0b] cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-[#78716c] mt-0.5">
                    <span>0.1x (Ağır Çekim)</span>
                    <span>1.0x (Normal)</span>
                    <span>1.5x (Hızlı)</span>
                  </div>
                </div>

                {/* Wireframe */}
                <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-[#f8f0df] block text-[11px]">3B Tel Kafes (Wireframe)</span>
                    <span className="text-[10px] text-[#a89b84]">Düşük poligon ağ yapısını incele</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsWireframe((w) => !w)}
                    className={`px-3 py-1 rounded text-[11px] font-bold ${
                      isWireframe ? 'bg-[#15803d] text-white' : 'bg-[#2b2218] text-[#a89b84]'
                    }`}
                  >
                    {isWireframe ? 'AÇIK' : 'KAPALI'}
                  </button>
                </div>

                {/* Reset targets */}
                <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-[#f8f0df] block text-[11px]">Hedef ve Bot Sıfırla</span>
                    <span className="text-[10px] text-[#a89b84]">Kukla pozisyonunu ve okları yenile</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setArrowCount(32);
                      setDummyHitCount(0);
                      playerPosRef.current.set(0, 0, 4);
                      playerYawRef.current = Math.PI;
                      playerPitchRef.current = 0;
                      if (playerAnimatorRef.current) playerAnimatorRef.current.reset();
                      // Clear stuck arrows from scene
                      const scene = sceneRef.current;
                      if (scene) {
                        for (const arrow of flyingArrowsRef.current) {
                          scene.remove(arrow.mesh);
                        }
                        flyingArrowsRef.current = [];
                      }
                    }}
                    className="px-3 py-1 rounded text-[11px] font-bold bg-[#b45309] hover:bg-[#d97706] text-white whitespace-nowrap"
                  >
                    Sıfırla
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </footer>
    </div>
  );
};
