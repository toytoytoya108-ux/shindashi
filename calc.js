/*
 * 芯出し計算ロジック（関連資料－3「芯出し値の計算について」準拠）
 *
 * 前提
 *  - ポンプ基準（ポンプは固定、電動機を動かして調整する）
 *  - ダイヤルゲージの読み値は「＋：押込み／－：離れる」
 *  - 上下左右の「左」は電動機側からポンプを見たときの左
 *  - S1 = 芯ずれ(下 − 上), S2 = 面振れ(下 − 上)
 *    S3 = 芯ずれ(左 − 右), S4 = 面振れ(左 − 右)
 *
 * 電動機側にダイヤルを取り付けた場合（資料の計算例）
 *  カップリング側     = S2/D × Y       − S1/2
 *  反カップリング側   = S2/D × (Y + X) − S1/2   （左右は S4, S3 で同様）
 * ポンプ側に取り付けた場合は芯ずれの符号が逆になる（面振れは同じ）
 *  カップリング側     = S2/D × Y       + S1/2
 *
 * 結果の符号: 上下 ＋＝上げる(シム追加)／－＝下げる(シム抜き)
 *             左右 ＋＝右へ移動／－＝左へ移動
 */
(function (global) {
  'use strict';

  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function calculate(input) {
    var D = num(input.D), Y = num(input.Y), X = num(input.X);
    var rim = input.rim, face = input.face;
    var k = input.mount === 'pump' ? -1 : 1;

    var S1 = num(rim.bottom) - num(rim.top);
    var S2 = num(face.bottom) - num(face.top);
    var S3 = num(rim.left) - num(rim.right);
    var S4 = num(face.left) - num(face.right);

    // カップリング部での電動機のずれ（＋＝上／右）と傾き（ポンプから離れる方向に＋＝上／右）
    var offsetV = k * S1 / 2;
    var offsetH = k * S3 / 2;
    var slopeV = D > 0 ? -S2 / D : 0;
    var slopeH = D > 0 ? -S4 / D : 0;

    function correction(offset, slope, dist) {
      return -(offset + slope * dist);
    }

    var tol = input.tol || {};
    var tolOffset = tol.offset != null ? num(tol.offset) : 0.5;
    var tolAngle = tol.angleDeg != null ? num(tol.angleDeg) : 1;
    var tolCheck = tol.check != null ? num(tol.check) : 0.1;

    var angleV = Math.atan(Math.abs(slopeV)) * 180 / Math.PI;
    var angleH = Math.atan(Math.abs(slopeH)) * 180 / Math.PI;

    // 4点の整合チェック（上＋下 ≒ 左＋右）
    var rimCheck = (num(rim.top) + num(rim.bottom)) - (num(rim.left) + num(rim.right));
    var faceCheck = (num(face.top) + num(face.bottom)) - (num(face.left) + num(face.right));

    return {
      S1: S1, S2: S2, S3: S3, S4: S4,
      offsetV: offsetV, offsetH: offsetH,
      slopeV: slopeV, slopeH: slopeH,
      angleV: angleV, angleH: angleH,
      vertical: {
        near: correction(offsetV, slopeV, Y),
        far: correction(offsetV, slopeV, Y + X)
      },
      horizontal: {
        near: correction(offsetH, slopeH, Y),
        far: correction(offsetH, slopeH, Y + X)
      },
      judge: {
        offsetV: Math.abs(offsetV) <= tolOffset,
        offsetH: Math.abs(offsetH) <= tolOffset,
        angleV: angleV <= tolAngle,
        angleH: angleH <= tolAngle,
        faceTirLimit: D * Math.tan(tolAngle * Math.PI / 180)
      },
      check: {
        rim: rimCheck,
        face: faceCheck,
        rimOk: Math.abs(rimCheck) <= tolCheck,
        faceOk: Math.abs(faceCheck) <= tolCheck
      }
    };
  }

  global.Shinde = { calculate: calculate };
})(typeof window !== 'undefined' ? window : this);
