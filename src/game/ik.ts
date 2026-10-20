import * as THREE from 'three';

/**
 * Analytic two-bone IK for the procedural humanoid arm chain.
 *
 * Chain layout (see characterRig.ts):
 *   shoulder (ball joint, rotated here)  ->  upperArm (kept identity)
 *     -> forearm at local (0, -L1, 0), hinge around local X
 *       -> hand at local (0, -L2, 0)
 *
 * The bone direction for every segment is local -Y.
 */

const _S = new THREE.Vector3();
const _T = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _u = new THREE.Vector3();
const _E = new THREE.Vector3();
const _f = new THREE.Vector3();
const _X = new THREE.Vector3();
const _Y = new THREE.Vector3();
const _Z = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qParentInv = new THREE.Quaternion();

export interface TwoBoneChain {
  shoulder: THREE.Object3D;
  upperArm: THREE.Object3D;
  forearm: THREE.Object3D;
  hand: THREE.Object3D;
  /** Upper arm length (shoulder -> elbow). */
  l1: number;
  /** Forearm length (elbow -> hand origin). */
  l2: number;
}

/**
 * Solves the chain so the hand origin reaches `targetWorld`.
 * `poleWorld` is a world-space DIRECTION hint for where the elbow should point.
 * The result is blended with the current (FK) pose by `weight`.
 */
export function solveTwoBoneIK(
  chain: TwoBoneChain,
  targetWorld: THREE.Vector3,
  poleWorld: THREE.Vector3,
  weight: number,
): void {
  if (weight <= 0.0001) return;
  const parent = chain.shoulder.parent;
  if (!parent) return;

  const { l1, l2 } = chain;

  // Work in the shoulder's parent space.
  parent.updateWorldMatrix(true, false);
  parent.getWorldQuaternion(_qParentInv).invert();

  _S.copy(chain.shoulder.position);
  _T.copy(targetWorld);
  parent.worldToLocal(_T);
  _pole.copy(poleWorld).applyQuaternion(_qParentInv).normalize();

  _dir.subVectors(_T, _S);
  let dist = _dir.length();
  if (dist < 1e-5) return;
  _dir.divideScalar(dist);
  dist = THREE.MathUtils.clamp(dist, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);

  // Bend direction = pole projected perpendicular to the reach direction.
  _bend.copy(_pole).addScaledVector(_dir, -_pole.dot(_dir));
  if (_bend.lengthSq() < 1e-8) {
    _bend.set(0, -1, 0).addScaledVector(_dir, _dir.y);
    if (_bend.lengthSq() < 1e-8) _bend.set(0, 0, -1);
  }
  _bend.normalize();

  // Law of cosines -> shoulder angle.
  const cosA = THREE.MathUtils.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _u.copy(_dir).multiplyScalar(cosA).addScaledVector(_bend, sinA).normalize();

  _E.copy(_S).addScaledVector(_u, l1);
  _f.copy(_S).addScaledVector(_dir, dist).sub(_E).normalize();

  // Shoulder basis: Y = -upperArmDir, X = bend-plane normal, Z = X × Y.
  _Y.copy(_u).negate();
  _X.crossVectors(_dir, _bend).normalize();
  _Z.crossVectors(_X, _Y).normalize();

  // Forearm hinge angle in shoulder-local space: Rx(θ)·(0,-1,0) = f_local.
  let fy = _f.dot(_Y);
  let fz = _f.dot(_Z);
  let theta = Math.atan2(-fz, -fy);
  if (theta > 0) {
    // Keep the FK convention (elbow flex = negative X) so blending never twists 180°.
    _X.negate();
    _Z.negate();
    fz = -fz;
    theta = Math.atan2(-fz, -fy);
  }

  _m.makeBasis(_X, _Y, _Z);
  _q.setFromRotationMatrix(_m);

  chain.shoulder.quaternion.slerp(_q, weight);
  chain.upperArm.quaternion.slerp(IDENTITY_Q, weight);
  const fr = chain.forearm.rotation;
  chain.forearm.rotation.set(
    THREE.MathUtils.lerp(fr.x, theta, weight),
    THREE.MathUtils.lerp(fr.y, 0, weight),
    THREE.MathUtils.lerp(fr.z, 0, weight),
  );
}

const IDENTITY_Q = new THREE.Quaternion();

const _hq = new THREE.Quaternion();
const _fq = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _mm = new THREE.Matrix4();

/**
 * Orients the hand so its local +Z axis points along `zWorld`.
 * The secondary axis (`secondaryAxis`) is aligned as closely as possible to `hintWorld`.
 * Blended with the current hand rotation by `weight`.
 */
export function orientHand(
  hand: THREE.Object3D,
  zWorld: THREE.Vector3,
  hintWorld: THREE.Vector3,
  secondaryAxis: 'x' | 'y',
  weight: number,
): void {
  if (weight <= 0.0001 || !hand.parent) return;
  _c.copy(zWorld).normalize();
  _a.copy(hintWorld).addScaledVector(_c, -hintWorld.dot(_c));
  if (_a.lengthSq() < 1e-8) {
    _a.set(0, 1, 0).addScaledVector(_c, -_c.y);
    if (_a.lengthSq() < 1e-8) _a.set(1, 0, 0);
  }
  _a.normalize();

  if (secondaryAxis === 'y') {
    // Y = hint, X = Y × Z
    _b.crossVectors(_a, _c).normalize();
    _mm.makeBasis(_b, _a, _c);
  } else {
    // X = hint, Y = Z × X
    _b.crossVectors(_c, _a).normalize();
    _mm.makeBasis(_a, _b, _c);
  }
  _hq.setFromRotationMatrix(_mm);

  hand.parent.updateWorldMatrix(true, false);
  hand.parent.getWorldQuaternion(_fq).invert();
  _hq.premultiply(_fq);
  hand.quaternion.slerp(_hq, weight);
}
