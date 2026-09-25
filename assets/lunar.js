/* 农历换算 —— 支持 1900-2100 年。
   数据表每一项压缩了一个农历年：
     低 4 位   = 闰月月份（0 表示这年没有闰月）
     第 5-16 位 = 十二个月的大小月（1 = 30 天，0 = 29 天）
     第 17 位  = 闰月是大月还是小月
   基准：1900-01-31 是农历 1900 年正月初一。*/
(function (root) {
  'use strict';

  var LUNAR_INFO = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970-1979
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
    0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
    0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
    0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
    0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
    0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
    0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
    0x0d520 // 2100
  ];

  var MIN_YEAR = 1900;
  var MAX_YEAR = 2100;
  var DAY_MS = 86400000;
  var BASE_DAY = Date.UTC(1900, 0, 31) / DAY_MS; // 农历 1900 正月初一

  var MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
  var DAY_TENS = ['初', '十', '廿', '三'];
  var DAY_UNITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  var ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

  function info(y) {
    return LUNAR_INFO[y - MIN_YEAR];
  }

  // 这一年的闰月是几月，0 表示没有闰月
  function leapMonth(y) {
    return info(y) & 0xf;
  }

  // 闰月有多少天
  function leapDays(y) {
    if (!leapMonth(y)) return 0;
    return (info(y) & 0x10000) ? 30 : 29;
  }

  // 第 m 个普通月有多少天
  function monthDays(y, m) {
    return (info(y) & (0x10000 >> m)) ? 30 : 29;
  }

  // 整个农历年有多少天
  function yearDays(y) {
    var sum = 348; // 12 个月先按 29 天算
    for (var i = 0x8000; i > 0x8; i >>= 1) {
      if (info(y) & i) sum += 1;
    }
    return sum + leapDays(y);
  }

  function monthName(m, isLeap) {
    return (isLeap ? '闰' : '') + MONTH_NAMES[m - 1] + '月';
  }

  function dayName(d) {
    if (d === 10) return '初十';
    if (d === 20) return '二十';
    if (d === 30) return '三十';
    return DAY_TENS[Math.floor(d / 10)] + DAY_UNITS[(d % 10) - 1];
  }

  // 把本地日期压成「天序号」，避开时区和夏令时的影响
  function toDayNumber(date) {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
  }

  function fromDayNumber(n) {
    var d = new Date(n * DAY_MS);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function solarToLunar(date) {
    var offset = toDayNumber(date) - BASE_DAY;
    if (offset < 0) return null;

    var y = MIN_YEAR;
    var temp = 0;
    for (; y <= MAX_YEAR && offset > 0; y++) {
      temp = yearDays(y);
      offset -= temp;
    }
    if (offset < 0) {
      offset += temp;
      y--;
    }
    if (y > MAX_YEAR) return null;

    var leap = leapMonth(y);
    var isLeap = false;
    var m = 1;
    for (; m < 13 && offset > 0; m++) {
      if (leap > 0 && m === leap + 1 && !isLeap) {
        m--;
        isLeap = true;
        temp = leapDays(y);
      } else {
        temp = monthDays(y, m);
      }
      if (isLeap && m === leap + 1) isLeap = false;
      offset -= temp;
    }
    // 正好落在闰月第一天
    if (offset === 0 && leap > 0 && m === leap + 1) {
      if (isLeap) {
        isLeap = false;
      } else {
        isLeap = true;
        m--;
      }
    }
    if (offset < 0) {
      offset += temp;
      m--;
    }

    return {
      year: y,
      month: m,
      day: offset + 1,
      isLeap: isLeap,
      monthName: monthName(m, isLeap),
      dayName: dayName(offset + 1),
      zodiac: ZODIAC[(y - 4) % 12]
    };
  }

  // 农历 -> 公历。日期在那年不存在时（例如没有三十的腊月）退回当月最后一天。
  function lunarToSolar(y, m, d, isLeap) {
    if (y < MIN_YEAR || y > MAX_YEAR) return null;

    var leap = leapMonth(y);
    var wantLeap = !!isLeap && leap === m;

    var available = wantLeap ? leapDays(y) : monthDays(y, m);
    var day = Math.min(d, available);

    var offset = 0;
    for (var i = MIN_YEAR; i < y; i++) offset += yearDays(i);
    for (var j = 1; j < m; j++) offset += monthDays(y, j);
    if (leap > 0 && leap < m) offset += leapDays(y);   // 前面隔着一个闰月
    if (wantLeap) offset += monthDays(y, m);            // 闰 m 月排在 m 月之后
    offset += day - 1;

    return fromDayNumber(BASE_DAY + offset);
  }

  root.Lunar = {
    MIN_YEAR: MIN_YEAR,
    MAX_YEAR: MAX_YEAR,
    solarToLunar: solarToLunar,
    lunarToSolar: lunarToSolar,
    leapMonth: leapMonth,
    leapDays: leapDays,
    monthDays: monthDays,
    yearDays: yearDays,
    monthName: monthName,
    dayName: dayName,
    toDayNumber: toDayNumber,
    fromDayNumber: fromDayNumber
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.Lunar;
