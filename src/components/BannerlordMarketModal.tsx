import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  CALRADIA_MARKETPLACE_ITEMS,
  CampaignState,
  EquipmentSlotId,
  InventoryItem,
  MarketCategory,
  MarketplaceItem,
  Settlement,
  buyMarketplaceItem,
  equipInventoryItem,
  getTotalTroops,
  sellMarketplaceItem,
  unequipEquipmentSlot,
} from '../game/rules';
import {
  ArmorTier,
  HelmetType,
  ShieldType,
  WeaponType,
  applyEquipmentToRig,
  createCharacterRig,
  deriveRigVisualOptionsFromEquipment,
  updateRigAnimation,
} from '../game/characterRig';
import { sound } from '../game/sound';

interface BannerlordMarketModalProps {
  settlement?: Settlement | null;
  campaign: CampaignState;
  onClose: () => void;
  onUpdateCampaign: (nextState: CampaignState) => void;
  onOpenArenaTest?: () => void;
}

export const BannerlordMarketModal: React.FC<BannerlordMarketModalProps> = ({
  settlement,
  campaign,
  onClose,
  onUpdateCampaign,
  onOpenArenaTest,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<MarketCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'tier' | 'price_asc' | 'price_desc' | 'weight'>('tier');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [merchantGold, setMerchantGold] = useState(14800);

  // 3D Preview Canvas ref
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const rotationAngleRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastMouseXRef = useRef(0);

  const settlementName = settlement?.name || 'Pazaryeri & Ordugah';

  // Filter Market Items
  const filteredMarketItems = useMemo(() => {
    return CALRADIA_MARKETPLACE_ITEMS.filter((item) => {
      const matchCat = selectedCategory === 'ALL' || item.category === selectedCategory;
      const matchSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.statBonus.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    }).sort((a, b) => {
      if (sortBy === 'price_asc') return a.value - b.value;
      if (sortBy === 'price_desc') return b.value - a.value;
      if (sortBy === 'weight') return a.weight - b.weight;
      return b.tier - a.tier;
    });
  }, [selectedCategory, searchQuery, sortBy]);

  // Filter Player Backpack Items
  const filteredPlayerItems = useMemo(() => {
    const items = campaign.inventoryItems || [];
    return items.filter((item) => {
      const cat = item.category || 'TRADE';
      const matchCat =
        selectedCategory === 'ALL' ||
        (selectedCategory === 'WEAPON' && cat === 'WEAPON') ||
        (selectedCategory === 'SHIELD' && cat === 'SHIELD') ||
        (selectedCategory === 'ARMOR' && cat === 'ARMOR') ||
        (selectedCategory === 'FOOD' && cat === 'FOOD') ||
        (selectedCategory === 'HORSE' && cat === 'HORSE');
      const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [campaign.inventoryItems, selectedCategory, searchQuery]);

  // Derive Character Visual Options from equipped items
  const visualOptions = useMemo(
    () => deriveRigVisualOptionsFromEquipment(campaign.equipment, '#b45309'),
    [campaign.equipment],
  );

  // Mount 3D Character Preview Canvas in center
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 460;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#14100c');

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
    camera.position.set(0, 1.15, 3.2);
    camera.lookAt(0, 0.95, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Warm Key + Cool Fill Studio Lighting
    const keyLight = new THREE.DirectionalLight('#fffbeb', 1.8);
    keyLight.position.set(3, 4, 3);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#93c5fd', 0.8);
    fillLight.position.set(-3, 2, -2);
    scene.add(fillLight);

    const hemiLight = new THREE.HemisphereLight('#fef08a', '#1e1b18', 0.6);
    scene.add(hemiLight);

    // Pedestal Ground Disc
    const discGeo = new THREE.CylinderGeometry(1.2, 1.3, 0.1, 24);
    const discMat = new THREE.MeshStandardMaterial({ color: '#262018', roughness: 0.85 });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.y = -0.05;
    disc.receiveShadow = true;
    scene.add(disc);

    // Character Rig
    const rig = createCharacterRig(visualOptions);
    scene.add(rig.root);

    let animationFrameId: number;
    let clock = new THREE.Clock();

    const renderLoop = () => {
      animationFrameId = requestAnimationFrame(renderLoop);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Apply drag or slow idle rotation
      if (!isDraggingRef.current) {
        rotationAngleRef.current += delta * 0.25;
      }
      rig.root.rotation.y = rotationAngleRef.current;

      updateRigAnimation(rig, 'IDLE', elapsed, delta);
      renderer.render(scene, camera);
    };

    renderLoop();

    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      lastMouseXRef.current = e.clientX;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - lastMouseXRef.current;
      lastMouseXRef.current = e.clientX;
      rotationAngleRef.current += deltaX * 0.015;
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      cancelAnimationFrame(animationFrameId);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [visualOptions]);

  // Buy item handler
  const handleBuy = (item: MarketplaceItem) => {
    const res = buyMarketplaceItem(campaign, item, settlementName);
    if (!res.success) {
      setFeedback(res.reason || 'Satın alma başarısız.');
      return;
    }
    sound.playCoinChime();
    setMerchantGold((prev) => prev + item.value);
    setFeedback(`✔️ "${item.name}" satın alındı (-${item.value} Dinar).`);
    onUpdateCampaign(res.nextState);
  };

  // Sell item handler
  const handleSell = (itemId: string) => {
    const res = sellMarketplaceItem(campaign, itemId, settlementName);
    if (!res.success) {
      setFeedback(res.reason || 'Satış başarısız.');
      return;
    }
    sound.playCoinChime();
    setMerchantGold((prev) => Math.max(0, prev - res.goldGained));
    setFeedback(`💰 Eşya satıldı (+${res.goldGained} Dinar).`);
    onUpdateCampaign(res.nextState);
  };

  // Equip handler
  const handleEquip = (itemId: string) => {
    const res = equipInventoryItem(campaign, itemId);
    if (!res.success) {
      setFeedback(res.reason || 'Eşya kuşanılamadı.');
      return;
    }
    sound.playWarhorn();
    setFeedback('🛡️ Eşya kuşanıldı ve zırh değerleri güncellendi.');
    onUpdateCampaign(res.nextState);
  };

  // Unequip handler
  const handleUnequip = (slot: EquipmentSlotId) => {
    const res = unequipEquipmentSlot(campaign, slot);
    if (!res.success) {
      setFeedback(res.reason || 'Çıkarılamadı.');
      return;
    }
    setFeedback(`Eşya çıkarıldı ve sırt çantasına alındı.`);
    onUpdateCampaign(res.nextState);
  };

  // Quick: Sell all surplus loot
  const handleSellAllLoot = () => {
    let current = campaign;
    let totalGained = 0;
    const items = [...(current.inventoryItems || [])];
    for (const item of items) {
      if (item.slot === 'TRADE' || item.name.includes('Katır') || item.category === 'FOOD') continue;
      const res = sellMarketplaceItem(current, item.id, settlementName);
      if (res.success) {
        current = res.nextState;
        totalGained += res.goldGained;
      }
    }
    if (totalGained > 0) {
      sound.playCoinChime();
      setMerchantGold((prev) => Math.max(0, prev - totalGained));
      setFeedback(`💰 Toplam ${totalGained} Dinar değerinde ganimet pazar loncasına satıldı!`);
      onUpdateCampaign(current);
    } else {
      setFeedback('Satılacak yedek ganimet eşyası bulunmuyor.');
    }
  };

  const totalTroops = getTotalTroops(campaign.roster);
  const maxCapacity = totalTroops * 12 + 350;
  const currentWeight = (campaign.inventoryItems || []).reduce((acc, i) => acc + i.weight, 110);
  const isOverweight = currentWeight > maxCapacity;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-none pointer-events-auto select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-modal-title"
    >
      <div className="w-full h-full max-w-7xl max-h-[96vh] rounded-lg border border-[#c6a15b]/40 bg-[#120f0c] shadow-2xl flex flex-col overflow-hidden text-[#f3ead8]">
        {/* HEADER BAR */}
        <div className="px-5 py-3 border-b border-[#c6a15b]/30 bg-[#1a1510] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚖️</span>
            <div>
              <h2 id="market-modal-title" className="text-lg font-display font-bold text-[#fef08a]">
                {settlementName} · Pazaryeri ve Ticaret Loncası
              </h2>
              <div className="text-xs text-[#b5a890] flex items-center gap-3">
                <span>
                  Tüccar Kasası:{' '}
                  <strong className="text-[#fbbf24] font-mono-tabular">{merchantGold} Dinar</strong>
                </span>
                <span>·</span>
                <span>
                  Sancak Hazineniz:{' '}
                  <strong className="text-[#34d399] font-mono-tabular">{campaign.gold} Dinar</strong>
                </span>
                <span>·</span>
                <span>
                  Erzak:{' '}
                  <strong className="text-[#60a5fa] font-mono-tabular">{campaign.food} Gün</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenArenaTest && (
              <button
                type="button"
                onClick={onOpenArenaTest}
                className="px-3 py-1.5 rounded text-xs font-bold bg-[#991b1b] hover:bg-[#b91c1c] text-white border border-[#fca5a5]/40 transition-colors shadow flex items-center gap-1.5"
              >
                <span>⚔️</span>
                <span>Karakter & Savaş Arenası</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs font-bold bg-[#26211a] hover:bg-[#382f25] text-[#e2d6c1] border border-[#c6a15b]/30 transition-colors"
            >
              Kapat [Esc]
            </button>
          </div>
        </div>

        {/* CATEGORY & SEARCH BAR */}
        <div className="px-4 py-2 border-b border-[#c6a15b]/20 bg-[#16120e] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'ALL', label: 'TÜMÜ', icon: '📦' },
                { id: 'WEAPON', label: 'SİLAHLAR', icon: '⚔️' },
                { id: 'SHIELD', label: 'KALKANLAR', icon: '🛡️' },
                { id: 'ARMOR', label: 'ZIRHLAR', icon: '🪖' },
                { id: 'FOOD', label: 'ERZAK & EMTİA', icon: '🌾' },
                { id: 'HORSE', label: 'BİNEKLER', icon: '🐎' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1.5 transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-[#b45309] text-white border border-[#fde68a]/50 shadow'
                    : 'bg-[#221c16] text-[#b5a890] hover:text-white border border-transparent'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Eşya veya özellik ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-2.5 py-1 text-xs rounded bg-[#100d0a] border border-[#c6a15b]/30 text-[#f3ead8] placeholder-[#78716c] focus:outline-none focus:border-[#fbbf24] w-48"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2 py-1 text-xs rounded bg-[#100d0a] border border-[#c6a15b]/30 text-[#e2d6c1] focus:outline-none"
            >
              <option value="tier">Kademeye Göre</option>
              <option value="price_asc">Fiyat (Artan)</option>
              <option value="price_desc">Fiyat (Azalan)</option>
              <option value="weight">Ağırlık (Hafif)</option>
            </select>
          </div>
        </div>

        {/* FEEDBACK NOTICE */}
        {feedback && (
          <div className="px-4 py-1.5 bg-[#2b2114] border-b border-[#f59e0b]/40 text-xs text-[#fde68a] flex items-center justify-between">
            <span>{feedback}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-[#9ca3af] hover:text-white font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* 3-COLUMN WORKSPACE: LEFT MARKET | CENTER 3D PREVIEW | RIGHT INVENTORY */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#c6a15b]/25">
          {/* 1. LEFT COLUMN: TOWN MERCHANT ITEMS (5 cols) */}
          <div className="lg:col-span-5 flex flex-col h-full overflow-hidden bg-[#14100c]">
            <div className="p-3 border-b border-[#c6a15b]/20 flex items-center justify-between bg-[#19140f] shrink-0">
              <span className="text-xs font-bold text-[#c6a15b] tracking-wider uppercase">
                🏛️ Pazaryeri Tezgahı ({filteredMarketItems.length} Eşya)
              </span>
              <span className="text-[11px] text-[#9ca3af]">Sol Tık: Satın Al</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredMarketItems.map((item) => {
                const canAfford = campaign.gold >= item.value;
                return (
                  <div
                    key={item.id}
                    className="p-2.5 rounded bg-[#1c1712] border border-[#c6a15b]/20 hover:border-[#f59e0b]/60 transition-all flex items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-2xl shrink-0 p-1 rounded bg-[#2a2219]">
                        {item.icon}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#f8f0df] truncate">
                            {item.name}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#3b2d1d] text-[#fbbf24]">
                            T{item.tier}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#34d399] truncate font-medium">
                          {item.statBonus}
                        </div>
                        <div className="text-[10px] text-[#a89b84] flex items-center gap-2 mt-0.5">
                          <span>Ağırlık: {item.weight} kg</span>
                          <span>·</span>
                          <span className="italic text-[#d6cbb5] truncate">
                            {item.description}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs font-bold font-mono-tabular text-[#fbbf24]">
                        {item.value} D
                      </span>
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => handleBuy(item)}
                        className={`px-3 py-1 rounded text-[11px] font-bold transition-colors ${
                          canAfford
                            ? 'bg-[#15803d] hover:bg-[#16a34a] text-white shadow'
                            : 'bg-[#27211b] text-[#6b7280] cursor-not-allowed'
                        }`}
                      >
                        {canAfford ? 'Satın Al' : 'Yetersiz'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. CENTER COLUMN: 3D CHARACTER MANNEQUIN & STATS (3 cols) */}
          <div className="lg:col-span-3 flex flex-col h-full overflow-hidden bg-[#100d0a]">
            <div className="p-2.5 border-b border-[#c6a15b]/20 text-center bg-[#17130e] shrink-0">
              <span className="text-xs font-bold text-[#fef08a] block">
                {campaign.playerName}
              </span>
              <span className="text-[10px] text-[#b5a890]">
                3B Canlı Karakter Manken Önizlemesi (Fareyle Döndür)
              </span>
            </div>

            {/* 3D Model Viewport */}
            <div
              ref={canvasMountRef}
              className="flex-1 w-full relative cursor-grab active:cursor-grabbing overflow-hidden min-h-[220px]"
            />

            {/* Armor & Encumbrance Stats Dock */}
            <div className="p-3 border-t border-[#c6a15b]/20 bg-[#16120e] space-y-2.5 shrink-0 text-xs">
              {/* Encumbrance Bar */}
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-[#c6a15b] font-semibold">Taşıma Ağırlığı:</span>
                  <span
                    className={`font-mono-tabular font-bold ${
                      isOverweight ? 'text-[#ef4444]' : 'text-[#34d399]'
                    }`}
                  >
                    {Math.round(currentWeight)} / {maxCapacity} kg
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#26211a] overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      isOverweight ? 'bg-[#dc2626]' : 'bg-[#d97706]'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.round((currentWeight / maxCapacity) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Character Armor Breakdown */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-1.5 rounded bg-[#1f1913] border border-[#c6a15b]/15">
                  <span className="text-[#a89b84] block">🪖 Baş Zırhı</span>
                  <span className="text-[#f8f0df] font-bold">+48 Zırh</span>
                </div>
                <div className="p-1.5 rounded bg-[#1f1913] border border-[#c6a15b]/15">
                  <span className="text-[#a89b84] block">🥋 Gövde Zırhı</span>
                  <span className="text-[#f8f0df] font-bold">+64 Zırh</span>
                </div>
                <div className="p-1.5 rounded bg-[#1f1913] border border-[#c6a15b]/15">
                  <span className="text-[#a89b84] block">🧤 Kol Zırhı</span>
                  <span className="text-[#f8f0df] font-bold">+24 Zırh</span>
                </div>
                <div className="p-1.5 rounded bg-[#1f1913] border border-[#c6a15b]/15">
                  <span className="text-[#a89b84] block">👢 Bacak Zırhı</span>
                  <span className="text-[#f8f0df] font-bold">+32 Zırh</span>
                </div>
              </div>

              {/* Quick Actions */}
              <button
                type="button"
                onClick={handleSellAllLoot}
                className="w-full py-1.5 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white transition-colors shadow"
              >
                💰 Tüm Fazla Ganimeti Sat
              </button>
            </div>
          </div>

          {/* 3. RIGHT COLUMN: PLAYER INVENTORY & 12 EQUIPMENT SLOTS (4 cols) */}
          <div className="lg:col-span-4 flex flex-col h-full overflow-hidden bg-[#14100c]">
            <div className="p-3 border-b border-[#c6a15b]/20 flex items-center justify-between bg-[#19140f] shrink-0">
              <span className="text-xs font-bold text-[#fef08a] tracking-wider uppercase">
                🎒 Donanım & Sırt Çantası ({filteredPlayerItems.length} Eşya)
              </span>
              <span className="text-[11px] text-[#fbbf24] font-mono-tabular font-bold">
                {campaign.gold} Dinar
              </span>
            </div>

            {/* 12 Equipped Slots Header Ribbon */}
            <div className="p-2 border-b border-[#c6a15b]/15 bg-[#17130e] max-h-36 overflow-y-auto">
              <div className="text-[10px] text-[#c6a15b] font-bold mb-1">
                Kuşanılmış Teçhizat Slotları:
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                {(
                  [
                    { slot: 'HEAD', label: '🪖 Başlık' },
                    { slot: 'BODY', label: '🥋 Gövde' },
                    { slot: 'WEAPON1', label: '🗡️ Silah I' },
                    { slot: 'WEAPON2', label: '🛡️ Kalkan / II' },
                    { slot: 'WEAPON3', label: '🔱 Silah III' },
                    { slot: 'WEAPON4', label: '🏹 Silah IV' },
                    { slot: 'MOUNT', label: '🐎 Binek' },
                    { slot: 'LEG', label: '👢 Çizme' },
                  ] as const
                ).map((slotInfo) => {
                  const eqName = campaign.equipment?.[slotInfo.slot] || 'Standart';
                  const isEquipped = !eqName.includes('Boş') && !eqName.includes('Yok');
                  return (
                    <div
                      key={slotInfo.slot}
                      className="p-1.5 rounded bg-[#1f1913] border border-[#c6a15b]/20 flex items-center justify-between gap-1"
                    >
                      <div className="min-w-0">
                        <span className="text-[#a89b84] block truncate">{slotInfo.label}</span>
                        <span className="text-[#f8f0df] font-semibold truncate block">
                          {eqName.split(' (')[0]}
                        </span>
                      </div>
                      {isEquipped && (
                        <button
                          type="button"
                          onClick={() => handleUnequip(slotInfo.slot)}
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#372f26] hover:bg-[#4a3f33] text-[#e2d6c1] shrink-0"
                          title="Slotu Çıkar"
                        >
                          Çıkar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Backpack Inventory Items */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredPlayerItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#a89b84]">
                  Bu kategoride envanterinizde eşya bulunmuyor. Sol taraftaki pazaryerinden kılıç,
                  zırh veya erzak satın alabilirsiniz.
                </div>
              ) : (
                filteredPlayerItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-2 rounded bg-[#1c1712] border border-[#c6a15b]/20 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#f8f0df] truncate">
                        {item.name}
                      </div>
                      <div className="text-[10px] text-[#34d399] truncate font-medium">
                        {item.statBonus}
                      </div>
                      <div className="text-[10px] text-[#a89b84] flex items-center gap-2">
                        <span>Ağırlık: {item.weight} kg</span>
                        <span>·</span>
                        <span className="text-[#fbbf24] font-mono">Değer: {item.value} D</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.slot !== 'TRADE' && (
                        <button
                          type="button"
                          onClick={() => handleEquip(item.id)}
                          className="px-2 py-1 rounded text-[10px] font-bold bg-[#b45309] hover:bg-[#d97706] text-white transition-colors"
                        >
                          Kuşan
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSell(item.id)}
                        className="px-2 py-1 rounded text-[10px] font-bold bg-[#991b1b] hover:bg-[#b91c1c] text-white transition-colors"
                      >
                        Sat (+{item.value} D)
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
