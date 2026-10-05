import type { L } from '../i18n/i18n';

export type Vec2 = [number, number];

export type Step =
  | { type: 'reach'; pos: Vec2; radius: number; label: L }
  | { type: 'kill'; count: number; center?: Vec2; radius?: number; label: L }
  | { type: 'collect'; points: Vec2[]; item: L; label: L }
  | { type: 'drive'; label: L }
  | { type: 'reachVehicle'; pos: Vec2; radius: number; label: L }
  | { type: 'rescue'; points: Vec2[]; label: L }
  | { type: 'survive'; pos: Vec2; radius: number; seconds: number; label: L }
  | { type: 'boss'; pos: Vec2; label: L };

export interface Mission {
  id: string;
  title: L;
  radio: L[];          // dispatcher transmissions when the mission starts
  steps: Step[];
  reward: { weapons?: string[]; medkits?: number; grenades?: number; armor?: number; text: L };
  checkpoint: Vec2;    // respawn point
}

export const STORY = {
  title: { en: 'OUTBREAK: NYC', zh: '紐約淪陷：爆發' },
  intro: [
    { en: 'September 2026. A "flu" that started in a Queens shipping depot jumped the river in 72 hours.', zh: '2026 年 9 月。一種從皇后區貨運倉庫開始的「流感」,72 小時內跨過了東河。' },
    { en: 'Tonight, Manhattan stopped answering 911 calls.', zh: '今晚，曼哈頓的 911 再也沒人接聽。' },
    { en: 'You are Detective Jamie Reyes, NYPD — off-duty, unarmed, and one of the last people still breathing in Midtown.', zh: '你是紐約警局警探傑米·雷耶斯——下班中、手無寸鐵，是中城區少數還活著的人之一。' },
    { en: 'The National Guard is pulling out at dawn. Get to the Central Park helipad.', zh: '國民警衛隊黎明就要撤離。前往中央公園的直升機停機坪。' },
  ] as L[],
};

const R = (en: string, zh: string): L => ({ en, zh });

export const MISSIONS: Mission[] = [
  {
    id: 'm1', checkpoint: [-68, 108],
    title: R('Wake-Up Call', '驚醒'),
    radio: [
      R('Dispatch to any unit… Reyes? Thank God. The 14th Precinct armory is still sealed.', '總部呼叫任何單位……雷耶斯?謝天謝地。第 14 分局的軍械庫還封著。'),
      R('Get there and gear up. You will not survive this city with a baseball bat.', '去那裡補給裝備。只靠一根球棒，你在這城市活不下去的。'),
    ],
    steps: [{ type: 'reach', pos: [-51, 69], radius: 6, label: R('Reach the 14th Precinct armory', '前往第 14 分局軍械庫') }],
    reward: { weapons: ['shotgun'], armor: 50, grenades: 2, text: R('Pump Shotgun, armor vest, 2 grenades', '泵動式霰彈槍、防彈背心、2 顆手榴彈') },
  },
  {
    id: 'm2', checkpoint: [-51, 68],
    title: R('Crossroads of the Dead', '死者的十字路口'),
    radio: [
      R('Times Square is overrun. A Guard convoy is pinned down there.', '時代廣場淪陷了。一支警衛隊車隊被困在那裡。'),
      R('Thin the herd so they can break out. Watch your ammo.', '幫他們清出一條路。注意你的彈藥。'),
    ],
    steps: [
      { type: 'reach', pos: [0, 17], radius: 14, label: R('Get to Times Square', '前往時代廣場') },
      { type: 'kill', count: 30, center: [0, 17], radius: 40, label: R('Kill zombies in Times Square', '清除時代廣場的殭屍') },
    ],
    reward: { weapons: ['m4'], grenades: 3, text: R('M4 Carbine, 3 grenades', 'M4 卡賓槍、3 顆手榴彈') },
  },
  {
    id: 'm3', checkpoint: [0, 30],
    title: R('Patient Zero Samples', '零號病人樣本'),
    radio: [
      R('Reyes, this is Dr. Okafor at the CDC field lab. Midtown Clinic had the first patients.', '雷耶斯，我是疾管局野戰實驗室的歐卡佛博士。中城診所收治了第一批病患。'),
      R('Their blood samples could be the key to a vaccine. Three cases — find them.', '他們的血液樣本可能是疫苗的關鍵。一共三箱——找到它們。'),
    ],
    steps: [
      { type: 'reach', pos: [51, -2], radius: 8, label: R('Reach Midtown Clinic', '前往中城診所') },
      { type: 'collect', points: [[38, -30], [64, -34], [70, -4]], item: R('Sample case', '樣本箱'), label: R('Collect the sample cases', '蒐集樣本箱') },
    ],
    reward: { weapons: ['magnum'], medkits: 2, text: R('.44 Magnum, 2 medkits', '.44 麥格農左輪、2 個急救包') },
  },
  {
    id: 'm4', checkpoint: [51, -2],
    title: R('Special Delivery', '特急件'),
    radio: [
      R('Those samples will not survive a walk across town. Find a car — any car.', '那些樣本撐不了走路橫越市區。找台車——什麼車都行。'),
      R('Drive them to the field lab at Bryant Park. Run over whatever gets in your way.', '把它們送到布萊恩公園的野戰實驗室。擋路的就直接輾過去。'),
    ],
    steps: [
      { type: 'drive', label: R('Get in a vehicle', '找一台載具坐上去') },
      { type: 'reachVehicle', pos: [-51, -17], radius: 10, label: R('Drive to the Bryant Park field lab', '開車前往布萊恩公園野戰實驗室') },
    ],
    reward: { weapons: ['rpg'], text: R('RPG-7 rocket launcher', 'RPG-7 火箭筒') },
  },
  {
    id: 'm5', checkpoint: [-51, -2],
    title: R('No One Left Behind', '一個都不能少'),
    radio: [
      R('We are picking up distress signals — three survivors trapped on the East Side.', '我們收到求救訊號——東城區有三名倖存者受困。'),
      R('The chopper has room. Get to them and fire a flare so the Guard can extract them.', '直升機還有空位。找到他們並發射信號彈，讓警衛隊把他們接走。'),
    ],
    steps: [{ type: 'rescue', points: [[85, 67], [102, -58], [34, -64]], label: R('Rescue the survivors (hold F)', '救援倖存者(按住 F)') }],
    reward: { weapons: ['minigun'], medkits: 1, text: R('M134 Minigun, 1 medkit', 'M134 迷你砲、1 個急救包') },
  },
  {
    id: 'm6', checkpoint: [17, -38],
    title: R('Hold the Line', '死守防線'),
    radio: [
      R('The Guard needs the Empire relay antenna online to coordinate the evac.', '警衛隊需要帝國中繼天線上線，才能協調撤離。'),
      R('Defend it while the uplink boots. It is going to get loud — every zombie in Midtown will hear it.', '在上傳連線啟動前守住它。會非常吵——整個中城的殭屍都會聽到。'),
    ],
    steps: [
      { type: 'reach', pos: [17, -51], radius: 8, label: R('Reach the Empire relay antenna', '前往帝國中繼天線') },
      { type: 'survive', pos: [17, -51], radius: 18, seconds: 75, label: R('Defend the antenna', '守住天線') },
    ],
    reward: { weapons: ['railgun'], grenades: 4, armor: 100, text: R('XR-9 Railgun prototype, full armor, 4 grenades', 'XR-9 磁軌砲原型、滿護甲、4 顆手榴彈') },
  },
  {
    id: 'm7', checkpoint: [0, -92],
    title: R('Last Flight Out', '最後一班飛機'),
    radio: [
      R('Reyes… something big is sitting on the helipad. Thermal says it used to be a lot of people.', '雷耶斯……有個巨大的東西佔據了停機坪。熱成像顯示，它原本是很多人。'),
      R('Kill it. Then get on that chopper. This is the last flight out of New York.', '幹掉它，然後登上直升機。這是離開紐約的最後一班飛機。'),
    ],
    steps: [
      { type: 'boss', pos: [0, -118], label: R('Destroy the Abomination', '消滅巨型憎惡體') },
      { type: 'reach', pos: [0, -140], radius: 6, label: R('Board the helicopter', '登上直升機') },
    ],
    reward: { text: R('Evacuation', '撤離') },
  },
];

/** Weapon crates scattered around Manhattan (the rest come from missions) */
export const WEAPON_CRATES: { id: string; pos: Vec2 }[] = [
  { id: 'uzi', pos: [-102, 40] }, { id: 'mp5', pos: [102, 92] }, { id: 'aa12', pos: [102, -92] },
  { id: 'ak47', pos: [-102, -62] }, { id: 'sniper', pos: [68, -96] }, { id: 'flamer', pos: [-22, -68] },
  { id: 'm79', pos: [30, 102] }, { id: 'javelin', pos: [-102, -8] }, { id: 'mortar', pos: [102, 30] },
  { id: 'cannon', pos: [-34, 124] },
];

export const LANDMARKS: { pos: Vec2; name: L }[] = [
  { pos: [-51, 85], name: R('14th Precinct', '第 14 分局') },
  { pos: [0, 17], name: R('Times Square', '時代廣場') },
  { pos: [51, -17], name: R('Midtown Clinic', '中城診所') },
  { pos: [-51, -17], name: R('Bryant Park Lab', '布萊恩公園實驗室') },
  { pos: [17, -51], name: R('Empire Relay', '帝國中繼站') },
  { pos: [0, -128], name: R('Central Park', '中央公園') },
];
