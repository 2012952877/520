/* 倒数日的日期计算。
   四种日子：
     yearly  每年重复（公历或农历），生日、纪念日、节日都是这种
     once    只发生一次
     weekly  每周重复，周六周日
     countup 从某天起往上数，比如「在一起多少天」*/
(function (root) {
  'use strict';

  var Lunar = root.Lunar;
  var WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  // 内置节日。用户可以在设置里逐个关掉，关掉的 id 存进 hiddenPresets。
  var PRESETS = [
    { id: 'p.yuandan', title: '元旦', emoji: '🎊', kind: 'yearly', calendar: 'solar', m: 1, d: 1 },
    { id: 'p.chuxi', title: '除夕', emoji: '🏮', kind: 'yearly', calendar: 'lunar', m: 12, d: 30 },
    { id: 'p.chunjie', title: '春节', emoji: '🧧', kind: 'yearly', calendar: 'lunar', m: 1, d: 1 },
    { id: 'p.yuanxiao', title: '元宵节', emoji: '🥮', kind: 'yearly', calendar: 'lunar', m: 1, d: 15 },
    { id: 'p.qingren', title: '情人节', emoji: '💐', kind: 'yearly', calendar: 'solar', m: 2, d: 14 },
    { id: 'p.nvshen', title: '女神节', emoji: '🌷', kind: 'yearly', calendar: 'solar', m: 3, d: 8 },
    { id: 'p.laodong', title: '劳动节', emoji: '🌿', kind: 'yearly', calendar: 'solar', m: 5, d: 1 },
    { id: 'p.520', title: '520', emoji: '💘', kind: 'yearly', calendar: 'solar', m: 5, d: 20 },
    { id: 'p.ertong', title: '儿童节', emoji: '🍭', kind: 'yearly', calendar: 'solar', m: 6, d: 1 },
    { id: 'p.duanwu', title: '端午节', emoji: '🐉', kind: 'yearly', calendar: 'lunar', m: 5, d: 5 },
    { id: 'p.qixi', title: '七夕', emoji: '🌌', kind: 'yearly', calendar: 'lunar', m: 7, d: 7 },
    { id: 'p.zhongqiu', title: '中秋节', emoji: '🌕', kind: 'yearly', calendar: 'lunar', m: 8, d: 15 },
    { id: 'p.chongyang', title: '重阳节', emoji: '🍂', kind: 'yearly', calendar: 'lunar', m: 9, d: 9 },
    { id: 'p.guoqing', title: '国庆节', emoji: '🎆', kind: 'yearly', calendar: 'solar', m: 10, d: 1 },
    { id: 'p.laba', title: '腊八', emoji: '🥣', kind: 'yearly', calendar: 'lunar', m: 12, d: 8 },
    { id: 'p.pingan', title: '平安夜', emoji: '🎄', kind: 'yearly', calendar: 'solar', m: 12, d: 24 },
    { id: 'p.shengdan', title: '圣诞节', emoji: '🎁', kind: 'yearly', calendar: 'solar', m: 12, d: 25 },
    { id: 'p.zhouliu', title: '周六', emoji: '🛋️', kind: 'weekly', weekday: 6 },
    { id: 'p.zhouri', title: '周日', emoji: '☕', kind: 'weekly', weekday: 0 }
  ];

  // 第一次打开时预置的自定义条目
  var SEED_ITEMS = [
    {
      id: 'seed.zaiyiqi', title: '在一起', emoji: '💞',
      kind: 'countup', calendar: 'solar', y: 2021, m: 2, d: 14,
      note: '2021 年 2 月 14 日'
    },
    {
      id: 'seed.jinian', title: '恋爱纪念日', emoji: '💍',
      kind: 'yearly', calendar: 'solar', y: 2021, m: 2, d: 14
    }
  ];

  function startOfToday() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  function daysBetween(a, b) {
    return Lunar.toDayNumber(b) - Lunar.toDayNumber(a);
  }

  function nextSolarYearly(m, d, from) {
    var y0 = from.getFullYear();
    for (var y = y0; y <= y0 + 8; y++) {
      var dd = d;
      if (m === 2 && d === 29 && !isLeapYear(y)) dd = 28; // 闰年生日，平年过 2 月 28
      var cand = new Date(y, m - 1, dd);
      if (daysBetween(from, cand) >= 0) return cand;
    }
    return null;
  }

  function nextLunarYearly(m, d, isLeap, from) {
    var lu = Lunar.solarToLunar(from);
    if (!lu) return null;
    for (var y = lu.year; y <= lu.year + 8 && y <= Lunar.MAX_YEAR; y++) {
      var cand = Lunar.lunarToSolar(y, m, d, isLeap);
      if (cand && daysBetween(from, cand) >= 0) return { date: cand, lunarYear: y };
    }
    return null;
  }

  function nextWeekday(weekday, from) {
    var delta = (weekday - from.getDay() + 7) % 7;
    return new Date(from.getFullYear(), from.getMonth(), from.getDate() + delta);
  }

  /* 算出一个条目的下一次发生。返回：
       date      公历 Date
       daysLeft  还有几天（0 = 就是今天；countup 时为负，表示已经过去多少天）
       ordinal   第几个（知道起始年份的 yearly 才有）
       lunarText 农历写法，比如「八月十五」*/
  function resolve(item, from) {
    from = from || startOfToday();
    var out = { item: item, date: null, daysLeft: null, ordinal: null, lunarText: '' };

    if (item.kind === 'weekly') {
      out.date = nextWeekday(item.weekday, from);
      out.daysLeft = daysBetween(from, out.date);
    } else if (item.kind === 'once') {
      out.date = new Date(item.y, item.m - 1, item.d);
      if (item.calendar === 'lunar') {
        var solar = Lunar.lunarToSolar(item.y, item.m, item.d, item.isLeap);
        if (solar) out.date = solar;
      }
      out.daysLeft = daysBetween(from, out.date);
    } else if (item.kind === 'countup') {
      var origin = item.calendar === 'lunar'
        ? Lunar.lunarToSolar(item.y, item.m, item.d, item.isLeap)
        : new Date(item.y, item.m - 1, item.d);
      out.date = origin;
      out.daysLeft = origin ? daysBetween(from, origin) : null; // 负数
    } else { // yearly
      if (item.calendar === 'lunar') {
        var hit = nextLunarYearly(item.m, item.d, item.isLeap, from);
        if (hit) {
          out.date = hit.date;
          if (item.y) out.ordinal = hit.lunarYear - item.y;
        }
      } else {
        out.date = nextSolarYearly(item.m, item.d, from);
        if (out.date && item.y) out.ordinal = out.date.getFullYear() - item.y;
      }
      if (out.date) out.daysLeft = daysBetween(from, out.date);
    }

    if (out.date) {
      var l = Lunar.solarToLunar(out.date);
      if (l) out.lunarText = l.monthName + l.dayName;
    }
    return out;
  }

  function formatSolar(date) {
    return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日';
  }

  function weekdayName(date) {
    return WEEKDAYS[date.getDay()];
  }

  /* 条目本身写的是哪一天 —— 卡片副标题用。
     农历条目要显示「农历八月十五」而不是换算后的公历。*/
  function sourceText(item) {
    if (item.kind === 'weekly') return '每周' + WEEKDAYS[item.weekday].slice(1);
    if (item.calendar === 'lunar') {
      return '农历' + Lunar.monthName(item.m, item.isLeap) + Lunar.dayName(item.d);
    }
    return item.m + '月' + item.d + '日';
  }

  root.Days = {
    PRESETS: PRESETS,
    SEED_ITEMS: SEED_ITEMS,
    WEEKDAYS: WEEKDAYS,
    startOfToday: startOfToday,
    daysBetween: daysBetween,
    resolve: resolve,
    formatSolar: formatSolar,
    weekdayName: weekdayName,
    sourceText: sourceText
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.Days;
