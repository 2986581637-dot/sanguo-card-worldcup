"use strict";

// 保留原有武力顺序。martial 从 100 起每名递减 0.5；战斗统一读取武力和智力的较高值。
const MARTIAL_ROSTER = Object.freeze([
  ["吕布", "群"], ["关羽", "蜀"], ["张飞", "蜀"], ["赵云", "蜀"],
  ["马超", "蜀"], ["典韦", "魏"], ["许褚", "魏"], ["黄忠", "蜀"],
  ["孙策", "吴"], ["太史慈", "吴"], ["张辽", "魏"], ["甘宁", "吴"],
  ["魏延", "蜀"], ["姜维", "蜀"], ["徐晃", "魏"], ["夏侯惇", "魏"],
  ["夏侯渊", "魏"], ["邓艾", "魏"], ["孙坚", "吴"], ["文丑", "群"],
  ["颜良", "群"], ["华雄", "群"], ["庞德", "魏"], ["张郃", "魏"],
  ["高顺", "群"], ["周泰", "吴"], ["曹彰", "魏"], ["马岱", "蜀"],
  ["关平", "蜀"], ["张苞", "蜀"], ["关兴", "蜀"], ["凌统", "吴"],
  ["丁奉", "吴"], ["潘璋", "吴"], ["程普", "吴"], ["黄盖", "吴"],
  ["韩当", "吴"], ["文聘", "魏"], ["乐进", "魏"], ["于禁", "魏"],
  ["李典", "魏"], ["曹仁", "魏"], ["曹洪", "魏"], ["臧霸", "魏"],
  ["纪灵", "群"], ["管亥", "群"], ["沙摩柯", "群"], ["兀突骨", "群"],
  ["孟获", "群"], ["祝融夫人", "群"], ["王双", "魏"], ["武安国", "群"],
  ["鞠义", "群"], ["陈到", "蜀"], ["严颜", "蜀"], ["张任", "群"],
  ["李严", "蜀"], ["高览", "群"], ["韩猛", "群"], ["夏侯霸", "魏"],
  ["毌丘俭", "魏"], ["文鸯", "魏"], ["曹真", "魏"], ["曹休", "魏"],
  ["郝昭", "魏"], ["王平", "蜀"], ["廖化", "蜀"], ["张翼", "蜀"],
  ["张嶷", "蜀"], ["马忠", "蜀"], ["吴懿", "蜀"], ["霍峻", "蜀"],
  ["陈武", "吴"], ["董袭", "吴"], ["徐盛", "吴"], ["朱桓", "吴"],
  ["朱然", "吴"], ["蒋钦", "吴"], ["周仓", "蜀"], ["关索", "蜀"],
  ["周瑜", "吴"], ["吕蒙", "吴"], ["刘备", "蜀"], ["曹操", "魏"],
  ["孙权", "吴"], ["袁绍", "群"], ["钟会", "魏"], ["陆逊", "吴"],
  ["司马懿", "魏"], ["诸葛亮", "蜀"], ["庞统", "蜀"], ["郭嘉", "魏"],
  ["荀彧", "魏"], ["贾诩", "魏"], ["董卓", "群"], ["公孙瓒", "群"],
  ["马腾", "群"], ["韩遂", "群"], ["袁术", "群"], ["张绣", "群"],
  ["樊稠", "群"], ["李傕", "群"], ["郭汜", "群"], ["胡车儿", "群"],
  ["徐荣", "群"], ["张鲁", "群"], ["刘璋", "群"], ["刘表", "群"],
  ["黄祖", "群"], ["蔡瑁", "群"], ["张允", "群"], ["刘封", "蜀"],
  ["孟达", "蜀"], ["吴班", "蜀"], ["高翔", "蜀"], ["陈式", "蜀"],
  ["傅佥", "蜀"], ["诸葛尚", "蜀"], ["曹爽", "魏"], ["郭淮", "魏"],
  ["王基", "魏"], ["诸葛诞", "魏"], ["满宠", "魏"], ["徐庶", "蜀"],
  ["法正", "蜀"], ["马良", "蜀"], ["马谡", "蜀"], ["蒋干", "吴"],
  ["鲁肃", "吴"], ["诸葛瑾", "吴"], ["陆抗", "吴"], ["张昭", "吴"],
  ["张纮", "吴"], ["顾雍", "吴"], ["步骘", "吴"], ["阚泽", "吴"],
  ["凌操", "吴"], ["贺齐", "吴"], ["陶谦", "群"], ["刘焉", "群"],
  ["何进", "群"], ["张角", "群"], ["张宝", "群"], ["张梁", "群"],
  ["陈宫", "群"], ["沮授", "群"], ["田丰", "群"], ["审配", "群"],
  ["许攸", "群"], ["貂蝉", "群"]
]);

// 只保留智力修正与人物特性；武力来自固定名单顺序。
const PROFILE_OVERRIDES = Object.freeze({
  曹操: [96, "乱世雄略"], 诸葛亮: [100, "星垂隆中"],
  司马懿: [98, "隐锋待时"], 周瑜: [97, "江火连营"],
  刘备: [88, "仁旌聚义"], 孙权: [89, "碧眼定江"],
  关羽: [78, "青龙镇岳"], 张辽: [84, "威震逍遥"],
  赵云: [80, "银甲破阵"], 陆逊: [96, "夷陵藏锋"],
  吕布: [48, "辕门无双"], 郭嘉: [99, "鬼谋定势"],
  吕蒙: [92, "白衣渡江"], 荀彧: [98, "王佐持衡"],
  孙策: [78, "江东烈焰"], 贾诩: [98, "乱局自全"],
  庞统: [97, "凤雏连策"], 姜维: [91, "陇岭遗志"],
  邓艾: [92, "阴平奇渡"], 张飞: [63, "当阳断喝"],
  马超: [65, "西凉神威"], 徐晃: [79, "长驱断援"],
  太史慈: [72, "信义贯矢"], 甘宁: [76, "锦帆夜袭"],
  黄忠: [70, "定军神弦"], 魏延: [73, "奇道争锋"],
  钟会: [93, "剑阁雄心"], 夏侯惇: [68, "独目守旌"],
  夏侯渊: [70, "千里疾行"], 典韦: [45, "铁戟死卫"],
  许褚: [50, "虎卫撼阵"], 袁绍: [76, "四州名望"]
});

// 第一批原创人物立绘；未配置的角色继续使用现有古风剪影占位图。
const PORTRAIT_PATHS = Object.freeze({
  吕布: "assets/portraits/lu_bu.webp",
  关羽: "assets/portraits/guan_yu.webp",
  张飞: "assets/portraits/zhang_fei.webp",
  赵云: "assets/portraits/zhao_yun.webp",
  马超: "assets/portraits/ma_chao.webp",
  典韦: "assets/portraits/dian_wei.webp",
  许褚: "assets/portraits/xu_chu.webp",
  曹操: "assets/portraits/cao_cao.webp",
  诸葛亮: "assets/portraits/zhuge_liang.webp",
  周瑜: "assets/portraits/zhou_yu.webp",
  司马懿: "assets/portraits/sima_yi.webp",
  郭嘉: "assets/portraits/guo_jia.webp",
  贾诩: "assets/portraits/jia_xu.webp",
  庞统: "assets/portraits/pang_tong.webp",
  荀彧: "assets/portraits/xun_yu.webp",
  夏侯惇: "assets/portraits/xiahou_dun.webp",
  夏侯渊: "assets/portraits/xiahou_yuan.webp",
  邓艾: "assets/portraits/deng_ai.webp",
  孙坚: "assets/portraits/sun_jian.webp",
  文丑: "assets/portraits/wen_chou.webp",
  黄忠: "assets/portraits/huang_zhong.webp",
  孙策: "assets/portraits/sun_ce.webp",
  太史慈: "assets/portraits/taishi_ci.webp",
  张辽: "assets/portraits/zhang_liao.webp",
  甘宁: "assets/portraits/gan_ning.webp",
  魏延: "assets/portraits/wei_yan.webp",
  姜维: "assets/portraits/jiang_wei.webp",
  徐晃: "assets/portraits/xu_huang.webp",
  颜良: "assets/portraits/yan_liang.webp",
  华雄: "assets/portraits/hua_xiong.webp",
  庞德: "assets/portraits/pang_de.webp",
  张郃: "assets/portraits/zhang_he.webp",
  高顺: "assets/portraits/gao_shun.webp",
  周泰: "assets/portraits/zhou_tai.webp",
  曹彰: "assets/portraits/cao_zhang.webp",
  马岱: "assets/portraits/ma_dai.webp",
  关平: "assets/portraits/guan_ping.webp",
  张苞: "assets/portraits/zhang_bao.webp",
  关兴: "assets/portraits/guan_xing.webp",
  凌统: "assets/portraits/ling_tong.webp",
  丁奉: "assets/portraits/portrait_033.webp",
  潘璋: "assets/portraits/portrait_034.webp",
  程普: "assets/portraits/portrait_035.webp",
  黄盖: "assets/portraits/portrait_036.webp",
  韩当: "assets/portraits/portrait_037.webp",
  文聘: "assets/portraits/portrait_038.webp",
  乐进: "assets/portraits/portrait_039.webp",
  于禁: "assets/portraits/portrait_040.webp",
  李典: "assets/portraits/portrait_041.webp",
  曹仁: "assets/portraits/portrait_042.webp",
  曹洪: "assets/portraits/portrait_043.webp",
  臧霸: "assets/portraits/portrait_044.webp",
  纪灵: "assets/portraits/portrait_045.webp",
  管亥: "assets/portraits/portrait_046.webp",
  沙摩柯: "assets/portraits/portrait_047.webp",
  兀突骨: "assets/portraits/portrait_048.webp",
  孟获: "assets/portraits/portrait_049.webp",
  祝融夫人: "assets/portraits/portrait_050.webp",
  王双: "assets/portraits/portrait_051.webp",
  武安国: "assets/portraits/portrait_052.webp",
  鞠义: "assets/portraits/portrait_053.webp",
  陈到: "assets/portraits/portrait_054.webp",
  严颜: "assets/portraits/portrait_055.webp",
  张任: "assets/portraits/portrait_056.webp",
  李严: "assets/portraits/portrait_057.webp",
  高览: "assets/portraits/portrait_058.webp",
  韩猛: "assets/portraits/portrait_059.webp",
  夏侯霸: "assets/portraits/portrait_060.webp",
  毌丘俭: "assets/portraits/portrait_061.webp",
  文鸯: "assets/portraits/portrait_062.webp",
  曹真: "assets/portraits/portrait_063.webp",
  曹休: "assets/portraits/portrait_064.webp",
  郝昭: "assets/portraits/portrait_065.webp",
  王平: "assets/portraits/portrait_066.webp",
  廖化: "assets/portraits/portrait_067.webp"
});

function generatedStat(name, rank, salt) {
  const nameSeed = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return 45 + ((nameSeed + rank * 13 + salt * 17) % 51);
}

function tierFromRank(rank) {
  if (rank <= 30) return ["天", rank <= 10 ? "一" : rank <= 20 ? "二" : "三"];
  if (rank <= 60) return ["地", rank <= 40 ? "一" : rank <= 50 ? "二" : "三"];
  if (rank <= 90) return ["人", rank <= 70 ? "一" : rank <= 80 ? "二" : "三"];
  return ["凡", rank <= 110 ? "一" : rank <= 130 ? "二" : "三"];
}

if (MARTIAL_ROSTER.length !== 150 || new Set(MARTIAL_ROSTER.map(([name]) => name)).size !== 150) {
  throw new RangeError("人物卡池不是150名唯一人物");
}

// 全项目判断人物综合强度的唯一入口：武力与智力取较高值。
function calculateCombatPower(general) {
  if (!general || typeof general !== "object") throw new TypeError("计算综合战力时缺少有效人物");
  const martial = Number(general.martial);
  const intelligence = Number(general.intelligence);
  if (!Number.isFinite(martial) || !Number.isFinite(intelligence)) {
    throw new TypeError(`${general.name || "未知人物"}缺少有效武力或智力`);
  }
  return Math.max(martial, intelligence);
}

const balancedCharacters = MARTIAL_ROSTER.map(([name, faction], martialIndex) => {
  const martialRank = martialIndex + 1;
  const martial = Number((100 - martialIndex * 0.5).toFixed(1));
  const override = PROFILE_OVERRIDES[name];
  const intelligence = override?.[0] ?? generatedStat(name, martialRank, 1);
  return {
    name,
    faction,
    power: Math.max(martial, intelligence),
    martial,
    intelligence,
    trait: override?.[1] ?? `${name}战意`,
    portrait: PORTRAIT_PATHS[name] ?? "",
    sourceIndex: martialIndex
  };
}).sort((left, right) =>
  calculateCombatPower(right) - calculateCombatPower(left)
  || right.intelligence - left.intelligence
  || right.martial - left.martial
  || left.sourceIndex - right.sourceIndex
);

window.calculateCombatPower = calculateCombatPower;
window.CHARACTERS = Object.freeze(balancedCharacters.map((character, index) => {
  const rank = index + 1;
  const [tier, subTier] = tierFromRank(rank);
  const { sourceIndex: _sourceIndex, ...publicCharacter } = character;
  return Object.freeze({ ...publicCharacter, rank, tier, subTier });
}));
