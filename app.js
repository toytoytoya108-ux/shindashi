(function () {
  'use strict';

  var APP_VERSION = '1.0.0';
  var KEY_DRAFT = 'shinde.draft';
  var KEY_RECORDS = 'shinde.records';
  var KEY_TOL = 'shinde.tol';
  var DEFAULT_TOL = { offset: 0.5, angleDeg: 1, check: 0.1 };
  var MOUNT_HINT = {
    motor: '電動機側カップリングにダイヤルを固定し、ポンプ側を測定（資料の計算例と同じ）。',
    pump: 'ポンプ側カップリングにダイヤルを固定し、電動機側を測定。芯ずれの正負が電動機側取付と逆になります。'
  };
  var MOUNT_LABEL = { motor: '電動機側', pump: 'ポンプ側' };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // ---------- 保存（端末内） ----------
  function load(key, fallback) {
    try {
      var s = localStorage.getItem(key);
      return s ? JSON.parse(s) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  // ---------- 数値 ----------
  function parseNum(s) {
    if (s == null) return NaN;
    s = String(s).trim()
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[．。]/g, '.')
      .replace(/[−－ー‐―]/g, '-')
      .replace(/[＋]/g, '+');
    if (s === '' || s === '-' || s === '+') return NaN;
    return Number(s);
  }
  function has(v) { return isFinite(v); }
  function f2(v) { return Math.abs(v).toFixed(2); }
  function signed(v, d) {
    var t = v.toFixed(d == null ? 3 : d);
    return (v > 0 ? '+' : '') + t;
  }

  // ---------- 入力の読み書き ----------
  var mount = 'motor';

  function readGroup(name) {
    var g = {};
    $$('.dial[data-group="' + name + '"] input').forEach(function (el) { g[el.dataset.k] = el.value; });
    return g;
  }
  function readForm() {
    return {
      name: $('#name').value,
      date: $('#date').value,
      mount: mount,
      D: $('#D').value, Y: $('#Y').value, X: $('#X').value,
      rim: readGroup('rim'),
      face: readGroup('face')
    };
  }
  function writeForm(f) {
    $('#name').value = f.name || '';
    $('#date').value = f.date || '';
    setMount(f.mount || 'motor');
    $('#D').value = f.D != null ? f.D : '';
    $('#Y').value = f.Y != null ? f.Y : '';
    $('#X').value = f.X != null ? f.X : '';
    ['rim', 'face'].forEach(function (name) {
      var g = f[name] || {};
      $$('.dial[data-group="' + name + '"] input').forEach(function (el) {
        var v = g[el.dataset.k];
        el.value = v != null ? v : (el.dataset.k === 'top' ? '0' : '');
      });
    });
  }
  function setMount(v) {
    mount = v;
    $$('#mount button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
    $('#mount-hint').textContent = MOUNT_HINT[v];
  }

  function numeric(form) {
    function g(o) {
      return { top: parseNum(o.top), bottom: parseNum(o.bottom), left: parseNum(o.left), right: parseNum(o.right) };
    }
    return { mount: form.mount, D: parseNum(form.D), Y: parseNum(form.Y), X: parseNum(form.X), rim: g(form.rim), face: g(form.face) };
  }

  // ---------- 設定 ----------
  function getTol() {
    var t = load(KEY_TOL, DEFAULT_TOL);
    return {
      offset: has(Number(t.offset)) ? Number(t.offset) : DEFAULT_TOL.offset,
      angleDeg: has(Number(t.angleDeg)) ? Number(t.angleDeg) : DEFAULT_TOL.angleDeg,
      check: has(Number(t.check)) ? Number(t.check) : DEFAULT_TOL.check
    };
  }
  function showTol() {
    var t = getTol();
    $('#tol-offset').value = t.offset;
    $('#tol-angle').value = t.angleDeg;
    $('#tol-check').value = t.check;
  }
  function saveTolFromForm() {
    var t = getTol();
    var o = parseNum($('#tol-offset').value), a = parseNum($('#tol-angle').value), c = parseNum($('#tol-check').value);
    if (has(o) && o > 0) t.offset = o;
    if (has(a) && a > 0) t.angleDeg = a;
    if (has(c) && c >= 0) t.check = c;
    save(KEY_TOL, t);
    update();
  }

  // ---------- 計算と表示 ----------
  var last = null; // 最後に表示した結果

  function moveText(v, kind) {
    if (Math.abs(v) < 0.005) return { text: '0.00 mm', note: '調整不要', need: false };
    if (kind === 'v') return { text: f2(v) + ' mm', note: v < 0 ? '下げる（シムを抜く）' : '上げる（シムを足す）', need: true };
    return { text: f2(v) + ' mm', note: v < 0 ? '左へ移動' : '右へ移動', need: true };
  }
  function setMove(id, v, kind) {
    var el = $(id);
    if (v == null) { el.innerHTML = '–<small>測定値未入力</small>'; el.classList.remove('need'); return; }
    var m = moveText(v, kind);
    el.innerHTML = m.text + '<small>' + m.note + '</small>';
    el.classList.toggle('need', m.need);
  }

  function update() {
    var form = readForm();
    save(KEY_DRAFT, form);
    var n = numeric(form);
    var tol = getTol();

    var dimsOk = has(n.D) && n.D > 0 && has(n.Y) && n.Y >= 0 && has(n.X) && n.X >= 0;
    var vOk = has(n.rim.top) && has(n.rim.bottom) && has(n.face.top) && has(n.face.bottom);
    var hOk = has(n.rim.left) && has(n.rim.right) && has(n.face.left) && has(n.face.right);

    if (!dimsOk || (!vOk && !hOk)) {
      $('#result-empty').hidden = false;
      $('#result-body').hidden = true;
      last = null;
      return;
    }
    $('#result-empty').hidden = true;
    $('#result-body').hidden = false;

    var r = Shinde.calculate({ mount: n.mount, D: n.D, Y: n.Y, X: n.X, rim: n.rim, face: n.face, tol: tol });
    last = { form: form, n: n, r: r, vOk: vOk, hOk: hOk };

    setMove('#v-near', vOk ? r.vertical.near : null, 'v');
    setMove('#v-far', vOk ? r.vertical.far : null, 'v');
    setMove('#h-near', hOk ? r.horizontal.near : null, 'h');
    setMove('#h-far', hOk ? r.horizontal.far : null, 'h');

    $('#fig-side').style.display = vOk ? '' : 'none';
    $('#fig-top').style.display = hOk ? '' : 'none';
    if (vOk) drawFig($('#fig-side'), false, r.offsetV, r.slopeV, n.Y, n.X, r.vertical);
    if (hOk) drawFig($('#fig-top'), true, r.offsetH, r.slopeH, n.Y, n.X, r.horizontal);

    // 状態と判定
    var rows = [];
    function okng(ok) { return ok ? '<span class="ok">OK</span>' : '<span class="ng">NG</span>'; }
    function per100(s) { return Math.abs(s * 100).toFixed(3); }
    if (vOk) {
      var ov = r.offsetV;
      rows.push(['上下 芯ずれ',
        Math.abs(ov) < 0.005 ? 'ずれなし' : '電動機が ' + f2(ov) + ' mm ' + (ov > 0 ? '高い' : '低い'),
        okng(r.judge.offsetV)]);
      rows.push(['上下 面振れ',
        (Math.abs(r.S2) < 0.005 ? '開きなし' : (r.S2 < 0 ? '下開き ' : '上開き ') + f2(r.S2) + ' mm') +
          '<br><small>' + r.angleV.toFixed(3) + '°（' + per100(r.slopeV) + ' mm/100mm）</small>',
        okng(r.judge.angleV)]);
    }
    if (hOk) {
      var oh = r.offsetH;
      rows.push(['左右 芯ずれ',
        Math.abs(oh) < 0.005 ? 'ずれなし' : '電動機が ' + (oh > 0 ? '右' : '左') + 'へ ' + f2(oh) + ' mm',
        okng(r.judge.offsetH)]);
      rows.push(['左右 面振れ',
        (Math.abs(r.S4) < 0.005 ? '開きなし' : (r.S4 < 0 ? '左開き ' : '右開き ') + f2(r.S4) + ' mm') +
          '<br><small>' + r.angleH.toFixed(3) + '°（' + per100(r.slopeH) + ' mm/100mm）</small>',
        okng(r.judge.angleH)]);
    }
    $('#judge-body').innerHTML = rows.map(function (row) {
      return '<tr><td>' + row[0] + '</td><td>' + row[1] + '</td><td>' + row[2] + '</td></tr>';
    }).join('');

    var warns = [];
    if (vOk && hOk) {
      if (!r.check.rimOk) warns.push('芯ずれの「上＋下」と「左＋右」の差が ' + f2(r.check.rim) + ' mm あります。測定値を確認してください。');
      if (!r.check.faceOk) warns.push('面振れの「上＋下」と「左＋右」の差が ' + f2(r.check.face) + ' mm あります。測定値を確認してください。');
    }
    warns.push('基準：芯ずれ ' + tol.offset + ' mm（TIR ' + (tol.offset * 2).toFixed(2) + ' mm）、面振れ ' + tol.angleDeg +
      '°（D=' + n.D + ' で TIR ' + r.judge.faceTirLimit.toFixed(3) + ' mm）');
    $('#warnings').innerHTML = warns.map(function (w, i) {
      return i === warns.length - 1 ? '<p class="hint">' + w + '</p>' : '<div class="warn">' + w + '</div>';
    }).join('');

    var sv = [];
    if (vOk) sv.push('S1=' + signed(r.S1, 2), 'S2=' + signed(r.S2, 2));
    if (hOk) sv.push('S3=' + signed(r.S3, 2), 'S4=' + signed(r.S4, 2));
    $('#svals').textContent = sv.join('　') + '　（取付：' + MOUNT_LABEL[n.mount] + '）';
  }

  // ---------- 図 ----------
  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, text) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function pts(arr) { return arr.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); }

  /*
   * 調整図。横から見た図（top=false）はポンプ左・電動機右、変位＋＝上。
   * 上から見た図（top=true）はポンプ上・電動機下（電動機側からポンプを見る向き）、変位＋＝右。
   * 変位は誇張表示。
   */
  function drawFig(svg, top, offset, slope, Y, X, corr) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var W = top ? 360 : 360, H = top ? 300 : 170;
    var c = top ? 180 : 85;               // 軸の位置（垂直方向）
    var sPump0 = top ? 26 : 10, sPump1 = top ? 76 : 92;
    var sCpl = top ? 84 : 102;            // カップリング位置
    var sM0 = sCpl + 8, sEnd = top ? H - 14 : W - 12;
    var uEnd = Y + X * 1.2;
    var su = uEnd > 0 ? (sEnd - sM0) / uEnd : 0;
    var hw = 18;

    function S(u) { return sM0 + u * su; }
    function A(s, d) { return top ? [c + d, s] : [s, c - d]; }
    var disp = function (u) { return offset + slope * u; };
    var maxD = Math.max(Math.abs(disp(0)), Math.abs(disp(Y)), Math.abs(disp(Y + X)), Math.abs(disp(uEnd)));
    var sd = maxD > 1e-6 ? 26 / maxD : 0;
    function P(u, extra) { return A(S(u), disp(u) * sd + extra); }

    svg.appendChild(el('text', { x: 8, y: 14, class: 't-mute' },
      top ? '上から見た図（電動機側→ポンプ向き・変位は誇張）' : '横から見た図（変位は誇張）'));

    // ポンプ
    svg.appendChild(el('polygon', { class: 'pump', points: pts([A(sPump0, hw + 6), A(sPump1, hw + 6), A(sPump1, -hw - 6), A(sPump0, -hw - 6)]) }));
    var pc = A((sPump0 + sPump1) / 2, 0);
    svg.appendChild(el('text', { x: pc[0], y: pc[1] + 4, 'text-anchor': 'middle', class: 'd-txt' }, 'ポンプ'));
    svg.appendChild(el('polygon', { class: 'cpl', points: pts([A(sCpl - 8, hw + 10), A(sCpl - 3, hw + 10), A(sCpl - 3, -hw - 10), A(sCpl - 8, -hw - 10)]) }));

    // 調整後の位置（基準軸上）
    svg.appendChild(el('polygon', { class: 'ghost', points: pts([A(sM0, hw), A(S(uEnd), hw), A(S(uEnd), -hw), A(sM0, -hw)]) }));
    var r0 = A(sPump0, 0), r1 = A(sEnd, 0);
    svg.appendChild(el('line', { class: 'ref', x1: r0[0], y1: r0[1], x2: r1[0], y2: r1[1] }));

    // 現在の電動機
    svg.appendChild(el('polygon', { class: 'motor', points: pts([P(0, hw), P(uEnd, hw), P(uEnd, -hw), P(0, -hw)]) }));
    svg.appendChild(el('polygon', { class: 'cpl', points: pts([P(0, hw + 10), A(sM0 + 5, disp(0) * sd + hw + 10), A(sM0 + 5, disp(0) * sd - hw - 10), P(0, -hw - 10)]) }));
    var a0 = P(0, 0), a1 = P(uEnd, 0);
    svg.appendChild(el('line', { class: 'cur', x1: a0[0], y1: a0[1], x2: a1[0], y2: a1[1] }));
    var mc = P(top ? Y * 0.5 : uEnd * 0.55, 0);
    svg.appendChild(el('text', { x: mc[0], y: mc[1] + 4, 'text-anchor': 'middle', class: 'd-txt' }, '電動機'));

    // 脚と移動方向
    [[Y, corr.near, '前脚'], [Y + X, corr.far, '後脚']].forEach(function (f) {
      var u = f[0], v = f[1];
      var sides = top ? [1, -1] : [-1];
      sides.forEach(function (sd2) {
        var p1 = P(u, sd2 * hw), p2 = P(u, sd2 * (hw + 5));
        var fw = 6;
        var q = top
          ? [[p1[0], p1[1] - fw], [p2[0], p2[1] - fw], [p2[0], p2[1] + fw], [p1[0], p1[1] + fw]]
          : [[p1[0] - fw, p1[1]], [p2[0] - fw, p2[1]], [p2[0] + fw, p2[1]], [p1[0] + fw, p1[1]]];
        svg.appendChild(el('polygon', { class: 'foot', points: pts(q) }));
      });

      var base = disp(u) * sd;
      if (Math.abs(v) < 0.005) {
        var tp = A(S(u), base + (top ? hw + 14 : -(hw + 18)));
        svg.appendChild(el('text', { x: tp[0], y: tp[1] + 4, 'text-anchor': top ? 'start' : 'middle', class: 't-mute' }, f[2] + ' 0'));
        return;
      }
      var dir = v > 0 ? 1 : -1;
      var st = A(S(u), base + dir * (hw + 8));
      var en = A(S(u), base + dir * (hw + 26));
      svg.appendChild(el('line', { class: 'arrow', x1: st[0], y1: st[1], x2: en[0], y2: en[1] }));
      var vx = en[0] - st[0], vy = en[1] - st[1], len = Math.sqrt(vx * vx + vy * vy) || 1;
      vx /= len; vy /= len;
      var head = [[en[0] + vx * 6, en[1] + vy * 6], [en[0] - vy * 5, en[1] + vx * 5], [en[0] + vy * 5, en[1] - vx * 5]];
      svg.appendChild(el('polygon', { class: 'arrowhead', points: pts(head) }));

      var word = top ? (v < 0 ? '左へ' : '右へ') : (v < 0 ? '下げ' : '上げ');
      var lp = A(S(u), base + dir * (hw + 40));
      var anchor = top ? (dir < 0 ? 'end' : 'start') : (lp[0] > W - 70 ? 'end' : 'middle');
      if (top) lp[0] += dir < 0 ? 4 : -4;
      if (anchor === 'end' && !top) lp[0] = W - 6;
      svg.appendChild(el('text', { x: lp[0], y: lp[1] + 4, 'text-anchor': anchor, class: 't-move' }, f[2] + ' ' + f2(v) + ' ' + word));
    });

    if (top) {
      svg.appendChild(el('text', { x: 8, y: H - 8, class: 't-mute' }, '← 左'));
      svg.appendChild(el('text', { x: W - 8, y: H - 8, 'text-anchor': 'end', class: 't-mute' }, '右 →'));
    }
  }

  // ---------- 記録 ----------
  function getRecords() { return load(KEY_RECORDS, []); }
  function setRecords(list) { return save(KEY_RECORDS, list); }

  function summaryText(rec) {
    var r = rec.result, lines = [];
    lines.push('【芯出し計算】' + (rec.form.name || '（機器名なし）') + '　' + (rec.form.date || ''));
    lines.push('取付：' + MOUNT_LABEL[rec.form.mount] + '　D=' + rec.form.D + ' Y=' + rec.form.Y + ' X=' + rec.form.X);
    var fr = rec.form.rim, ff = rec.form.face;
    lines.push('芯ずれ 上' + fr.top + ' 下' + fr.bottom + ' 左' + fr.left + ' 右' + fr.right);
    lines.push('面振れ 上' + ff.top + ' 下' + ff.bottom + ' 左' + ff.left + ' 右' + ff.right);
    if (r.vNear != null) {
      lines.push('上下 前脚 ' + moveText(r.vNear, 'v').text + ' ' + moveText(r.vNear, 'v').note +
        '／後脚 ' + moveText(r.vFar, 'v').text + ' ' + moveText(r.vFar, 'v').note);
    }
    if (r.hNear != null) {
      lines.push('左右 前脚 ' + moveText(r.hNear, 'h').text + ' ' + moveText(r.hNear, 'h').note +
        '／後脚 ' + moveText(r.hFar, 'h').text + ' ' + moveText(r.hFar, 'h').note);
    }
    return lines.join('\n');
  }

  function currentRecord() {
    if (!last) return null;
    var r = last.r;
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      savedAt: new Date().toISOString(),
      form: last.form,
      result: {
        S1: r.S1, S2: r.S2, S3: r.S3, S4: r.S4,
        vNear: last.vOk ? r.vertical.near : null, vFar: last.vOk ? r.vertical.far : null,
        hNear: last.hOk ? r.horizontal.near : null, hFar: last.hOk ? r.horizontal.far : null
      }
    };
  }

  function renderRecords() {
    var list = getRecords();
    var ul = $('#record-list');
    ul.innerHTML = '';
    $('#records-empty').hidden = list.length > 0;
    list.slice().reverse().forEach(function (rec) {
      var li = document.createElement('li');
      var info = document.createElement('div');
      info.className = 'info';
      var t = document.createElement('div');
      t.className = 'title';
      t.textContent = rec.form.name || '（機器名なし）';
      var m = document.createElement('div');
      m.className = 'meta';
      var r = rec.result, parts = [rec.form.date || rec.savedAt.slice(0, 10), MOUNT_LABEL[rec.form.mount] + '取付'];
      if (r.vNear != null) parts.push('上下 ' + signed(r.vNear, 2) + '/' + signed(r.vFar, 2));
      if (r.hNear != null) parts.push('左右 ' + signed(r.hNear, 2) + '/' + signed(r.hFar, 2));
      m.textContent = parts.join('　');
      info.appendChild(t); info.appendChild(m);
      info.addEventListener('click', function () {
        writeForm(rec.form);
        update();
        switchTab('calc');
        toast('記録を読み込みました');
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn danger del';
      del.textContent = '削除';
      del.addEventListener('click', function () {
        if (!confirm('「' + (rec.form.name || '機器名なし') + '」の記録を削除しますか？')) return;
        setRecords(getRecords().filter(function (x) { return x.id !== rec.id; }));
        renderRecords();
      });
      li.appendChild(info); li.appendChild(del);
      ul.appendChild(li);
    });
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function round3(v) { return v == null ? '' : Math.round(v * 1000) / 1000; }
  function exportCsv() {
    var list = getRecords();
    if (!list.length) { toast('記録がありません'); return; }
    var head = ['機器名', '測定日', '取付側', 'D', 'Y', 'X',
      '芯ずれ上', '芯ずれ下', '芯ずれ左', '芯ずれ右', '面振れ上', '面振れ下', '面振れ左', '面振れ右',
      'S1', 'S2', 'S3', 'S4', '上下前脚(+上げ/-下げ)', '上下後脚', '左右前脚(+右/-左)', '左右後脚', '保存日時'];
    var rows = [head];
    list.forEach(function (rec) {
      var f = rec.form, r = rec.result;
      rows.push([f.name, f.date, MOUNT_LABEL[f.mount], f.D, f.Y, f.X,
        f.rim.top, f.rim.bottom, f.rim.left, f.rim.right, f.face.top, f.face.bottom, f.face.left, f.face.right,
        round3(r.S1), round3(r.S2), round3(r.S3), round3(r.S4),
        round3(r.vNear), round3(r.vFar), round3(r.hNear), round3(r.hFar), rec.savedAt]);
    });
    var csv = '﻿' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
    download('芯出し記録_' + today() + '.csv', csv, 'text/csv');
  }
  function backup() {
    download('芯出し記録_backup_' + today() + '.json', JSON.stringify({ app: 'shinde', version: APP_VERSION, records: getRecords() }, null, 1), 'application/json');
  }
  function restore(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var incoming = Array.isArray(data) ? data : data.records;
        if (!Array.isArray(incoming)) throw new Error('format');
        var list = getRecords();
        var ids = {};
        list.forEach(function (r) { ids[r.id] = true; });
        var added = 0;
        incoming.forEach(function (r) {
          if (r && r.id && r.form && r.result && !ids[r.id]) { list.push(r); added++; }
        });
        setRecords(list);
        renderRecords();
        toast(added + ' 件を復元しました');
      } catch (e) {
        toast('ファイルを読み込めませんでした');
      }
    };
    reader.readAsText(file);
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
  }
  function isoToday() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  // ---------- UI ----------
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }
  function switchTab(name) {
    $$('.tab').forEach(function (s) { s.classList.toggle('active', s.id === 'tab-' + name); });
    $$('.tabbar button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === name); });
    if (name === 'records') renderRecords();
    if (name === 'settings') showTol();
    window.scrollTo(0, 0);
  }

  function init() {
    $('#version').textContent = 'バージョン ' + APP_VERSION;

    var draft = load(KEY_DRAFT, null);
    if (draft) writeForm(draft); else setMount('motor');
    if (!$('#date').value) $('#date').value = isoToday();

    $$('#tab-calc input').forEach(function (inp) { inp.addEventListener('input', update); });
    $$('#mount button').forEach(function (b) {
      b.addEventListener('click', function () { setMount(b.dataset.v); update(); });
    });
    $$('.pm').forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = b.parentNode.querySelector('input');
        var v = inp.value.trim();
        inp.value = /^[-−－]/.test(v) ? v.replace(/^[-−－]/, '') : '-' + v;
        inp.focus();
        update();
      });
    });
    $$('.tabbar button').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.dataset.tab); });
    });

    $('#btn-save').addEventListener('click', function () {
      var rec = currentRecord();
      if (!rec) { toast('計算結果がありません'); return; }
      var list = getRecords();
      list.push(rec);
      toast(setRecords(list) ? '記録に保存しました' : '保存できませんでした');
    });
    $('#btn-share').addEventListener('click', function () {
      var rec = currentRecord();
      if (!rec) { toast('計算結果がありません'); return; }
      var text = summaryText(rec);
      if (navigator.share) {
        navigator.share({ title: '芯出し計算', text: text }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () { toast('結果をコピーしました'); }, function () { toast('コピーできませんでした'); });
      } else {
        toast('この端末では共有できません');
      }
    });
    $('#btn-clear').addEventListener('click', function () {
      if (!confirm('測定値を消去しますか？（D・Y・X と取付側は残ります）')) return;
      var f = readForm();
      f.name = ''; f.date = isoToday();
      f.rim = { top: '0' }; f.face = { top: '0' };
      writeForm(f);
      update();
    });

    $('#btn-csv').addEventListener('click', exportCsv);
    $('#btn-backup').addEventListener('click', backup);
    $('#file-restore').addEventListener('change', function (e) {
      if (e.target.files[0]) restore(e.target.files[0]);
      e.target.value = '';
    });

    ['#tol-offset', '#tol-angle', '#tol-check'].forEach(function (id) {
      $(id).addEventListener('change', saveTolFromForm);
    });
    $('#btn-tol-reset').addEventListener('click', function () {
      save(KEY_TOL, DEFAULT_TOL);
      showTol();
      update();
      toast('初期値に戻しました');
    });

    update();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  init();
})();
