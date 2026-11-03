// ============================================================
//  玩法数值总表 —— 所有影响 gameplay 的数值都在这里改。
//  改完保存即可，开发服务器会自动刷新页面读取新值。
//  填错（负数、表为空、门槛不递增、引用不存在的菜等）时，
//  页面会弹出红字指出是哪一项，游戏不会启动。
//
//  单位约定：…Ms = 毫秒；倍率 1 = 不变，0.9 = 打九折 / 快 10%；
//  比例 0.5 = 50%。颜色、动画、坐标等纯表现数值不在这里。
// ============================================================

export const GAME = {
  /** 新档开局 */
  start: {
    /** 开局灵石 */
    coins: 20,
    /** 开局灵材 */
    ingredients: 8,
  },

  /** 营业中的节奏 */
  session: {
    /** 排队耐心（毫秒），再乘食客类型的耐心系数 */
    queuePatienceMs: 8000,
    /** 第 1 天排队耐心倍率（教学缓冲） */
    firstDayPatienceMultiplier: 2.2,
    /** 第 1 天少来几位客人（教学缓冲） */
    firstDayFewerPatrons: 1,
    /** 用膳时长（毫秒），吃完离店结算 */
    diningMs: 4500,
    /** 入座后留给玩家亲手出菜的优先窗口（毫秒），之后伙计才接手 */
    cookPriorityMs: 1500,
    /** 到店间隔随机下限（毫秒） */
    arrivalMinMs: 4000,
    /** 到店间隔随机上限（毫秒） */
    arrivalMaxMs: 7000,
    /** 酒楼每升一级，到店间隔缩短（毫秒） */
    arrivalShrinkPerLevelMs: 150,
    /** 到店间隔最短（毫秒） */
    arrivalFloorMs: 1500,
  },

  /** 招待 / 烹饪耗时（玩家基准，伙计再乘伙计倍率） */
  timing: {
    /** 招待入座基础耗时（毫秒） */
    seatBaseMs: 1900,
    /** 酒楼每升一级，入座耗时缩短（毫秒） */
    seatShrinkPerLevelMs: 190,
    /** 入座耗时最短（毫秒） */
    seatFloorMs: 480,
    /** 酒楼每升一级，烹饪耗时缩短（毫秒）；基础耗时见各菜品 */
    cookShrinkPerLevelMs: 200,
    /** 烹饪耗时最短（毫秒） */
    cookFloorMs: 500,
  },

  /** 玩家连续命中口味的连击 */
  combo: {
    /** 每连一次售价加成（0.05 = +5%） */
    step: 0.05,
    /** 最多连几次 */
    max: 5,
  },

  /**
   * 菜品。price 售价（灵石），cookMs 基础烹饪耗时（毫秒），unlockLevel 酒楼几级解锁。
   * 设计原则：售价越高，每秒收益越低（高价菜靠口味/稀客回本）。
   */
  dishes: [
    { id: "stirfry", name: "清炒灵蔬", price: 6, cookMs: 1500, unlockLevel: 1 },
    { id: "porridge", name: "灵米粥", price: 9, cookMs: 2500, unlockLevel: 2 },
    { id: "jelly", name: "玉露羹", price: 14, cookMs: 4000, unlockLevel: 3 },
    { id: "fish", name: "龙涎鱼脍", price: 22, cookMs: 6500, unlockLevel: 4 },
    { id: "ginseng", name: "九转灵参", price: 32, cookMs: 10000, unlockLevel: 6 },
    { id: "phoenix", name: "凤凰涅槃羹", price: 46, cookMs: 15000, unlockLevel: 8 },
    { id: "voidfruit", name: "太虚道果", price: 65, cookMs: 22000, unlockLevel: 10 },
  ],

  /** 口味与招牌 */
  pricing: {
    /** 端上想吃的菜，售价加成（0.5 = +50%） */
    wishBonus: 0.5,
    /** 有想吃的却上错，只付这个比例（0.5 = 半价） */
    wishMissMultiplier: 0.5,
    /** 今日招牌售价加成（0.25 = +25%） */
    dailySpecialBonus: 0.25,
  },

  /**
   * 食客类型。patienceFactor 耐心倍率，priceFactor 客单价倍率，weight 抽取权重，
   * favorites 偏爱的菜（填 dishes 里的 id），names 姓名池。颜色仅影响外观。
   */
  patronKinds: [
    { id: "rogue", name: "散修", bodyColor: 0x7a8a6a, hairColor: 0x2b2b2b, patienceFactor: 1, favorites: ["stirfry", "ginseng"], weight: 8, priceFactor: 1, names: ["沈青崖", "陆行舟", "顾长风", "唐不器"] },
    { id: "sword", name: "剑修", bodyColor: 0x5a7a9a, hairColor: 0x1b1b2b, patienceFactor: 0.8, favorites: ["fish", "jelly", "voidfruit"], weight: 8, priceFactor: 1.1, names: ["白无锋", "叶惊鸿", "江雪照", "谢孤云"] },
    { id: "alchemist", name: "丹修", bodyColor: 0x8a6a9a, hairColor: 0x3b2b3b, patienceFactor: 1.1, favorites: ["porridge", "jelly", "ginseng"], weight: 8, priceFactor: 1.05, names: ["苏问丹", "柳含烟", "程九炉", "温岐黄"] },
    { id: "demon", name: "妖修", bodyColor: 0x9a5a3a, hairColor: 0x4a2b1b, patienceFactor: 1.2, favorites: ["fish", "stirfry", "phoenix"], weight: 8, priceFactor: 1.2, names: ["阿椒", "青尾", "胡三娘", "花间狸"] },
    { id: "mortal", name: "凡人", bodyColor: 0xb0a090, hairColor: 0x3b3b3b, patienceFactor: 1.3, favorites: [] as string[], weight: 8, priceFactor: 0.9, names: ["王二", "李婶", "陈货郎", "赵小满"] },
    { id: "elder", name: "仙门长老", bodyColor: 0xe8e0c8, hairColor: 0xdfe6ff, patienceFactor: 1.5, favorites: ["ginseng", "phoenix", "voidfruit"], weight: 1, priceFactor: 2.5, names: ["玄阳真人", "清虚长老", "素心仙子", "太微道人"] },
    { id: "demonlord", name: "魔道散人", bodyColor: 0x6a2a3a, hairColor: 0x1a1a1a, patienceFactor: 0.7, favorites: ["fish", "phoenix"], weight: 1, priceFactor: 1.8, names: ["殷无咎", "屠千山", "夜罗刹", "鬼母"] },
  ],
  /** 客单价倍率 ≥ 这个值的食客算「稀客」（★、特殊音效、声望更多、受灵雾/声望放大权重） */
  rarePriceFactor: 1.8,

  /** 常客 */
  regulars: {
    /** 最多记住几位常客 */
    max: 6,
    /** 每位新到客人是常客回访的概率（0.3 = 30%） */
    returnChance: 0.3,
  },

  /** 声望 */
  reputation: {
    /** 服务完一位普通客人 + */
    gainServed: 10,
    /** 服务完一位稀客 + */
    gainRare: 25,
    /** 流失一位客人 −（一批流失最多掉一级） */
    lossPerPatron: 20,
    /** 称号等级：threshold 累计声望门槛（必须递增，首项为 0），patrons 当天来客数 */
    levels: [
      { title: "无名小馆", threshold: 0, patrons: 5 },
      { title: "初露锋芒", threshold: 60, patrons: 6 },
      { title: "小有名气", threshold: 180, patrons: 7 },
      { title: "声名鹊起", threshold: 400, patrons: 9 },
      { title: "名动一方", threshold: 750, patrons: 10 },
      { title: "声名远扬", threshold: 1250, patrons: 12 },
      { title: "名震天下", threshold: 1900, patrons: 13 },
      { title: "名动九霄", threshold: 2700, patrons: 15 },
      { title: "仙凡共仰", threshold: 3700, patrons: 16 },
    ],
  },

  /** 酒楼扩建（雅座）与楼层 */
  tavern: {
    /** 扩建费用 = baseCost × costMultiplier^(等级−1) */
    upgradeBaseCost: 30,
    upgradeCostMultiplier: 1.75,
    /** 一楼基础雅座数 */
    groundFloorBaseBooths: 3,
    /** 每层雅座上限 */
    boothsPerFloorCap: 4,
    /** 楼层建造：level 需要酒楼等级，cost 灵石 */
    floorUnlocks: [
      { floor: 1, level: 3, cost: 120, name: "二楼 · 雅座" },
      { floor: 2, level: 6, cost: 450, name: "三楼 · 仙门包间" },
    ],
    /** 各楼层（1F/2F/3F）售价倍率 */
    floorPriceMultipliers: [1, 1.15, 1.25],
    /** 各楼层（1F/2F/3F）耐心倍率 */
    floorPatienceMultipliers: [1, 1.1, 1.1],
    /** 每建一层，日租 + */
    rentPerFloor: 6,
    /** 酒楼等级超过这一级后，每级全局售价 +postCapPriceStep */
    postCapPriceStartLevel: 8,
    postCapPriceStep: 0.01,
    /** 日租 = rentBase + rentPerLevel × 酒楼等级 */
    rentBase: 8,
    rentPerLevel: 4,
  },

  /** 灶台专精 */
  stove: {
    /** 费用 = baseCost × costMultiplier^专精等级 */
    baseCost: 34,
    costMultiplier: 1.75,
    /** 每级烹饪耗时乘以这个值（0.9 = 快 10%） */
    speedupPerLevel: 0.9,
    /** 最多快到基础耗时的这个比例 */
    speedFloor: 0.5,
  },

  /** 门面招幡（招客效果待重做，目前只是装饰） */
  sign: {
    baseCost: 26,
    costMultiplier: 1.7,
  },

  /** 采购灵材 */
  purchase: {
    /** 一次采购的单价（灵石，未打折） */
    cost: 5,
    /** 一次采购得多少灵材 */
    amount: 5,
    /** 营业中紧急采购耗时（毫秒） */
    emergencyTimeMs: 15000,
    /** 酒楼每升一级，紧急采购耗时缩短（毫秒） */
    emergencyShrinkPerLevelMs: 300,
    /** 紧急采购耗时最短（毫秒） */
    emergencyFloorMs: 3000,
    /** 实际等待 = 上面三项算出的耗时 × 这个倍率（默认约 9 秒） */
    emergencyDurationScale: 0.6,
    /** 紧急采购价格倍率 */
    emergencyPriceMultiplier: 2,
  },

  /** 伙计（固定岗位制，员工系统改造时会替换） */
  staff: {
    /** 雇佣费用（灵石） */
    hireCost: { hawker: 30, server: 40, cook: 50, buyer: 35 },
    /** 1 级伙计耗时 = 玩家耗时 × 这个倍率 */
    speedPenalty: 1.6,
    /** 每升一级耗时乘以这个值 */
    levelSpeedup: { hawker: 0.82, server: 0.85, cook: 0.84 },
    /** 每几点熟练度升一级（每天 +1 熟练度） */
    expPerLevel: 3,
    /** 伙计最高等级 */
    maxLevel: 4,
    /** 1 级日薪 */
    baseWage: { hawker: 5, server: 8, cook: 10, buyer: 6 },
    /** 每升一级日薪乘以这个值 */
    wageGrowthPerLevel: 1.3,
    /** 采买每级采购折扣（0.08 = 8%） */
    buyerDiscountPerLevel: 0.08,
    /** 采购折扣上限 */
    buyerDiscountCap: 0.5,
    /** 采买自动补货目标 = base + perLevel × 酒楼等级 */
    buyerTargetStockBase: 10,
    buyerTargetStockPerLevel: 2,
  },

  /** 每日目标 */
  dailyGoal: {
    /** 收入目标 = revenueBase + revenuePerLevel × 等级 */
    revenueBase: 30,
    revenuePerLevel: 8,
    /** 口味目标 = wishBase + ⌊等级 / wishLevelsPerStep⌋ */
    wishBase: 1,
    wishLevelsPerStep: 2,
    /** 基础赏金 = rewardCoinsBase + rewardCoinsPerLevel × 等级 */
    rewardCoinsBase: 8,
    rewardCoinsPerLevel: 3,
    /** 收入目标额外多给的赏金 */
    revenueGoalExtraCoins: 4,
    /** 基础修为 = rewardCultivationBase + ⌊等级 / rewardCultivationLevelsPerStep⌋ */
    rewardCultivationBase: 1,
    rewardCultivationLevelsPerStep: 3,
    /** 口味目标额外多给的修为 */
    wishGoalExtraCultivation: 1,
    /** 赏金另加当日菜品收入的这个比例 */
    revenueBonusRatio: 0.15,
    /** 达到目标的这个比例给半赏 */
    partialThreshold: 0.6,
    /** 半赏比例 */
    partialRewardRatio: 0.5,
    /** 三日之约：连续几天达成 */
    streakDays: 3,
    /** 三日之约赏金 = streakCoinsBase + streakCoinsPerLevel × 等级 */
    streakCoinsBase: 20,
    streakCoinsPerLevel: 5,
    /** 三日之约修为 = streakCultivationBase + ⌊等级 / streakCultivationLevelsPerStep⌋ */
    streakCultivationBase: 2,
    streakCultivationLevelsPerStep: 4,
  },

  /** 灯会 */
  festival: {
    /** 每几天一次 */
    interval: 7,
    /** 当天多来几位客人 */
    extraPatrons: 3,
    /** 目标赏金倍率 */
    goalCoinMultiplier: 1.5,
    /** 目标修为额外 + */
    goalExtraCultivation: 1,
  },

  /**
   * 天时（每天按本机日期轮换一条）。
   * arrivalFactor <1 客多 >1 客少；priceFactor 售价倍率；wishBonus 口味命中额外加价；
   * purchaseFactor 采购价倍率；rareWeightFactor 稀客权重倍率；cultivationBonus 亲自下厨额外修为。
   * visual 天气粒子：0 晴 1 灵雾 2 落英 3 夜雨。
   */
  omens: [
    { id: "clear", name: "晴", short: "客流 +12%", desc: "风和日丽，来往食客多了些", visual: 0, arrivalFactor: 0.88, priceFactor: 1, wishBonus: 0, purchaseFactor: 1, rareWeightFactor: 1, cultivationBonus: 0 },
    { id: "mist", name: "灵雾", short: "稀客 ×3", desc: "仙雾缭绕，仙门中人更愿登门", visual: 1, arrivalFactor: 1, priceFactor: 1, wishBonus: 0, purchaseFactor: 1, rareWeightFactor: 3, cultivationBonus: 0 },
    { id: "petals", name: "落英", short: "口味赏 +20%", desc: "落英缤纷，懂吃的人更舍得掏钱", visual: 2, arrivalFactor: 1, priceFactor: 1, wishBonus: 0.2, purchaseFactor: 1, rareWeightFactor: 1, cultivationBonus: 0 },
    { id: "market", name: "集市", short: "灵材 6 折", desc: "山下开市，灵材便宜了四成", visual: 0, arrivalFactor: 1, priceFactor: 1, wishBonus: 0, purchaseFactor: 0.6, rareWeightFactor: 1, cultivationBonus: 0 },
    { id: "rain", name: "夜雨", short: "客少价高", desc: "雨夜客稀，来的都是肯花灵石的人", visual: 3, arrivalFactor: 1.12, priceFactor: 1.15, wishBonus: 0, purchaseFactor: 1, rareWeightFactor: 1, cultivationBonus: 0 },
    { id: "moon", name: "月满", short: "下厨多悟", desc: "月华入灶，亲自下厨多悟一分", visual: 0, arrivalFactor: 1, priceFactor: 1, wishBonus: 0, purchaseFactor: 1, rareWeightFactor: 1, cultivationBonus: 1 },
  ] as { id: string; name: string; short: string; desc: string; visual: 0 | 1 | 2 | 3; arrivalFactor: number; priceFactor: number; wishBonus: number; purchaseFactor: number; rareWeightFactor: number; cultivationBonus: number }[],

  /** 开市利是（本机每天第一次开店） */
  dailyGift: {
    /** 连续天数最多算到几天 */
    streakCap: 7,
    /** 灵石 = coinsBase + coinsPerStreakDay × 连续天数 + coinsPerLevel × 等级 */
    coinsBase: 15,
    coinsPerStreakDay: 5,
    coinsPerLevel: 2,
    /** 修为 = 1 + ⌊连续天数 / cultivationStreakStep⌋ */
    cultivationStreakStep: 3,
    /** 连续满几天起送灵材 */
    ingredientsFromStreak: 3,
    /** 送多少灵材 */
    ingredients: 2,
  },

  /** 修为 */
  cultivation: {
    /** 亲自下厨每道菜 + */
    perPersonalDish: 2,
    /** 亲自下厨且命中口味额外 + */
    wishHitBonus: 1,
    /** 亲自下厨给稀客额外 + */
    rareBonus: 1,
  },

  /**
   * 境界。cultivation 突破门槛（递增，首项为 0），perk 说明文字。
   * 下面每项都写「到这一重时生效的值」，后面的境界覆盖前面的（不叠加）：
   * priceMultiplier 售价倍率，playerSpeed 玩家耗时倍率，staffSpeed 伙计耗时倍率，
   * closingIngredients 打烊时凭空得灵材。
   */
  realms: [
    { name: "炼气", cultivation: 0, perk: "初入仙途", priceMultiplier: 1, playerSpeed: 1, staffSpeed: 1, closingIngredients: 0 },
    { name: "筑基", cultivation: 30, perk: "菜品售价 +10%", priceMultiplier: 1.1, playerSpeed: 1, staffSpeed: 1, closingIngredients: 0 },
    { name: "金丹", cultivation: 80, perk: "玩家操作速度 +10%", priceMultiplier: 1.1, playerSpeed: 0.9, staffSpeed: 1, closingIngredients: 0 },
    { name: "元婴", cultivation: 160, perk: "心境空明（加成待重做）", priceMultiplier: 1.1, playerSpeed: 0.9, staffSpeed: 1, closingIngredients: 0 },
    { name: "化神", cultivation: 280, perk: "打烊时自动领悟 3 灵材", priceMultiplier: 1.1, playerSpeed: 0.9, staffSpeed: 1, closingIngredients: 3 },
    { name: "炼虚", cultivation: 450, perk: "伙计操作速度 +10%", priceMultiplier: 1.1, playerSpeed: 0.9, staffSpeed: 0.9, closingIngredients: 3 },
    { name: "合体", cultivation: 700, perk: "菜品售价 +20%", priceMultiplier: 1.2, playerSpeed: 0.9, staffSpeed: 0.9, closingIngredients: 3 },
    { name: "大乘", cultivation: 1000, perk: "菜品售价 +30%", priceMultiplier: 1.3, playerSpeed: 0.9, staffSpeed: 0.9, closingIngredients: 3 },
  ],

  /** 飞升（每次飞升得 1 重仙缘） */
  ascension: {
    /** 每重仙缘售价 + */
    priceBonus: 0.1,
    /** 每重仙缘开局灵石 + */
    startCoinBonus: 20,
    /** 每重仙缘开局灵材 + */
    startIngredientBonus: 2,
    /** 每几重仙缘，开局酒楼等级 +1 */
    levelEvery: 3,
  },

  /** 灵石商行 */
  bank: {
    /** 借款：principal 到手，totalRepay 总共要还，unlockLevel 酒楼等级，minDay 第几天起开放 */
    loans: [
      { id: "small", name: "小借", principal: 200, totalRepay: 240, unlockLevel: 1, minDay: 3 },
      { id: "medium", name: "中借", principal: 500, totalRepay: 650, unlockLevel: 3, minDay: 1 },
      { id: "large", name: "大借", principal: 1200, totalRepay: 1680, unlockLevel: 5, minDay: 1 },
    ],
    /** 分几期还 */
    periods: 12,
    /** 连续几天余额为负即破产 */
    bankruptStreak: 5,
  },

  /** 随机事件 */
  events: {
    /** 每多少位客人可触发一次 */
    patronsPerEvent: 5,
    /** 每天最多几次 */
    maxPerSession: 4,
    /** coins/ingredients/cultivation 可为负；weight 抽取权重 */
    pool: [
      { id: "rain", text: "灵雨润田，后厨凭空多出一筐灵材", kind: "good", coins: 0, ingredients: 3, cultivation: 0, weight: 2 },
      { id: "immortal", text: "一位过路仙长尝了口小菜，留下几块灵石", kind: "good", coins: 6, ingredients: 0, cultivation: 0, weight: 2 },
      { id: "guidance", text: "仙人指路，你在灶火间窥见一丝道韵", kind: "good", coins: 0, ingredients: 0, cultivation: 3, weight: 2 },
      { id: "tip", text: "食客吃得尽兴，多留了一份赏钱", kind: "good", coins: 5, ingredients: 0, cultivation: 0, weight: 2 },
      { id: "oldfriend", text: "旧友来访，叙旧之余留下一壶灵酒", kind: "good", coins: 3, ingredients: 0, cultivation: 2, weight: 1 },
      { id: "crane", text: "仙鹤衔芝落在檐角，赠你一味灵材与一段感悟", kind: "good", coins: 0, ingredients: 4, cultivation: 6, weight: 1 },
      { id: "beggar", text: "小妖讨食，你舍了一味灵材，换得它口中一段修行心得", kind: "mixed", coins: 0, ingredients: -1, cultivation: 4, weight: 2 },
      { id: "wind", text: "妖风过境，吹散了后厨晾着的一味灵材", kind: "bad", coins: 0, ingredients: -2, cultivation: 0, weight: 1 },
      { id: "thief", text: "蟊贼光顾，柜上少了几块灵石", kind: "bad", coins: -4, ingredients: 0, cultivation: 0, weight: 1 },
      { id: "mishap", text: "灶台走了水，赔了些灵石与灵材", kind: "bad", coins: -3, ingredients: -1, cultivation: 0, weight: 1 },
    ] as { id: string; text: string; kind: "good" | "bad" | "mixed"; coins: number; ingredients: number; cultivation: number; weight: number }[],
  },
};

export type GameConfig = typeof GAME;

/** 校验配置；返回出错项的中文说明，空数组表示没问题。 */
export function validateConfig(cfg: GameConfig): string[] {
  const errors: string[] = [];
  // 只有随机事件的收益可以为负，其余数值一律不能为负
  const walk = (value: unknown, path: string) => {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) errors.push(`${path} 不是有效数字`);
      else if (value < 0 && !path.startsWith("events.pool")) errors.push(`${path} 不能为负数（现在是 ${value}）`);
    } else if (Array.isArray(value)) {
      if (value.length === 0 && !path.endsWith("favorites")) errors.push(`${path} 不能为空`);
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(cfg, "");

  const ascending = (rows: { [k: string]: unknown }[], key: string, path: string) => {
    if (rows[0]?.[key] !== 0) errors.push(`${path}[0].${key} 必须为 0`);
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][key] as number) <= (rows[i - 1][key] as number)) errors.push(`${path}[${i}].${key} 必须大于上一项`);
    }
  };
  ascending(cfg.reputation.levels, "threshold", "reputation.levels");
  ascending(cfg.realms, "cultivation", "realms");

  const dishIds = new Set(cfg.dishes.map((d) => d.id));
  if (dishIds.size !== cfg.dishes.length) errors.push("dishes 里有重复的 id");
  cfg.patronKinds.forEach((k, i) =>
    k.favorites.forEach((id) => {
      if (!dishIds.has(id)) errors.push(`patronKinds[${i}].favorites 引用了不存在的菜「${id}」`);
    }),
  );
  if (cfg.session.arrivalMinMs > cfg.session.arrivalMaxMs) errors.push("session.arrivalMinMs 不能大于 arrivalMaxMs");
  for (const [path, v] of [
    ["regulars.returnChance", cfg.regulars.returnChance],
    ["dailyGoal.partialThreshold", cfg.dailyGoal.partialThreshold],
    ["staff.buyerDiscountCap", cfg.staff.buyerDiscountCap],
  ] as const) {
    if (v > 1) errors.push(`${path} 是比例，不能大于 1（现在是 ${v}）`);
  }
  if (cfg.tavern.floorPriceMultipliers.length < 3) errors.push("tavern.floorPriceMultipliers 需要 3 项（1F/2F/3F）");
  if (cfg.tavern.floorPatienceMultipliers.length < 3) errors.push("tavern.floorPatienceMultipliers 需要 3 项（1F/2F/3F）");
  return errors;
}
