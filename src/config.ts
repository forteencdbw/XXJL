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
    /** 开局食材（按 ingredients 的 id 计数，没写的为 0） */
    ingredients: { lingshu: 6 } as Record<string, number>,
  },

  /** 全局装饰时钟：只影响天色与状态栏显示，不影响玩法 */
  clock: {
    /** 现实几点算天亮 */
    dayStartHour: 6,
    /** 现实几点算入夜 */
    dayEndHour: 18,
  },

  /** 营业中的节奏 */
  session: {
    /** 营业倒计时：现实多少毫秒走一刻（游戏内 15 分钟）；开门到打烊的刻数 × 它 = 本局时长 */
    msPerQuarter: 4000,
    /** 几点开门（辰正 = 8） */
    openHour: 8,
    /** 几点打烊（子初 = 23）；到点后不再来客，店里客人走完即结算 */
    closeHour: 23,
    /** 最后一位客人最晚几点到；当天客人在开门到这个时刻之间均匀铺开 */
    lastArrivalHour: 21,
    /** 每位客人到店时刻的随机浮动（0.3 = 前后浮动平均间隔的 30%） */
    arrivalJitter: 0.3,
    /** 开门后第一位客人几毫秒内到，避免开局空等 */
    firstArrivalMs: 2200,
    /** 排队耐心（毫秒），再乘食客类型的耐心系数 */
    queuePatienceMs: 8000,
    /** 第 1 天排队耐心倍率（教学缓冲） */
    firstDayPatienceMultiplier: 2.2,
    /** 第 1 天少来几位客人（教学缓冲） */
    firstDayFewerPatrons: 1,
    /** 用膳时长（毫秒），吃完离店结算 */
    diningMs: 4500,
  },

  /** 烹饪耗时（菜品基础耗时再乘掌勺人的神识倍率） */
  timing: {
    /** 酒楼每升一级，烹饪耗时缩短（毫秒）；基础耗时见各菜品 */
    cookShrinkPerLevelMs: 200,
    /** 烹饪耗时最短（毫秒） */
    cookFloorMs: 500,
  },

  /**
   * 食材。rare 决定采集单次产量的稀有度系数与随机奖励的抽取权重；
   * desc 是仓库里给玩家看的俏皮介绍。
   */
  ingredients: [
    { id: "lingshu", name: "灵蔬", rare: false, yieldFactor: 1, desc: "长得歪歪扭扭的青菜，喝灵泉、晒月光，脾气比人还大。" },
    { id: "lingmi", name: "灵米", rare: false, yieldFactor: 1, desc: "一粒能煮半锅——前提是按住它别自己跳出来。" },
    { id: "shanjun", name: "山菌", rare: false, yieldFactor: 1, desc: "雨后探头，见人就说「我不好吃」，然后还是被采了。" },
    { id: "zhulu", name: "竹露", rare: false, yieldFactor: 1, desc: "一年只攒三滴，喝一口，嘴甜三天。" },
    { id: "lingshen", name: "九叶灵参", rare: true, yieldFactor: 0.6, desc: "九片叶子九条命，拔之前它会先跟你谈判。" },
    { id: "xiyu", name: "银鳞溪鱼", rare: true, yieldFactor: 0.6, desc: "鳞片会反光，滑得像一句没说完的谎。" },
    { id: "qindan", name: "赤羽灵禽蛋", rare: true, yieldFactor: 0.6, desc: "蛋壳上烧着暗火，孵出来是鸡是凤全看它心情。" },
    { id: "daoguo", name: "太虚道果", rare: true, yieldFactor: 0.6, desc: "三百年开花、五百年结果，所以它比掌柜更少见。" },
  ],

  /**
   * 采集。冷却走现实时间（Time.now），切后台、关页面都继续走。
   * 单次产量 = (yieldBase + 机缘 × yieldPerStar) × 食材 yieldFactor，至少 1 份。
   */
  gathering: {
    /** 每个采集点的冷却（真实毫秒） */
    cooldownMs: 5 * 60 * 1000,
    yieldBase: 2,
    yieldPerStar: 0.5,
    /** 采集点。ingredients 引用上面的食材 id；开局全开，每点一个槽位。 */
    spots: [
      { id: "herb", name: "后山药圃", desc: "掌柜，这儿的草比我会长。", ingredients: ["lingshu", "lingshen", "daoguo"] },
      { id: "stream", name: "山溪浅滩", desc: "水清得能照见这个月的工钱。", ingredients: ["lingmi", "xiyu"] },
      { id: "bamboo", name: "南坡竹林", desc: "笋长得比谁都快，露水最慢。", ingredients: ["shanjun", "zhulu", "qindan"] },
    ],
    /** 出发时说一句（按概率，和员工干活台词同机制） */
    lines: ["今儿个多采点。", "手气不错。", "掌柜，看这个！", "这处灵气足。", "采满一篓就回。", "这根成精了吧……"],
  },

  /**
   * 菜品。price 售价（灵石），cookMs 基础烹饪耗时（毫秒），unlockLevel 酒楼几级解锁。
   * recipe 是食材 id 列表，每种消耗 1 份。
   * 设计原则：售价越高，每秒收益越低（高价菜靠口味/稀客回本）。
   */
  dishes: [
    { id: "stirfry", name: "清炒灵蔬", price: 6, cookMs: 1500, unlockLevel: 1, recipe: ["lingshu"], desc: "大火快炒，锅气一散就不好吃了。散修们的续命菜。" },
    { id: "porridge", name: "灵米粥", price: 9, cookMs: 2500, unlockLevel: 2, recipe: ["lingmi", "shanjun"], desc: "米熬到开花、菌最后下。下雨天卖得最好。" },
    { id: "jelly", name: "玉露羹", price: 14, cookMs: 4000, unlockLevel: 3, recipe: ["zhulu", "lingmi"], desc: "用竹露吊出来的甜，不放糖。喝过的都说像小时候。" },
    { id: "fish", name: "龙涎鱼脍", price: 22, cookMs: 6500, unlockLevel: 4, recipe: ["xiyu"], desc: "鱼片薄得透光，刀工差一点就成鱼泥。" },
    { id: "ginseng", name: "九转灵参", price: 32, cookMs: 10000, unlockLevel: 6, recipe: ["lingshen", "zhulu"], desc: "九蒸九晒，参自己都嫌麻烦。补得很，也贵得很。" },
    { id: "phoenix", name: "凤凰涅槃羹", price: 46, cookMs: 15000, unlockLevel: 8, recipe: ["qindan", "lingshu"], desc: "名字最唬人，其实就是一锅好汤。掌柜说这叫品牌溢价。" },
    { id: "voidfruit", name: "太虚道果", price: 65, cookMs: 22000, unlockLevel: 10, recipe: ["daoguo", "zhulu"], desc: "端上桌客人先拍照。据说一口顶十年苦修，真假不知道，反正贵。" },
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
  /** 食客类型；walkSpeedFactor 乘在 patronMove.walkSpeed 上（1 = 常速，越小越慢） */
  patronKinds: [
    { id: "rogue", name: "散修", bodyColor: 0x7a8a6a, hairColor: 0x2b2b2b, patienceFactor: 1, favorites: ["stirfry", "ginseng"], weight: 8, priceFactor: 1, walkSpeedFactor: 1, names: ["沈青崖", "陆行舟", "顾长风", "唐不器"] },
    { id: "sword", name: "剑修", bodyColor: 0x5a7a9a, hairColor: 0x1b1b2b, patienceFactor: 0.8, favorites: ["fish", "jelly", "voidfruit"], weight: 8, priceFactor: 1.1, walkSpeedFactor: 1, names: ["白无锋", "叶惊鸿", "江雪照", "谢孤云"] },
    { id: "alchemist", name: "丹修", bodyColor: 0x8a6a9a, hairColor: 0x3b2b3b, patienceFactor: 1.1, favorites: ["porridge", "jelly", "ginseng"], weight: 8, priceFactor: 1.05, walkSpeedFactor: 1, names: ["苏问丹", "柳含烟", "程九炉", "温岐黄"] },
    { id: "demon", name: "妖修", bodyColor: 0x9a5a3a, hairColor: 0x4a2b1b, patienceFactor: 1.2, favorites: ["fish", "stirfry", "phoenix"], weight: 8, priceFactor: 1.2, walkSpeedFactor: 1, names: ["阿椒", "青尾", "胡三娘", "花间狸"] },
    { id: "mortal", name: "凡人", bodyColor: 0xb0a090, hairColor: 0x3b3b3b, patienceFactor: 1.3, favorites: [] as string[], weight: 8, priceFactor: 0.9, walkSpeedFactor: 1, names: ["王二", "李婶", "陈货郎", "赵小满"] },
    { id: "elder", name: "仙门长老", bodyColor: 0xe8e0c8, hairColor: 0xdfe6ff, patienceFactor: 1.5, favorites: ["ginseng", "phoenix", "voidfruit"], weight: 1, priceFactor: 2.5, walkSpeedFactor: 1, names: ["玄阳真人", "清虚长老", "素心仙子", "太微道人"] },
    { id: "demonlord", name: "魔道散人", bodyColor: 0x6a2a3a, hairColor: 0x1a1a1a, patienceFactor: 0.7, favorites: ["fish", "phoenix"], weight: 1, priceFactor: 1.8, walkSpeedFactor: 1, names: ["殷无咎", "屠千山", "夜罗刹", "鬼母"] },
  ],
  /** 食客走路：悠闲为主，耗时按距离算（领座时跟着跑堂走，不用这里的速度） */
  patronMove: {
    /** 走路速度（像素/秒）；伙计 1 星约 170 */
    walkSpeed: 110,
    /** 生气离开（排队等太久、门外排满、食材不足没吃上）时的速度倍率 */
    angryFactor: 1.4,
    /** 御剑、乘云、化烟、裂空等出场动画的时长倍率，越大越慢 */
    entranceSlow: 2.2,
  },
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

  /** 员工（含掌柜）。每人有灵根和五项属性（1–10 星），其中三项对应工作：
   *   根骨 → 跑堂（领座、传菜）的走路速度；神识 → 烹饪速度与质量；机缘 → 采集产量。
   *   悟性、气感留给修行，暂无经营作用。
   * 谁都能做任何工作，属性低只是慢、做得差。
   */
  staff: {
    /** 掌柜：新档初始五项属性（星）、灵根种数；不能辞退、不领工资、不占雇人名额 */
    shopkeeperStars: 4,
    shopkeeperRootCount: 2,
    /**
     * 灵根按种数分档（第 1 项 = 1 种，第 5 项 = 5 种）：
     *   weight 招聘时的出现权重；jobBonus 对口工作多算几星（火→烹饪、水→跑堂，可超过 maxStars）；
     *   worth 工资与雇佣费的身价倍率；maxRealm 修为上限（修为子系统占位，暂不生效）
     */
    roots: [
      { name: "天灵根", weight: 3, jobBonus: 3, worth: 2, maxRealm: "大乘" },
      { name: "双灵根", weight: 12, jobBonus: 2, worth: 1.4, maxRealm: "合体" },
      { name: "三灵根", weight: 45, jobBonus: 1, worth: 1, maxRealm: "化神" },
      { name: "四灵根", weight: 25, jobBonus: 0, worth: 0.85, maxRealm: "元婴" },
      { name: "杂灵根", weight: 15, jobBonus: 0, worth: 0.85, maxRealm: "金丹" },
    ],
    /** 跑堂走路速度 = walkSpeed ÷ 耗时倍率（像素/秒）；1 星约 170，10 星约 440 */
    walkSpeed: 270,
    /** 可雇人数上限 = capBase + ⌊酒楼等级 / capLevelsPerSlot⌋ */
    capBase: 2,
    capLevelsPerSlot: 2,
    /** 可雇人数硬上限（伙计页一屏放得下的人数） */
    capMax: 7,
    /**
     * 领座/传菜/烹饪开工时有 chance 的概率说一句（头上已有气泡就不说）；
     * 闲聊时员工也从这里取（手上的活，空闲则第一岗位）。
     */
    workLines: {
      chance: 0.25,
      seat: ["客官里边请——", "小心台阶。", "雅座已备好。", "这边请，靠窗灵气足。", "几位？楼上有座。"],
      serve: ["菜来咯，小心烫。", "让一让，热菜！", "客官的灵膳到了。", "趁热吃，灵气不散。", "这道刚出锅。"],
      cook: ["火候到了。", "再添一把柴。", "这锅气，成了。", "灵火莫急。", "这道得慢慢煨。", "盐少许，灵露三滴。"],
    },
    /** 属性上限（星） */
    maxStars: 10,
    /** 招聘时五项属性总星数（每项至少 1 星，其余随机分配） */
    candidateTotalStars: 18,
    /** 每天刷出几名候选人 */
    candidatesPerDay: 3,
    /** 当场再刷新一次候选人的费用（灵石） */
    refreshCost: 5,
    /** 雇佣费用 =（hireCostBase + hireCostPerStar × 总星数）× 灵根身价 */
    hireCostBase: 10,
    hireCostPerStar: 1.33,
    /** 日薪 =（wageBase + wagePerStar × 总星数）× 灵根身价（四舍五入），加点后自动涨薪 */
    wageBase: 5,
    wagePerStar: 0.4,
    /** 耗时倍率 = speedAtOneStar × speedPerStar^(属性 − 1)；烹饪耗时与走路速度都用它（1 星 1.6 倍，10 星约 0.62 倍） */
    speedAtOneStar: 1.6,
    speedPerStar: 0.9,
    /** 烹饪质量（售价倍率）= qualityBase + qualityPerStar × 神识；1 星 ×0.885，10 星 ×1.2 */
    qualityBase: 0.85,
    qualityPerStar: 0.035,
    /** 每件活（领座、传菜、起锅、采集）得 1 点经验；升下一级要 expBase + expPerLevel × (当前等级 − 1) 点 */
    expBase: 10,
    expPerLevel: 5,
    /** 等级上限；每升一级得 1 个属性点，由玩家自己加 */
    maxLevel: 40,
    /** 员工姓名池 */
    names: ["阿福", "小满", "石头", "春桃", "二柱", "秋菱", "长庚", "杏儿", "大勇", "青禾", "铁牛", "莲生", "冬瓜", "小鱼", "阿蛮", "柳芽"],
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
  },

  /** 灯会 */
  festival: {
    /** 每几天一次 */
    interval: 7,
    /** 当天多来几位客人 */
    extraPatrons: 3,
    /** 目标赏金倍率 */
    goalCoinMultiplier: 1.5,
  },

  /** 天气（每天按本机日期轮换一种，纯装饰）。visual 天气粒子：0 晴 1 灵雾 2 落英 3 夜雨。 */
  weathers: [
    { id: "clear", name: "晴", desc: "风和日丽，檐下浮着金尘", visual: 0 },
    { id: "mist", name: "灵雾", desc: "仙雾缭绕，山门若隐若现", visual: 1 },
    { id: "petals", name: "落英", desc: "落英缤纷，花瓣飘进雅座", visual: 2 },
    { id: "rain", name: "夜雨", desc: "夜雨潇潇，檐角滴答作响", visual: 3 },
  ] as { id: string; name: string; desc: string; visual: 0 | 1 | 2 | 3 }[],

  /** 开市利是（本机每天第一次开店） */
  dailyGift: {
    /** 连续天数最多算到几天 */
    streakCap: 7,
    /** 灵石 = coinsBase + coinsPerStreakDay × 连续天数 + coinsPerLevel × 等级 */
    coinsBase: 15,
    coinsPerStreakDay: 5,
    coinsPerLevel: 2,
    /** 连续满几天起送食材 */
    ingredientsFromStreak: 3,
    /** 送多少份随机食材 */
    ingredients: 2,
  },

  /**
   * 修为子系统（本期只占位，玩法待设计）：经营不产出修为，境界只用于在修为页只读显示。
   * cultivation 为突破门槛（递增，首项为 0）。
   */
  realms: [
    { name: "炼气", cultivation: 0 },
    { name: "筑基", cultivation: 30 },
    { name: "金丹", cultivation: 80 },
    { name: "元婴", cultivation: 160 },
    { name: "化神", cultivation: 280 },
    { name: "炼虚", cultivation: 450 },
    { name: "合体", cultivation: 700 },
    { name: "大乘", cultivation: 1000 },
  ],

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
    /** 几点以后不再触发（戌初 = 19）；触发时刻随机落在开门到这个时刻之间 */
    lastHour: 19,
    /** coins/ingredients 可为负；weight 抽取权重 */
    pool: [
      { id: "rain", text: "灵雨润田，后厨凭空多出一筐食材", kind: "good", coins: 0, ingredients: 3, weight: 2 },
      { id: "immortal", text: "一位过路仙长尝了口小菜，留下几块灵石", kind: "good", coins: 6, ingredients: 0, weight: 2 },
      { id: "tip", text: "食客吃得尽兴，多留了一份赏钱", kind: "good", coins: 5, ingredients: 0, weight: 2 },
      { id: "oldfriend", text: "旧友来访，叙旧之余留下一壶灵酒", kind: "good", coins: 3, ingredients: 0, weight: 1 },
      { id: "crane", text: "仙鹤衔芝落在檐角，赠你一味食材", kind: "good", coins: 0, ingredients: 4, weight: 1 },
      { id: "wind", text: "妖风过境，吹散了后厨晾着的一味食材", kind: "bad", coins: 0, ingredients: -2, weight: 1 },
      { id: "thief", text: "蟊贼光顾，柜上少了几块灵石", kind: "bad", coins: -4, ingredients: 0, weight: 1 },
      { id: "mishap", text: "灶台走了水，赔了些灵石与食材", kind: "bad", coins: -3, ingredients: -1, weight: 1 },
    ] as { id: string; text: string; kind: "good" | "bad"; coins: number; ingredients: number; weight: number }[],
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

  if (cfg.staff.workLines.chance > 1) errors.push("staff.workLines.chance 不能大于 1");

  const ingredientIds = new Set(cfg.ingredients.map((i) => i.id));
  if (ingredientIds.size !== cfg.ingredients.length) errors.push("ingredients 里有重复的 id");
  const dishIds = new Set(cfg.dishes.map((d) => d.id));
  if (dishIds.size !== cfg.dishes.length) errors.push("dishes 里有重复的 id");
  cfg.dishes.forEach((dish, i) =>
    dish.recipe.forEach((id) => {
      if (!ingredientIds.has(id)) errors.push(`dishes[${i}] 的配方引用了不存在的食材「${id}」`);
    }),
  );
  const spotIds = new Set(cfg.gathering.spots.map((s) => s.id));
  if (spotIds.size !== cfg.gathering.spots.length) errors.push("gathering.spots 里有重复的 id");
  cfg.gathering.spots.forEach((spot, i) => {
    if (spot.ingredients.length === 0) errors.push(`gathering.spots[${i}] 至少要产出一种食材`);
    spot.ingredients.forEach((id) => {
      if (!ingredientIds.has(id)) errors.push(`gathering.spots[${i}] 引用了不存在的食材「${id}」`);
    });
  });
  if (cfg.gathering.cooldownMs < 1000) errors.push("gathering.cooldownMs 至少 1000 毫秒");
  if (cfg.patronMove.walkSpeed <= 0 || cfg.patronMove.angryFactor <= 0 || cfg.patronMove.entranceSlow <= 0)
    errors.push("patronMove 的速度与倍率都要大于 0");
  cfg.patronKinds.forEach((k, i) => {
    if (k.walkSpeedFactor <= 0) errors.push(`patronKinds[${i}].walkSpeedFactor 要大于 0`);
  });
  cfg.patronKinds.forEach((k, i) =>
    k.favorites.forEach((id) => {
      if (!dishIds.has(id)) errors.push(`patronKinds[${i}].favorites 引用了不存在的菜「${id}」`);
    }),
  );
  const se = cfg.session;
  if (!(se.openHour < se.lastArrivalHour && se.lastArrivalHour <= se.closeHour && se.closeHour <= 24))
    errors.push("session 时刻要满足 openHour < lastArrivalHour ≤ closeHour ≤ 24");
  if (!(se.openHour < cfg.events.lastHour && cfg.events.lastHour <= se.closeHour))
    errors.push("events.lastHour 要在 session.openHour 与 closeHour 之间");
  if (se.msPerQuarter < 100) errors.push("session.msPerQuarter 至少 100 毫秒");
  if (!(cfg.clock.dayStartHour >= 0 && cfg.clock.dayStartHour < cfg.clock.dayEndHour && cfg.clock.dayEndHour <= 24))
    errors.push("clock 要满足 0 ≤ dayStartHour < dayEndHour ≤ 24");
  for (const [path, v] of [
    ["regulars.returnChance", cfg.regulars.returnChance],
    ["dailyGoal.partialThreshold", cfg.dailyGoal.partialThreshold],
    ["session.arrivalJitter", cfg.session.arrivalJitter],
  ] as const) {
    if (v > 1) errors.push(`${path} 是比例，不能大于 1（现在是 ${v}）`);
  }
  const st = cfg.staff;
  if (st.candidateTotalStars < 5 || st.candidateTotalStars > st.maxStars * 5)
    errors.push(`staff.candidateTotalStars 要在 5 到 ${st.maxStars * 5} 之间`);
  if (st.roots.length !== 5) errors.push("staff.roots 要正好 5 档（1 到 5 种灵根）");
  if (!st.roots.some((r) => r.weight > 0)) errors.push("staff.roots 至少一档 weight 大于 0");
  for (const r of st.roots)
    if (!cfg.realms.some((realm) => realm.name === r.maxRealm)) errors.push(`staff.roots「${r.name}」的 maxRealm 不是已有境界`);
  if (st.shopkeeperRootCount < 1 || st.shopkeeperRootCount > 5) errors.push("staff.shopkeeperRootCount 要在 1 到 5 之间");
  if (st.capMax < 1 || st.capMax > 7) errors.push("staff.capMax 要在 1 到 7 之间（伙计页一屏最多放 7 人）");
  if (st.expBase < 1) errors.push("staff.expBase 至少为 1");
  if (st.maxLevel < 1) errors.push("staff.maxLevel 至少为 1");
  if (st.candidatesPerDay < 1) errors.push("staff.candidatesPerDay 至少为 1");
  if (cfg.tavern.floorPriceMultipliers.length < 3) errors.push("tavern.floorPriceMultipliers 需要 3 项（1F/2F/3F）");
  if (cfg.tavern.floorPatienceMultipliers.length < 3) errors.push("tavern.floorPatienceMultipliers 需要 3 项（1F/2F/3F）");
  return errors;
}
