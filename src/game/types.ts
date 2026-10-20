import type { TacticalOrder } from './rules';

export interface BattleTelemetry {
  playerHp: number;
  playerMaxHp: number;
  playerStamina: number;
  alliesAlive: number;
  alliesTotal: number;
  enemiesAlive: number;
  enemiesTotal: number;
  enemyCommanderName: string;
  activeOrder: TacticalOrder;
  comboCount: number;
}

export interface ProjectedMapLabel {
  id: string;
  kind: 'settlement' | 'lord' | 'player_party' | 'landmark';
  name: string;
  sublabel: string;
  color: string;
  glyph?: string;
  troopCount?: number;
  woundedCount?: number;
  ownerName?: string;
  factionName?: string;
  speed?: number;
  infantry?: number;
  ranged?: number;
  cavalry?: number;
  prisoners?: number;
  settlementType?: 'CASTLE' | 'TOWN' | 'VILLAGE';
  prosperity?: number;
  screenX: number;
  screenY: number;
  worldX: number;
  worldZ: number;
  visible: boolean;
}

export interface MapCameraTelemetry {
  focusX: number;
  focusZ: number;
  zoomDist: number;
  yawDeg: number;
  isFollowingPlayer: boolean;
  biomeLabel: string;
  partySpeed: number;
  spottingRange?: number;
  followingLordName?: string | null;
  targetSettlementName?: string | null;
  onRoad: boolean;
  isMoving: boolean;
  labels: ProjectedMapLabel[];
}

export interface CameraControlActions {
  focusOnPlayer: () => void;
  focusOnCoords: (x: number, z: number, zoom?: number) => void;
  adjustZoom: (delta: number) => void;
  rotateYaw: (deltaRad: number) => void;
  resetNorth: () => void;
  commandMarchTo: (
    x: number,
    z: number,
    target?: { type: 'settlement' | 'lord'; id: string },
  ) => void;
}
