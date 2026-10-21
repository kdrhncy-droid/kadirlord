import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { setArmoryVisualsEnabled, armoryVisualsEnabled } from './game/armoryBridge.ts';
import { setArmorySoundEnabled, armorySoundEnabled } from './game/armorySound.ts';
import {
  installDeterministicRandom,
  parseE2ERequest,
} from './game/testHarness.ts';

// E2E yalnız geliştirme derlemesinde ve açık `e2e=1` parametresiyle çalışır.
// RNG, ilk render'dan önce tohuma bağlanır; üretimde bu blok devre dışıdır.
const e2eRequest = parseE2ERequest(window.location.search, import.meta.env.DEV);
if (e2eRequest.enabled) {
  installDeterministicRandom(e2eRequest.seed);
}

createRoot(document.getElementById('root')!).render(<App />);

/**
 * BannerForge teşhis kancası — konsoldan görsel/ses katmanını kıyaslayın:
 *
 *   __bannerforge.off()   → eski (legacy) modeller + eski sesler
 *   __bannerforge.on()    → BannerForge modelleri + savaş ses motoru
 *   __bannerforge.status()
 *
 * Değişiklik bir sonraki ekipman kurulumunda (arenaya/pazara girişte) etkili olur.
 */
declare global {
  interface Window {
    __bannerforge?: {
      on: () => void;
      off: () => void;
      toggle: () => boolean;
      status: () => { visuals: boolean; sound: boolean };
    };
  }
}

window.__bannerforge = {
  on: () => {
    setArmoryVisualsEnabled(true);
    setArmorySoundEnabled(true);
    console.info('[BannerForge] açık — yeni zırh/silah/miğfer + savaş sesleri');
  },
  off: () => {
    setArmoryVisualsEnabled(false);
    setArmorySoundEnabled(false);
    console.info('[BannerForge] kapalı — eski modeller ve sesler');
  },
  toggle: () => {
    const next = !armoryVisualsEnabled();
    setArmoryVisualsEnabled(next);
    setArmorySoundEnabled(next);
    console.info(`[BannerForge] ${next ? 'açık' : 'kapalı'}`);
    return next;
  },
  status: () => ({ visuals: armoryVisualsEnabled(), sound: armorySoundEnabled() }),
};
