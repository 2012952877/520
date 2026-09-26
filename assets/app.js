/* 页面逻辑：飘心、在一起的计时、倒数日、回忆。
   所有用户写的字都用 textContent 放进 DOM，不拼 HTML —— token 存在
   localStorage 里，页面上任何一处 innerHTML 都可能把它交出去。*/
(function () {
  'use strict';

  var Lunar = window.Lunar;
  var Days = window.Days;
  var Store = window.Store;

  var DAYS_PATH = 'data/countdowns.json';
  var NOTES_PATH = 'data/memories.json';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state = {
    days: { version: 1, items: [], hiddenPresets: [] },
    notes: { version: 1, items: [] },
    view: 'home',
    editingDay: null,
    editingNote: null,
    draftPics: [],        // 正在编辑的这篇的图片 [{path, url, busy}]
    localPics: {}         // path -> objectURL，刚传上去的图 Pages 还没发布，先用本地这份
  };

  var $ = function (id) { return document.getElementById(id); };

  // ───────────────────────── 飘心 ─────────────────────────

  var canvas = $('hearts');
  var ctx = canvas.getContext('2d');
  var ww, wh, hearts = [], maxHearts, lastSpawn = 0, frame = 0, ambient = 2;

  function sizeCanvas() {
    ww = window.innerWidth;
    wh = window.innerHeight;
    var ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(ww * ratio);
    canvas.height = Math.round(wh * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function heartSprite() {
    var s = document.createElement('canvas');
    var c = s.getContext('2d');
    s.width = s.height = 96;
    c.translate(48, 48);
    c.scale(1.35, 1.35);
    c.fillStyle = '#ff5964';
    c.shadowBlur = 14;
    c.shadowColor = 'rgba(255,70,80,.75)';
    c.beginPath();
    for (var i = 0; i <= 40; i++) {
      var t = (i / 40 - 0.5) * Math.PI * 2;
      var x = 15 * Math.pow(Math.sin(t), 3);
      var y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath();
    c.fill();
    return s;
  }
  var sprite = heartSprite();

  function Heart(x, y) {
    this.x = typeof x === 'number' ? x : Math.random() * ww;
    this.y = typeof y === 'number' ? y : Math.random() * wh;
    this.size = Math.random() * 36 + 28;
    this.sx = (Math.random() - 0.5) * 4;
    this.sy = (Math.random() - 0.5) * 4;
    this.life = 1;
    this.fade = Math.random() * 0.012 + 0.008;
  }

  function addHeart(x, y) {
    if (hearts.length >= maxHearts) hearts.shift();
    hearts.push(new Heart(x, y));
  }

  function render() {
    requestAnimationFrame(render);
    if (document.hidden) return;
    frame++;
    if (ambient && frame % ambient === 0) addHeart();
    ctx.clearRect(0, 0, ww, wh);
    for (var i = 0; i < hearts.length; i++) {
      var h = hearts[i];
      h.x += h.sx;
      h.y += h.sy;
      h.life -= h.fade;
      var d = h.size * Math.max(h.life, 0);
      ctx.globalAlpha = Math.min(h.life * 1.4, 1);
      ctx.drawImage(sprite, h.x - d / 2, h.y - d / 2, d, d);
      if (h.life <= 0) { hearts.splice(i, 1); i--; }
    }
    ctx.globalAlpha = 1;
  }

  function startHearts() {
    sizeCanvas();
    maxHearts = window.matchMedia('(max-width: 600px)').matches ? 55 : 90;
    window.addEventListener('resize', sizeCanvas);

    if (reduceMotion) {           // 不想看动画的人，留一层静止的底纹
      ctx.globalAlpha = 0.22;
      for (var i = 0; i < 26; i++) {
        var s = Math.random() * 30 + 26;
        ctx.drawImage(sprite, Math.random() * ww - s / 2, Math.random() * wh - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      return;
    }
    window.addEventListener('pointermove', function (e) {
      var now = performance.now();
      if (now - lastSpawn < 24) return;
      lastSpawn = now;
      addHeart(e.clientX, e.clientY);
      addHeart(e.clientX, e.clientY);
    }, { passive: true });
    requestAnimationFrame(render);
  }

  // ───────────────────────── 在一起多久了 ─────────────────────────

  var START = new Date(2021, 1, 14, 0, 0, 0);
  var clockEls = { day: $('c-day'), hour: $('c-hour'), min: $('c-min'), sec: $('c-sec') };

  function tickClock() {
    var t = Math.floor((Date.now() - START.getTime()) / 1000);
    if (t < 0) t = 0;
    set(clockEls.day, Math.floor(t / 86400));
    set(clockEls.hour, Math.floor(t / 3600) % 24);
    set(clockEls.min, Math.floor(t / 60) % 60);
    set(clockEls.sec, t % 60);
  }
  function set(el, v) {
    var s = String(v);
    if (el.textContent !== s) el.textContent = s;
  }

  // ───────────────────────── 小工具 ─────────────────────────

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  var toastTimer;
  function toast(msg, bad) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.toggle('is-bad', !!bad);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, bad ? 5200 : 3200);
  }

  function uid(p) {
    return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseIso(s) {
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  // ───────────────────────── 视图切换 ─────────────────────────

  var VIEWS = { home: 'view-home', days: 'view-days', notes: 'view-notes' };

  function go(name, push) {
    if (!VIEWS[name]) name = 'home';
    state.view = name;
    Object.keys(VIEWS).forEach(function (k) { $(VIEWS[k]).hidden = k !== name; });
    document.querySelectorAll('.nav__tab').forEach(function (b) {
      b.classList.toggle('is-on', b.dataset.go === name);
    });
    ambient = name === 'home' ? 2 : 9;   // 读东西的时候少飘一点
    if (push !== false) {
      var hash = name === 'home' ? ' ' : '#' + name;
      if (location.hash !== hash) history.pushState(null, '', name === 'home' ? location.pathname : hash);
    }
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('.nav__tab').forEach(function (b) {
    b.addEventListener('click', function () { go(b.dataset.go); });
  });
  window.addEventListener('popstate', function () {
    go((location.hash || '').replace('#', '') || 'home', false);
  });

  // ───────────────────────── 弹层 ─────────────────────────

  function openDlg(id) { $(id).showModal(); }
  function closeDlg(id) { $(id).close(); }

  document.querySelectorAll('dialog').forEach(function (d) {
    d.addEventListener('click', function (e) {   // 点框外关掉
      if (e.target === d) d.close();
    });
    d.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { d.close(); });
    });
  });

  // ───────────────────────── 倒数日 ─────────────────────────

  function visibleDayItems() {
    var hidden = state.days.hiddenPresets || [];
    var presets = Days.PRESETS.filter(function (p) { return hidden.indexOf(p.id) < 0; })
      .map(function (p) { var c = Object.assign({}, p); c.preset = true; return c; });
    return presets.concat(state.days.items || []);
  }

  function numParts(r) {
    if (r.item.kind === 'countup') {
      return { text: String(Math.abs(r.daysLeft)), unit: '天', word: false, lead: '已经' };
    }
    if (r.daysLeft === 0) return { text: '就在今天', word: true };
    if (r.daysLeft === 1) return { text: '明天', word: true };
    return { text: String(r.daysLeft), unit: '天', word: false };
  }

  function whenText(r) {
    var bits = [];
    if (r.item.kind === 'weekly') {
      bits.push(Days.formatSolar(r.date) + ' ' + Days.weekdayName(r.date));
    } else if (r.item.kind === 'countup') {
      bits.push('从 ' + Days.formatSolar(r.date) + ' 起');
    } else {
      bits.push(Days.formatSolar(r.date) + ' ' + Days.weekdayName(r.date));
    }
    if (r.item.calendar === 'lunar' && r.item.kind !== 'weekly') bits.push('农历' + r.lunarText);
    if (r.ordinal != null && r.ordinal > 0) bits.push('第 ' + r.ordinal + ' 年');
    return bits;
  }

  function renderDays() {
    var today = Days.startOfToday();
    $('days-today').textContent = (function () {
      var l = Lunar.solarToLunar(today);
      return '今天 ' + Days.formatSolar(today) + ' ' + Days.weekdayName(today) +
        (l ? ' · 农历' + l.monthName + l.dayName : '');
    })();

    var resolved = visibleDayItems().map(function (it) { return Days.resolve(it, today); })
      .filter(function (r) { return r.date && r.daysLeft != null; });

    var counts = resolved.filter(function (r) { return r.item.kind === 'countup'; });
    var downs = resolved.filter(function (r) { return r.item.kind !== 'countup'; })
      .sort(function (a, b) { return a.daysLeft - b.daysLeft; });

    var featureBox = $('days-feature');
    var listBox = $('days-list');
    clear(featureBox);
    clear(listBox);

    if (!downs.length && !counts.length) {
      var e = el('div', 'empty');
      e.appendChild(el('b', null, '还没有要数的日子'));
      e.appendChild(document.createTextNode('生日、纪念日、你们自己的节日，都可以记进来。'));
      listBox.appendChild(e);
      return;
    }

    if (downs.length) featureBox.appendChild(calCard(downs[0]));

    var rest = downs.slice(1).concat(counts);
    if (rest.length) {
      var rows = el('div', 'rows');
      rest.forEach(function (r) { rows.appendChild(dayRow(r)); });
      listBox.appendChild(rows);
    }
  }

  function calCard(r) {
    var editable = !r.item.preset;
    var card = el(editable ? 'button' : 'div', 'cal');
    if (editable) {
      card.type = 'button';
      card.addEventListener('click', function () { openDayForm(r.item); });
    }

    var name = el('div', 'cal__name');
    if (r.item.emoji) name.appendChild(el('i', null, r.item.emoji));
    name.appendChild(document.createTextNode(r.item.title));
    card.appendChild(name);

    var n = numParts(r);
    var num = el('div', 'cal__num' + (n.word ? ' is-word' : ''));
    if (n.lead) num.appendChild(el('small', null, n.lead));
    num.appendChild(document.createTextNode(n.text));
    if (n.unit) num.appendChild(el('small', null, n.unit));
    card.appendChild(num);

    var when = el('div', 'cal__when');
    whenText(r).forEach(function (b, i) {
      if (i) when.appendChild(document.createTextNode(' · '));
      when.appendChild(i === 0 ? document.createTextNode(b) : el('em', null, b));
    });
    card.appendChild(when);

    if (r.item.note) card.appendChild(el('div', 'cal__note', r.item.note));
    return card;
  }

  function dayRow(r) {
    var editable = !r.item.preset;
    var row = el(editable ? 'button' : 'div', 'row');
    if (editable) {
      row.type = 'button';
      row.addEventListener('click', function () { openDayForm(r.item); });
    }

    row.appendChild(el('span', 'row__emoji', r.item.emoji || '·'));

    var main = el('div', 'row__main');
    main.appendChild(el('div', 'row__name', r.item.title));
    main.appendChild(el('div', 'row__when', whenText(r).join(' · ')));
    row.appendChild(main);

    var n = numParts(r);
    var num = el('div', 'row__num' + (n.word ? ' is-word' : ''));
    if (n.lead) num.appendChild(el('small', null, n.lead));  // 往上数的日子要和「还有几天」区分开
    num.appendChild(document.createTextNode(n.text));
    if (n.unit) num.appendChild(el('small', null, n.unit));
    row.appendChild(num);
    return row;
  }

  // ── 倒数日表单 ──

  function fillLunarSelects() {
    var lm = $('f-lm'), ld = $('f-ld');
    for (var m = 1; m <= 12; m++) lm.appendChild(new Option(Lunar.monthName(m, false), String(m)));
    for (var d = 1; d <= 30; d++) ld.appendChild(new Option(Lunar.dayName(d), String(d)));
    var wk = $('f-week');
    Days.WEEKDAYS.forEach(function (name, i) {
      var lab = el('label', 'chip');
      var inp = document.createElement('input');
      inp.type = 'radio'; inp.name = 'weekday'; inp.value = String(i);
      if (i === 6) inp.checked = true;
      lab.appendChild(inp);
      lab.appendChild(el('span', null, name));
      wk.appendChild(lab);
    });
  }

  function kindOf() {
    var c = document.querySelector('#f-kind input:checked');
    return c ? c.value : 'yearly';
  }
  function calOf() {
    var c = document.querySelector('#f-cal input:checked');
    return c ? c.value : 'solar';
  }

  /* 藏起来的输入框要一起 disable，否则 required 会挡住提交 */
  function setGroup(wrap, on) {
    wrap.hidden = !on;
    wrap.querySelectorAll('input,select').forEach(function (i) { i.disabled = !on; });
  }

  function syncDayForm() {
    var kind = kindOf();
    var cal = calOf();
    var weekly = kind === 'weekly';
    var needYear = kind === 'once' || kind === 'countup';

    setGroup($('f-week-wrap'), weekly);
    setGroup($('f-cal-wrap'), !weekly);
    $('f-date-wrap').hidden = weekly;

    setGroup($('f-solar-row'), !weekly && cal === 'solar');
    setGroup($('f-lunar-row'), !weekly && cal === 'lunar');

    $('f-y').required = needYear;
    $('f-ly').required = needYear;
    $('f-date-hint').textContent = needYear
      ? '这一种要填年份。'
      : '生日不想让人知道年份，年可以空着；填了就会显示「第几年」。';
  }

  document.querySelectorAll('#f-kind input,#f-cal input').forEach(function (i) {
    i.addEventListener('change', syncDayForm);
  });

  function openDayForm(item) {
    state.editingDay = item || null;
    $('dlg-day-title').textContent = item ? '改一改' : '记一个日子';
    $('day-delete').hidden = !item;
    $('day-err').hidden = true;

    var f = {
      title: $('f-title'), emoji: $('f-emoji'), note: $('f-note'),
      y: $('f-y'), m: $('f-m'), d: $('f-d'),
      ly: $('f-ly'), lm: $('f-lm'), ld: $('f-ld'), leap: $('f-leap')
    };
    f.title.value = item ? item.title : '';
    f.emoji.value = item ? (item.emoji || '') : '';
    f.note.value = item ? (item.note || '') : '';

    var kind = item ? item.kind : 'yearly';
    var cal = item ? (item.calendar || 'solar') : 'solar';
    var kr = document.querySelector('#f-kind input[value="' + kind + '"]');
    if (kr) kr.checked = true;
    var cr = document.querySelector('#f-cal input[value="' + cal + '"]');
    if (cr) cr.checked = true;

    if (item && item.kind === 'weekly') {
      var wr = document.querySelector('#f-week input[value="' + item.weekday + '"]');
      if (wr) wr.checked = true;
    }

    f.y.value = item && item.y && cal === 'solar' ? item.y : '';
    f.m.value = item && cal === 'solar' ? item.m : '';
    f.d.value = item && cal === 'solar' ? item.d : '';
    f.ly.value = item && item.y && cal === 'lunar' ? item.y : '';
    f.lm.value = item && cal === 'lunar' ? String(item.m) : '1';
    f.ld.value = item && cal === 'lunar' ? String(item.d) : '1';
    f.leap.checked = !!(item && item.isLeap);

    syncDayForm();
    openDlg('dlg-day');
    setTimeout(function () { f.title.focus(); }, 30);
  }

  $('days-add').addEventListener('click', function () { openDayForm(null); });

  $('form-day').addEventListener('submit', function (e) {
    e.preventDefault();
    var kind = kindOf();
    var cal = kind === 'weekly' ? 'solar' : calOf();

    var item = {
      id: state.editingDay ? state.editingDay.id : uid('c.'),
      title: $('f-title').value.trim(),
      emoji: $('f-emoji').value.trim(),
      note: $('f-note').value.trim(),
      kind: kind,
      calendar: cal
    };
    if (!item.title) return showErr('day-err', '总得有个名字。');

    if (kind === 'weekly') {
      var w = document.querySelector('#f-week input:checked');
      item.weekday = w ? +w.value : 6;
    } else if (cal === 'lunar') {
      item.y = $('f-ly').value ? +$('f-ly').value : null;
      item.m = +$('f-lm').value;
      item.d = +$('f-ld').value;
      item.isLeap = $('f-leap').checked;
    } else {
      item.y = $('f-y').value ? +$('f-y').value : null;
      item.m = +$('f-m').value;
      item.d = +$('f-d').value;
      if (item.m < 1 || item.m > 12) return showErr('day-err', '月份要在 1 到 12 之间。');
      var maxD = new Date(item.y || 2024, item.m, 0).getDate();
      if (item.d < 1 || item.d > maxD) return showErr('day-err', (item.y ? item.y + '年' : '') + item.m + '月没有 ' + item.d + ' 号。');
    }

    var check = Days.resolve(item, Days.startOfToday());
    if (!check.date) return showErr('day-err', '这个日子算不出来，检查一下年月日。');

    var list = state.days.items.slice();
    var at = list.findIndex(function (x) { return x.id === item.id; });
    if (at >= 0) list[at] = item; else list.push(item);
    state.days.items = list;

    closeDlg('dlg-day');
    renderDays();
    persistDays(at >= 0 ? '改了倒数日：' + item.title : '加了倒数日：' + item.title);
  });

  $('day-delete').addEventListener('click', function () {
    if (!state.editingDay) return;
    var t = state.editingDay.title;
    state.days.items = state.days.items.filter(function (x) { return x.id !== state.editingDay.id; });
    closeDlg('dlg-day');
    renderDays();
    persistDays('删掉倒数日：' + t);
  });

  function showErr(id, msg) {
    var n = $(id);
    n.textContent = msg;
    n.hidden = false;
  }

  function persistDays(msg) {
    if (!Store.canWrite()) {
      toast('没填 token，这条只留在这台设备上', true);
      return;
    }
    Store.saveJSON(DAYS_PATH, state.days, msg)
      .then(function () { toast('存好了'); })
      .catch(function (err) { toast('没存上：' + err.message, true); });
  }

  // ── 内置节日开关 ──

  var presetsBefore = '';

  $('days-presets').addEventListener('click', function () {
    var box = $('presets-list');
    clear(box);
    var hidden = state.days.hiddenPresets || [];
    presetsBefore = hidden.slice().sort().join(',');
    Days.PRESETS.forEach(function (p) {
      var lab = el('label', 'chip');
      var inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.checked = hidden.indexOf(p.id) < 0;
      inp.addEventListener('change', function () {
        var h = state.days.hiddenPresets.filter(function (x) { return x !== p.id; });
        if (!inp.checked) h.push(p.id);
        state.days.hiddenPresets = h;
        renderDays();
      });
      lab.appendChild(inp);
      lab.appendChild(el('span', null, (p.emoji ? p.emoji + ' ' : '') + p.title));
      box.appendChild(lab);
    });
    openDlg('dlg-presets');
  });

  // 没动过就别提交，否则开一次关一次就是一个空 commit
  $('dlg-presets').addEventListener('close', function () {
    var now = (state.days.hiddenPresets || []).slice().sort().join(',');
    if (now !== presetsBefore) persistDays('调整了节日显示');
  });

  // ───────────────────────── 回忆 ─────────────────────────

  function picSrc(path) {
    return state.localPics[path] || path;
  }

  /* 刚提交的图，Pages 还没发布完，先留个空位，过一会儿自己重试 */
  function picEl(path, cls) {
    var img = document.createElement('img');
    if (cls) img.className = cls;
    img.loading = 'lazy';
    img.alt = '';
    img.src = picSrc(path);
    var tries = 0;
    img.addEventListener('error', function () {
      if (state.localPics[path] || tries >= 4) return;
      tries++;
      setTimeout(function () { img.src = path + '?_=' + Date.now(); }, tries * 15000);
    });
    return img;
  }

  function renderNotes() {
    var box = $('notes-list');
    clear(box);

    var items = (state.notes.items || []).slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || '') > (a.createdAt || '') ? 1 : -1;
    });

    if (!items.length) {
      var e = el('div', 'empty');
      e.appendChild(el('b', null, '这里还是空的'));
      e.appendChild(document.createTextNode('今天吃了什么、去了哪儿、谁又说了句什么话，都可以写下来。'));
      box.appendChild(e);
      return;
    }

    var lastYear = null;
    items.forEach(function (n) {
      var d = parseIso(n.date);
      var y = d.getFullYear();
      if (y !== lastYear) {
        lastYear = y;
        box.appendChild(el('div', 'year', y + ' 年'));
      }
      box.appendChild(noteCard(n, d));
    });
  }

  function noteCard(n, d) {
    var card = el('button', 'note');
    card.type = 'button';
    card.addEventListener('click', function () { openRead(n); });

    var l = Lunar.solarToLunar(d);
    var date = el('div', 'note__date');
    date.appendChild(document.createTextNode(
      (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + Days.weekdayName(d)));
    if (l) {
      date.appendChild(document.createTextNode(' · '));
      date.appendChild(el('em', null, '农历' + l.monthName + l.dayName));
    }
    card.appendChild(date);

    card.appendChild(el('div', 'note__title', n.title));
    if (n.text) card.appendChild(el('p', 'note__text', n.text));

    if (n.images && n.images.length) {
      var pics = el('div', 'note__pics');
      n.images.slice(0, 4).forEach(function (p) { pics.appendChild(picEl(p)); });
      if (n.images.length > 4) {
        pics.appendChild(el('span', 'note__more', '还有 ' + (n.images.length - 4) + ' 张'));
      }
      card.appendChild(pics);
    }
    return card;
  }

  function openRead(n) {
    var body = $('read-body');
    clear(body);

    var d = parseIso(n.date);
    var l = Lunar.solarToLunar(d);
    var date = el('div', 'read__date');
    date.appendChild(document.createTextNode(Days.formatSolar(d) + ' ' + Days.weekdayName(d)));
    if (l) {
      date.appendChild(document.createTextNode(' · '));
      date.appendChild(el('em', null, '农历' + l.monthName + l.dayName));
    }
    body.appendChild(date);
    body.appendChild(el('h3', 'read__title', n.title));
    if (n.text) body.appendChild(el('p', 'read__text', n.text));

    if (n.images && n.images.length) {
      var pics = el('div', 'read__pics');
      n.images.forEach(function (p) { pics.appendChild(picEl(p)); });
      body.appendChild(pics);
    }

    var edit = $('read-edit');
    edit.hidden = !Store.canWrite();
    edit.onclick = function () {
      closeDlg('dlg-read');
      setTimeout(function () { openNoteForm(n); }, 60);
    };
    openDlg('dlg-read');
  }

  // ── 写 / 改一篇 ──

  function openNoteForm(n) {
    state.editingNote = n || null;
    state.draftPics = n ? (n.images || []).map(function (p) { return { path: p, busy: false }; }) : [];

    $('dlg-note-title').textContent = n ? '改一改' : '写一篇';
    $('n-date').value = n ? n.date : isoOf(new Date());
    $('n-title').value = n ? n.title : '';
    $('n-text').value = n ? (n.text || '') : '';
    $('note-delete').hidden = !n;
    $('note-err').hidden = true;
    $('n-files').value = '';
    renderThumbs();
    openDlg('dlg-note');
    setTimeout(function () { $('n-title').focus(); }, 30);
  }

  $('notes-add').addEventListener('click', function () {
    if (!Store.canWrite()) {
      toast('要先在设置里填一个 token 才能写', true);
      openDlg('dlg-settings');
      return;
    }
    openNoteForm(null);
  });

  function renderThumbs() {
    var box = $('n-thumbs');
    clear(box);
    state.draftPics.forEach(function (p, i) {
      var t = el('div', 'thumb' + (p.busy ? ' is-busy' : ''));
      t.appendChild(picEl(p.path));
      var x = el('button', null, '×');
      x.type = 'button';
      x.setAttribute('aria-label', '去掉这张');
      x.addEventListener('click', function () {
        state.draftPics.splice(i, 1);
        renderThumbs();
      });
      t.appendChild(x);
      box.appendChild(t);
    });
  }

  /* 压到长边 1600 以内再传，一张大概 200-400KB */
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        var k = Math.min(1, 1600 / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
        var c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(img, 0, 0, cw, ch);
        c.toBlob(function (b) {
          if (b) resolve(b); else reject(new Error('这张图处理不了'));
        }, 'image/jpeg', 0.82);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('这张图打不开'));
      };
      img.src = url;
    });
  }

  $('n-files').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    files.forEach(uploadOne);
  });

  function uploadOne(file) {
    var path = 'data/images/' + uid('') + '.jpg';
    var entry = { path: path, busy: true };
    state.draftPics.push(entry);
    renderThumbs();

    shrink(file).then(function (blob) {
      state.localPics[path] = URL.createObjectURL(blob);
      renderThumbs();
      return blob.arrayBuffer();
    }).then(function (buf) {
      return Store.saveBinary(path, new Uint8Array(buf), '传了张图');
    }).then(function () {
      entry.busy = false;
      renderThumbs();
    }).catch(function (err) {
      var i = state.draftPics.indexOf(entry);
      if (i >= 0) state.draftPics.splice(i, 1);
      renderThumbs();
      showErr('note-err', '图没传上去：' + err.message);
    });
  }

  $('form-note').addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.draftPics.some(function (p) { return p.busy; })) {
      return showErr('note-err', '还有图在传，等一下下。');
    }
    var n = {
      id: state.editingNote ? state.editingNote.id : uid('m.'),
      date: $('n-date').value,
      title: $('n-title').value.trim(),
      text: $('n-text').value,
      images: state.draftPics.map(function (p) { return p.path; }),
      createdAt: state.editingNote ? state.editingNote.createdAt : new Date().toISOString()
    };
    if (!n.date) return showErr('note-err', '选一个日子。');
    if (!n.title) return showErr('note-err', '给它起个标题。');

    var list = state.notes.items.slice();
    var at = list.findIndex(function (x) { return x.id === n.id; });

    if (at >= 0) {   // 改的时候被去掉的图，顺手从仓库里删掉
      (list[at].images || []).forEach(function (p) {
        if (n.images.indexOf(p) < 0) Store.deleteFile(p, '去掉一张图');
      });
      list[at] = n;
    } else {
      list.push(n);
    }
    state.notes.items = list;

    closeDlg('dlg-note');
    renderNotes();
    Store.saveJSON(NOTES_PATH, state.notes, (at >= 0 ? '改了回忆：' : '写了篇回忆：') + n.title)
      .then(function () { toast('存好了，别的设备大概一分钟后能看到'); })
      .catch(function (err) { toast('没存上：' + err.message, true); });
  });

  $('note-delete').addEventListener('click', function () {
    var n = state.editingNote;
    if (!n) return;
    state.notes.items = state.notes.items.filter(function (x) { return x.id !== n.id; });
    (n.images || []).forEach(function (p) { Store.deleteFile(p, '删掉一张图'); });
    closeDlg('dlg-note');
    renderNotes();
    Store.saveJSON(NOTES_PATH, state.notes, '删掉回忆：' + n.title)
      .then(function () { toast('删掉了'); })
      .catch(function (err) { toast('没删掉：' + err.message, true); });
  });

  // ───────────────────────── 设置 ─────────────────────────

  function syncSettings() {
    var on = Store.canWrite();
    $('set-state').textContent = on
      ? '已经连上了，改动会提交到 ' + Store.owner + '/' + Store.repo + '。'
      : '现在是只读。填一个 token 就能新增和修改。';
    $('set-token').value = '';
    $('set-token').placeholder = on ? '已保存，要换就填新的' : 'github_pat_…';
    $('set-forget').hidden = !on;
    $('set-test').hidden = !on;
    $('set-err').hidden = true;
    document.body.classList.toggle('can-write', on);
  }

  $('open-settings').addEventListener('click', function () {
    syncSettings();
    openDlg('dlg-settings');
  });

  $('set-save').addEventListener('click', function () {
    var t = $('set-token').value.trim();
    if (!t) return showErr('set-err', '把 token 粘进来。');
    var btn = $('set-save');
    btn.disabled = true;
    btn.textContent = '验一下…';
    Store.verifyToken(t).then(function () {
      Store.setToken(t);
      btn.disabled = false;
      btn.textContent = '存下来';
      closeDlg('dlg-settings');
      syncSettings();
      toast('连上了，现在可以写东西了');
      return loadAll();
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = '存下来';
      showErr('set-err', err.message);
    });
  });

  // 拿已经存着的 token 探一次写权限，省得靠「写一篇试试」才知道通没通
  $('set-test').addEventListener('click', function () {
    var b = $('set-test');
    b.disabled = true;
    b.textContent = '测试中…';
    $('set-err').hidden = true;
    Store.verifyToken(Store.getToken()).then(function () {
      toast('通了，现在能写');
    }).catch(function (err) {
      showErr('set-err', err.message);
    }).then(function () {
      b.disabled = false;
      b.textContent = '测一下';
    });
  });

  $('set-forget').addEventListener('click', function () {
    Store.setToken('');
    syncSettings();
    toast('已经忘掉了，现在只能看');
  });

  // ───────────────────────── 开张 ─────────────────────────

  function loadAll() {
    var a = Store.loadJSON(DAYS_PATH, null).then(function (r) {
      if (r.data && r.data.items) {
        state.days = {
          version: 1,
          items: r.data.items || [],
          hiddenPresets: r.data.hiddenPresets || []
        };
      } else {
        state.days = { version: 1, items: Days.SEED_ITEMS.slice(), hiddenPresets: [] };
      }
      renderDays();
    });

    var b = Store.loadJSON(NOTES_PATH, null).then(function (r) {
      state.notes = { version: 1, items: (r.data && r.data.items) || [] };
      renderNotes();
    });

    return Promise.all([a, b]);
  }

  fillLunarSelects();
  syncSettings();
  startHearts();
  tickClock();
  setInterval(tickClock, 1000);

  renderDays();
  renderNotes();
  loadAll();

  // 跨过午夜要重新算「还有几天」
  var todayIso = isoOf(new Date());
  setInterval(function () {
    var now = isoOf(new Date());
    if (now !== todayIso) { todayIso = now; renderDays(); }
  }, 60000);

  go((location.hash || '').replace('#', '') || 'home', false);
})();
