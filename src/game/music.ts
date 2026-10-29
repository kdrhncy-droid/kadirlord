/**
 * music.ts — Mount & Blade: Warband & BannerPage Müzik Motoru
 *
 * Kalradya kıtasında, ana menüde, şehirlerde, hanlarda, arenada ve meydan savaşlarında
 * BannerPage'in orijinal .ogg müziklerini kesintisiz (loop) çalar.
 */

export type MusicCategory =
  | 'TITLE'
  | 'TRAVEL'
  | 'BATTLE'
  | 'ARENA'
  | 'TOWN'
  | 'TAVERN'
  | 'VICTORY'
  | 'DEFEAT';

const TRACKS: Record<MusicCategory, string[]> = {
  TITLE: ['/music/SRing_title.ogg'],
  TRAVEL: [
    '/music/SRing_travel_neutral_1.ogg',
    '/music/SRing_travel_neutral_2.ogg',
    '/music/SRing_travel_swadian.ogg',
  ],
  BATTLE: [
    '/music/swadian_battle_a.ogg',
    '/music/bandit_fight_a.ogg',
  ],
  ARENA: ['/music/SRing_arena.ogg'],
  TOWN: ['/music/SRing_town_day.ogg'],
  TAVERN: ['/music/SRing_tavern.ogg'],
  VICTORY: ['/music/SRing_victorious_1.ogg'],
  DEFEAT: ['/music/SRing_defeated.ogg'],
};

class MusicManager {
  private currentAudio: HTMLAudioElement | null = null;
  private currentCategory: MusicCategory | null = null;
  private volume: number = 0.55;
  private muted: boolean = false;
  private travelIndex: number = 0;
  private unlocked: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedVol = localStorage.getItem('kadirlord_music_volume');
        if (savedVol !== null) {
          const v = parseFloat(savedVol);
          if (!isNaN(v)) this.volume = Math.max(0, Math.min(1, v));
        }
        const savedMute = localStorage.getItem('kadirlord_music_muted');
        if (savedMute !== null) {
          this.muted = savedMute === 'true';
        }
      } catch {}
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('kadirlord_music_volume', this.volume.toString());
      } catch {}
    }
    if (this.currentAudio) {
      this.currentAudio.volume = this.muted ? 0 : this.volume;
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('kadirlord_music_muted', this.muted.toString());
      } catch {}
    }
    if (this.currentAudio) {
      this.currentAudio.volume = this.muted ? 0 : this.volume;
    }
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public play(category: MusicCategory, forceRestart = false): void {
    if (typeof window === 'undefined') return;
    if (this.currentCategory === category && this.currentAudio && !this.currentAudio.paused && !forceRestart) {
      return;
    }

    const trackList = TRACKS[category];
    if (!trackList || trackList.length === 0) return;

    let trackUrl = trackList[0];
    if (category === 'TRAVEL') {
      trackUrl = trackList[this.travelIndex % trackList.length];
      this.travelIndex = (this.travelIndex + 1) % trackList.length;
    } else if (trackList.length > 1) {
      trackUrl = trackList[Math.floor(Math.random() * trackList.length)];
    }

    this.currentCategory = category;

    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }

    const audio = new Audio(trackUrl);
    audio.loop = category !== 'VICTORY' && category !== 'DEFEAT';
    audio.volume = this.muted ? 0 : this.volume;

    if (!audio.loop && category !== 'TITLE') {
      audio.onended = () => {
        if (this.currentCategory === category) {
          this.play('TRAVEL');
        }
      };
    }

    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(() => {
        // Autoplay politikasında kullanıcı jesti beklenir
      });
    }

    this.currentAudio = audio;
  }

  public stop(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }
    this.currentCategory = null;
  }

  public getCurrentCategory(): MusicCategory | null {
    return this.currentCategory;
  }

  public unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.currentAudio && this.currentAudio.paused && this.currentCategory) {
      this.currentAudio.play().catch(() => {});
    }
  }
}

export const music = new MusicManager();

if (typeof window !== 'undefined') {
  const triggerUnlock = () => {
    music.unlock();
    window.removeEventListener('pointerdown', triggerUnlock);
    window.removeEventListener('keydown', triggerUnlock);
  };
  window.addEventListener('pointerdown', triggerUnlock, { once: true });
  window.addEventListener('keydown', triggerUnlock, { once: true });
}
