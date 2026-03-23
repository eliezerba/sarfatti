(function () {
  'use strict';

  var IGNORE_PUNCT_RE = /['"`\u2018\u2019\u201C\u201D\u05F3\u05F4]/g;
  var IGNORE_PUNCT_TEST_RE = /['"`\u2018\u2019\u201C\u201D\u05F3\u05F4]/;
  function isIgnoredToken(raw, norm) {
    return norm === '\u05db\u05d5' && IGNORE_PUNCT_TEST_RE.test(String(raw || ''));
  }

  function normalizeToken(t) {
    return String(t || '')
      .toLowerCase()
      .replace(/[\u0591-\u05c7]/g, '')
      .replace(/[?]/g, '?')
      .replace(/[?]/g, '?')
      .replace(/[?]/g, '?')
      .replace(/[?]/g, '?')
      .replace(/[?]/g, '?')
      .replace(/[ך]/g, 'כ')
      .replace(/[ם]/g, 'מ')
      .replace(/[ן]/g, 'נ')
      .replace(/[ף]/g, 'פ')
      .replace(/[ץ]/g, 'צ')
      .replace(/[׳״]/g, '')
      .replace(/['"`\u2018\u2019\u201C\u201D\u05f3\u05f4]/g, '')
      .replace(/["'.,;:!?()\[\]{}<>\-_\/\\|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenizeText(txt) {
    return String(txt || '')
      .split(/\s+/)
      .filter(Boolean)
      .map(function (raw) {
        var norm = normalizeToken(raw);
        return { raw: raw, norm: norm };
      })
      .filter(function (t) { return t.norm && !isIgnoredToken(t.raw, t.norm); })
      .map(function (t) { return t.norm; });
  }

  function textJaccard(a, b) {
    var wa = new Set(tokenizeText(a));
    var wb = new Set(tokenizeText(b));
    if (!wa.size && !wb.size) return 1;
    var inter = 0;
    wa.forEach(function (w) { if (wb.has(w)) inter += 1; });
    var union = new Set([].concat(Array.from(wa), Array.from(wb))).size;
    return union ? inter / union : 0;
  }

  function normalizeForChars(txt) {
    return normalizeToken(txt).replace(/\s+/g, '');
  }

  function jaccardTokens(ta, tb) {
    if (!ta.length && !tb.length) return 1;
    if (!ta.length || !tb.length) return 0;
    var sa = new Set(ta);
    var sb = new Set(tb);
    var inter = 0;
    sa.forEach(function (w) { if (sb.has(w)) inter += 1; });
    var union = new Set([].concat(Array.from(sa), Array.from(sb))).size;
    return union ? inter / union : 0;
  }

  function tokenBigrams(tokens) {
    var out = [];
    for (var i = 0; i < tokens.length - 1; i++) {
      out.push(tokens[i] + '§' + tokens[i + 1]);
    }
    return out;
  }

  function bigramJaccard(ta, tb) {
    if (ta.length < 2 || tb.length < 2) return 0;
    return jaccardTokens(tokenBigrams(ta), tokenBigrams(tb));
  }

  function charNgramCounts(s, n) {
    var out = Object.create(null);
    if (s.length < n) return out;
    for (var i = 0; i <= s.length - n; i++) {
      var g = s.slice(i, i + n);
      out[g] = (out[g] || 0) + 1;
    }
    return out;
  }

  function cosineSimCounts(a, b) {
    var dot = 0;
    var na = 0;
    var nb = 0;
    Object.keys(a).forEach(function (k) {
      var va = a[k] || 0;
      na += va * va;
      if (b[k]) dot += va * b[k];
    });
    Object.keys(b).forEach(function (k) {
      var vb = b[k] || 0;
      nb += vb * vb;
    });
    if (!na || !nb) return 0;
    return dot / Math.sqrt(na * nb);
  }

  function charGramSimilarity(a, b) {
    var sa = normalizeForChars(a);
    var sb = normalizeForChars(b);
    if (sa.length < 3 || sb.length < 3) return 0;
    var ca = charNgramCounts(sa, 3);
    var cb = charNgramCounts(sb, 3);
    return cosineSimCounts(ca, cb);
  }

  function tokenOverlapScore(ta, tb) {
    if (!ta.length || !tb.length) return 0;
    var sb = new Set(tb);
    var total = 0;
    var hit = 0;
    ta.forEach(function (t) {
      if (t.length < 4) return;
      total += 1;
      if (sb.has(t)) hit += 1;
    });
    return total ? hit / total : 0;
  }

  function chunkByTokens(seg, size) {
    var words = String(seg || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var out = [];
    for (var i = 0; i < words.length; i += size) {
      out.push(words.slice(i, i + size).join(' '));
    }
    return out;
  }

  function splitLongSegment(seg, target) {
    var parts = String(seg || '')
      .split(/[,;:\u05be\u2014\u2013]+\s+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    if (parts.length > 1) {
      var out = [];
      parts.forEach(function (p) {
        var toks = tokenizeText(p);
        if (toks.length > target * 1.35) {
          out = out.concat(chunkByTokens(p, target));
        } else {
          out.push(p);
        }
      });
      return out;
    }
    return chunkByTokens(seg, target);
  }

  function splitSynopsisText(txt) {
    var cleaned = String(txt || '').replace(/\r/g, '').trim();
    if (!cleaned) return [];

    var marked = cleaned
      .replace(/([.!?;:\u05c3\u0589])\s+/g, '$1|||')
      .replace(/\n{2,}/g, '|||')
      .replace(/[•●]\s*/g, '|||');

    var rawSegs = marked
      .split(/(?:\n|\|\|\|)/)
      .map(function (s) { return s.replace(/\s+/g, ' ').trim(); })
      .filter(Boolean);

    var refined = [];
    rawSegs.forEach(function (seg) {
      var tokenLen = tokenizeText(seg).length;
      if (tokenLen > 28) {
        refined = refined.concat(splitLongSegment(seg, 22));
      } else {
        refined.push(seg);
      }
    });

    var merged = [];
    refined.forEach(function (seg) {
      if (!merged.length) {
        merged.push(seg);
        return;
      }
      var tokenLen = tokenizeText(seg).length;
      if (tokenLen < 4) {
        merged[merged.length - 1] = (merged[merged.length - 1] + ' ' + seg).trim();
      } else {
        merged.push(seg);
      }
    });

    if (merged.length > 2) return merged;

    var words = cleaned.split(/\s+/).filter(Boolean);
    var chunks = [];
    for (var i = 0; i < words.length; i += 18) {
      chunks.push(words.slice(i, i + 18).join(' '));
    }
    return chunks;
  }

  function splitSynopsisTextWithOptions(txt, opts) {
    var cleaned = String(txt || '').replace(/\r/g, '').trim();
    if (!cleaned) return [];
    var minMerge = (opts && opts.minMergeTokens) || 4;
    var longThresh = (opts && opts.longSegmentTokens) || 28;
    var chunkSize = (opts && opts.chunkSize) || 18;

    var marked = cleaned
      .replace(/([.!?;:\u05c3\u0589])\s+/g, '$1|||')
      .replace(/\n{2,}/g, '|||')
      .replace(/[•●]\s*/g, '|||');

    var rawSegs = marked
      .split(/(?:\n|\|\|\|)/)
      .map(function (s) { return s.replace(/\s+/g, ' ').trim(); })
      .filter(Boolean);

    var refined = [];
    rawSegs.forEach(function (seg) {
      var tokenLen = tokenizeText(seg).length;
      if (tokenLen > longThresh) {
        refined = refined.concat(splitLongSegment(seg, Math.max(10, Math.floor(chunkSize * 1.05))));
      } else {
        refined.push(seg);
      }
    });

    var merged = [];
    refined.forEach(function (seg) {
      if (!merged.length) {
        merged.push(seg);
        return;
      }
      var tokenLen = tokenizeText(seg).length;
      if (tokenLen < minMerge) {
        merged[merged.length - 1] = (merged[merged.length - 1] + ' ' + seg).trim();
      } else {
        merged.push(seg);
      }
    });

    if (merged.length > 2) return merged;

    var words = cleaned.split(/\s+/).filter(Boolean);
    var chunks = [];
    for (var i = 0; i < words.length; i += chunkSize) {
      chunks.push(words.slice(i, i + chunkSize).join(' '));
    }
    return chunks;
  }

  function segmentSimilarity(a, b) {
    var ta = tokenizeText(a);
    var tb = tokenizeText(b);
    if (!ta.length && !tb.length) return 1;
    if (!ta.length || !tb.length) return 0;
    var jac = jaccardTokens(ta, tb);
    var bi = bigramJaccard(ta, tb);
    var cg = charGramSimilarity(a, b);
    var lenRatio = Math.max(0, 1 - Math.abs(ta.length - tb.length) / Math.max(1, Math.max(ta.length, tb.length)));
    var overlap = tokenOverlapScore(ta, tb);
    var score = (jac * 0.45) + (bi * 0.18) + (cg * 0.22) + (lenRatio * 0.1) + (overlap * 0.05);
    if (jac < 0.12 && cg > 0.45) score = Math.max(score, 0.2 + cg * 0.6);
    return Math.max(0, Math.min(1, score));
  }

  function uniqueTokenAnchors(baseSegs, witSegs) {
    var baseFreq = Object.create(null);
    var baseLoc = Object.create(null);
    var witFreq = Object.create(null);
    var witLoc = Object.create(null);

    for (var i = 0; i < baseSegs.length; i++) {
      var seenB = new Set(tokenizeText(baseSegs[i]));
      seenB.forEach(function (tok) {
        baseFreq[tok] = (baseFreq[tok] || 0) + 1;
        if (baseLoc[tok] == null) baseLoc[tok] = i;
      });
    }

    for (var j = 0; j < witSegs.length; j++) {
      var seenW = new Set(tokenizeText(witSegs[j]));
      seenW.forEach(function (tok) {
        witFreq[tok] = (witFreq[tok] || 0) + 1;
        if (witLoc[tok] == null) witLoc[tok] = j;
      });
    }

    var cands = [];
    Object.keys(baseFreq).forEach(function (tok) {
      if (tok.length < 3) return;
      var bf = baseFreq[tok] || 0;
      var wf = witFreq[tok] || 0;
      if (!bf || !wf) return;
      var w = 0;
      if (bf === 1 && wf === 1) w = 1.2 + Math.min(4, tok.length / 2);
      else if (bf <= 2 && wf <= 2) w = 0.7 + Math.min(3, tok.length / 3);
      else return;
      var bi = baseLoc[tok];
      var bj = witLoc[tok];
      if (segmentSimilarity(baseSegs[bi], witSegs[bj]) < 0.20) return;
      cands.push({ i: bi, j: bj, w: w });
    });

    cands.sort(function (a, b) { return a.i - b.i || a.j - b.j; });
    if (!cands.length) return [];

    // Weighted LIS over j to keep monotonic anchors.
    var n = cands.length;
    var dp = new Array(n);
    var prev = new Array(n);
    for (var k = 0; k < n; k++) {
      dp[k] = cands[k].w;
      prev[k] = -1;
      for (var p = 0; p < k; p++) {
        if (cands[p].i < cands[k].i && cands[p].j < cands[k].j) {
          var cand = dp[p] + cands[k].w;
          if (cand > dp[k]) {
            dp[k] = cand;
            prev[k] = p;
          }
        }
      }
    }

    var best = 0;
    for (var z = 1; z < n; z++) if (dp[z] > dp[best]) best = z;

    var anchors = [];
    var cur = best;
    while (cur >= 0) {
      anchors.push(cands[cur]);
      cur = prev[cur];
    }
    anchors.reverse();
    return anchors;
  }

  function affineChunkOps(baseSegs, witSegs) {
    var n = baseSegs.length;
    var m = witSegs.length;
    var NEG = -1e9;

    var M = Array.from({ length: n + 1 }, function () { return Array(m + 1).fill(NEG); });
    var X = Array.from({ length: n + 1 }, function () { return Array(m + 1).fill(NEG); });
    var Y = Array.from({ length: n + 1 }, function () { return Array(m + 1).fill(NEG); });

    var bM = Array.from({ length: n + 1 }, function () { return Array(m + 1).fill(null); });
    var bX = Array.from({ length: n + 1 }, function () { return Array(m + 1).fill(null); });
    var bY = Array.from({ length: n + 1 }, function () { return Array(m + 1).fill(null); });

    // Allow empty windows (gaps) so we don't force weak matches.
    var gapOpen = 0.55;
    var gapExt = 0.12;
    var minMatchSim = 0.15;
    var lowSimThreshold = 0.25;
    var lowSimPenalty = 1.2;
    if (arguments.length > 2 && arguments[2]) {
      var opts = arguments[2];
      if (opts.gapOpen != null) gapOpen = opts.gapOpen;
      if (opts.gapExt != null) gapExt = opts.gapExt;
      if (opts.minMatchSim != null) minMatchSim = opts.minMatchSim;
      if (opts.lowSimThreshold != null) lowSimThreshold = opts.lowSimThreshold;
      if (opts.lowSimPenalty != null) lowSimPenalty = opts.lowSimPenalty;
    }
    var positionBias = (arguments.length > 2 && arguments[2] && arguments[2].positionBias) || 0;

    M[0][0] = 0;

    for (var i = 1; i <= n; i++) {
      X[i][0] = -(gapOpen + (i - 1) * gapExt);
      bX[i][0] = 'X';
    }
    for (var j = 1; j <= m; j++) {
      Y[0][j] = -(gapOpen + (j - 1) * gapExt);
      bY[0][j] = 'Y';
    }

    for (var ii = 1; ii <= n; ii++) {
      for (var jj = 1; jj <= m; jj++) {
        var sim = segmentSimilarity(baseSegs[ii - 1], witSegs[jj - 1]);
        var matchScore;
        if (sim < minMatchSim) {
          matchScore = -1e6;
        } else {
          matchScore = (sim * 4.2) - 2.2;
          if (sim < lowSimThreshold) matchScore -= lowSimPenalty;
          // Position bias: favor matches at start of array, penalize at end.
          // Forward pass: anchors start. Reverse (on reversed arrays): anchors original end.
          if (positionBias) {
            var pos = n > 1 ? (ii - 1) / (n - 1) : 0.5;
            matchScore += positionBias * (1 - 2 * pos);
          }
        }

        var pm = M[ii - 1][jj - 1];
        var px = X[ii - 1][jj - 1];
        var py = Y[ii - 1][jj - 1];
        if (pm >= px && pm >= py) {
          M[ii][jj] = pm + matchScore;
          bM[ii][jj] = 'M';
        } else if (px >= py) {
          M[ii][jj] = px + matchScore;
          bM[ii][jj] = 'X';
        } else {
          M[ii][jj] = py + matchScore;
          bM[ii][jj] = 'Y';
        }

        var fromMtoX = M[ii - 1][jj] - gapOpen;
        var fromXtoX = X[ii - 1][jj] - gapExt;
        if (fromMtoX >= fromXtoX) {
          X[ii][jj] = fromMtoX;
          bX[ii][jj] = 'M';
        } else {
          X[ii][jj] = fromXtoX;
          bX[ii][jj] = 'X';
        }

        var fromMtoY = M[ii][jj - 1] - gapOpen;
        var fromYtoY = Y[ii][jj - 1] - gapExt;
        if (fromMtoY >= fromYtoY) {
          Y[ii][jj] = fromMtoY;
          bY[ii][jj] = 'M';
        } else {
          Y[ii][jj] = fromYtoY;
          bY[ii][jj] = 'Y';
        }
      }
    }

    var state = 'M';
    if (X[n][m] >= M[n][m] && X[n][m] >= Y[n][m]) state = 'X';
    else if (Y[n][m] >= M[n][m] && Y[n][m] >= X[n][m]) state = 'Y';

    var i3 = n, j3 = m;
    var ops = [];
    while (i3 > 0 || j3 > 0) {
      if (state === 'M') {
        if (i3 <= 0 || j3 <= 0) break;
        ops.push({ type: 'M', i: i3 - 1, j: j3 - 1 });
        state = bM[i3][j3] || 'M';
        i3 -= 1;
        j3 -= 1;
      } else if (state === 'X') {
        if (i3 <= 0) break;
        ops.push({ type: 'D', i: i3 - 1 });
        state = bX[i3][j3] || 'X';
        i3 -= 1;
      } else {
        if (j3 <= 0) break;
        ops.push({ type: 'I', j: j3 - 1 });
        state = bY[i3][j3] || 'Y';
        j3 -= 1;
      }
    }

    while (i3 > 0) {
      ops.push({ type: 'D', i: i3 - 1 });
      i3 -= 1;
    }
    while (j3 > 0) {
      ops.push({ type: 'I', j: j3 - 1 });
      j3 -= 1;
    }

    ops.reverse();
    return ops;
  }

  function bestBaseForInsertion(left, right, baseSegs, witSeg) {
    var n = baseSegs.length;
    if (!n) return 0;
    var from;
    var to;
    if (left == null && right == null) {
      from = 0;
      to = n - 1;
    } else if (left == null) {
      from = 0;
      to = Math.min(n - 1, right);
    } else if (right == null) {
      from = Math.max(0, left);
      to = n - 1;
    } else {
      from = Math.max(0, Math.min(left, right));
      to = Math.min(n - 1, Math.max(left, right));
    }

    var candidates = [];
    var maxWindow = 7;
    if (to - from > maxWindow) {
      candidates.push(from);
      candidates.push(to);
      candidates.push(Math.floor((from + to) / 2));
      candidates.push(from + 1);
      candidates.push(to - 1);
    } else {
      for (var i = from; i <= to; i++) candidates.push(i);
    }

    var bestIdx = candidates[0];
    var bestScore = -1;
    for (var c = 0; c < candidates.length; c++) {
      var idx = candidates[c];
      if (idx < 0 || idx >= n) continue;
      var sc = segmentSimilarity(baseSegs[idx], witSeg);
      if (sc > bestScore) {
        bestScore = sc;
        bestIdx = idx;
      }
    }
    return bestIdx == null ? Math.max(0, Math.min(n - 1, left || 0)) : bestIdx;
  }

  function alignToBase(baseSegs, witnessSegs, options) {
    var safeBase = Array.isArray(baseSegs) ? baseSegs : [];
    var safeWitness = Array.isArray(witnessSegs) ? witnessSegs : [];
    var n = safeBase.length;
    var m = safeWitness.length;
    if (!n) return [];
    if (!m) return Array.from({ length: n }, function () { return ''; });

    var maxCells = (options && options.maxCells) || 180000;
    if ((n + 1) * (m + 1) > maxCells) {
      var naive = Array.from({ length: n }, function () { return ''; });
      var minLen = Math.min(n, m);
      for (var i = 0; i < minLen; i++) naive[i] = safeWitness[i] || '';
      if (m > n) naive[n - 1] = (naive[n - 1] + ' ' + safeWitness.slice(n).join(' ')).trim();
      return naive;
    }

    var useAnchors = options && options.useAnchors === false ? false : true;
    var anchors = useAnchors ? uniqueTokenAnchors(safeBase, safeWitness) : [];
    var ops = [];

    function pushChunk(baseFrom, baseTo, witFrom, witTo) {
      var bChunk = safeBase.slice(baseFrom, baseTo);
      var wChunk = safeWitness.slice(witFrom, witTo);
      var chunkOps = affineChunkOps(bChunk, wChunk, options);
      chunkOps.forEach(function (op) {
        if (op.type === 'M') ops.push({ type: 'M', i: baseFrom + op.i, j: witFrom + op.j });
        if (op.type === 'D') ops.push({ type: 'D', i: baseFrom + op.i });
        if (op.type === 'I') ops.push({ type: 'I', j: witFrom + op.j });
      });
    }

    var bi = 0;
    var bj = 0;
    if (anchors.length) {
      anchors.forEach(function (a) {
        if (a.i < bi || a.j < bj) return;
        pushChunk(bi, a.i, bj, a.j);
        ops.push({ type: 'M', i: a.i, j: a.j });
        bi = a.i + 1;
        bj = a.j + 1;
      });
      pushChunk(bi, n, bj, m);
    } else {
      pushChunk(0, n, 0, m);
    }

    var assigned = Array.from({ length: n }, function () { return []; });
    var nextMatchAt = new Array(ops.length);
    var nextBase = null;
    for (var t = ops.length - 1; t >= 0; t--) {
      if (ops[t].type === 'M') nextBase = ops[t].i;
      nextMatchAt[t] = nextBase;
    }

    var lastBase = null;
    ops.forEach(function (op, idx) {
      if (op.type === 'M') {
        assigned[op.i].push(safeWitness[op.j]);
        lastBase = op.i;
        return;
      }
      if (op.type === 'D') {
        lastBase = op.i;
        return;
      }
      var rightBase = nextMatchAt[idx];
      var target = bestBaseForInsertion(lastBase, rightBase, safeBase, safeWitness[op.j]);
      var dropInsertSim = options && options.dropInsertSim != null ? options.dropInsertSim : null;
      if (dropInsertSim != null) {
        var insSim = segmentSimilarity(safeBase[target], safeWitness[op.j]);
        if (insSim < dropInsertSim) {
          return;
        }
      }
      assigned[target].push(safeWitness[op.j]);
    });

    return assigned.map(function (parts) { return parts.join(' ').trim(); });
  }

  function alignmentQuality(baseSegs, alignedWitness) {
    var n = baseSegs.length;
    if (!n) return { avg: 0, lowRatio: 0, emptyRatio: 0, tailAvg: 0, tailLowRatio: 0, scores: [], lowCount: 0, emptyCount: 0, tailLowCount: 0, tailEmptyCount: 0, tailCount: 0 };
    var scores = new Array(n);
    var sum = 0;
    var low = 0;
    var empty = 0;
    for (var i = 0; i < n; i++) {
      var a = baseSegs[i] || '';
      var b = alignedWitness[i] || '';
      if (!String(b || '').trim()) empty += 1;
      var s = segmentSimilarity(a, b);
      scores[i] = s;
      sum += s;
      if (s < 0.25) low += 1;
    }
    var tailStart = Math.max(0, Math.floor(n * 0.75));
    var tailCount = Math.max(1, n - tailStart);
    var tailSum = 0;
    var tailLow = 0;
    var tailEmpty = 0;
    for (var t = tailStart; t < n; t++) {
      var s = scores[t] || 0;
      tailSum += s;
      if (s < 0.25) tailLow += 1;
      if (!String(alignedWitness[t] || '').trim()) tailEmpty += 1;
    }
    return {
      avg: sum / n,
      lowRatio: low / n,
      emptyRatio: empty / n,
      tailAvg: tailSum / tailCount,
      tailLowRatio: tailLow / tailCount,
      scores: scores,
      lowCount: low,
      emptyCount: empty,
      tailLowCount: tailLow,
      tailEmptyCount: tailEmpty,
      tailCount: tailCount,
    };
  }

  function alignmentScore(q) {
    if (!q) return -1;
    // Non-empty average: quality of actual matches (ignoring gaps)
    var nonEmptyCount = 0;
    var nonEmptySum = 0;
    if (q.scores) {
      for (var i = 0; i < q.scores.length; i++) {
        if (q.scores[i] > 0) { nonEmptySum += q.scores[i]; nonEmptyCount++; }
      }
    }
    var nea = nonEmptyCount > 0 ? nonEmptySum / nonEmptyCount : 0;
    // Blend: high-quality matches + moderate gaps > many weak matches
    return nea * 0.55 + q.avg * 0.45
      - (q.lowRatio * 0.12)
      - (q.emptyRatio * 0.08)
      + (q.tailAvg * 0.14)
      - (q.tailLowRatio * 0.08);
  }

  function tailScore(q) {
    if (!q) return -1;
    return q.tailAvg - (q.tailLowRatio * 0.25) - (q.emptyRatio * 0.15);
  }

  function reverseArray(arr) {
    return arr.slice().reverse();
  }

  function alignDirectional(baseSegs, witnessText, options, reverse, alignOpts) {
    var b = reverse ? reverseArray(baseSegs) : baseSegs;
    var variants = [
      splitSynopsisText(witnessText),
      splitSynopsisTextWithOptions(witnessText, { longSegmentTokens: 22, minMergeTokens: 3, chunkSize: 16 }),
      splitSynopsisTextWithOptions(witnessText, { longSegmentTokens: 30, minMergeTokens: 5, chunkSize: 20 }),
      splitSynopsisTextWithOptions(witnessText, { longSegmentTokens: 18, minMergeTokens: 2, chunkSize: 14 }),
    ];

    var best = null;
    variants.forEach(function (wSegs) {
      var w = reverse ? reverseArray(wSegs) : wSegs;
      var aligned = alignToBase(b, w, Object.assign({ maxCells: (options && options.maxCells) || 180000 }, alignOpts || {}));
      if (reverse) aligned = reverseArray(aligned);
      var q = alignmentQuality(baseSegs, aligned);
      var score = alignmentScore(q);
      if (!best || score > best.score) {
        best = { aligned: aligned, score: score, q: q };
      }
    });
    return best;
  }

  function reconcileAligned(baseSegs, a, b) {
    return intersectionReconcile(baseSegs, a, b);
  }

  // Intersection-based bidirectional reconciliation.
  // Forward alignment anchors the start; reverse anchors the end.
  // Only keeps a match where both directions AGREE on similar content.
  // Where they disagree, a gap ("window") is placed.
  // Result: uniform start + uniform end + gaps naturally in the middle.
  function intersectionReconcile(baseSegs, fwd, rev) {
    var n = baseSegs.length;
    if (!n) return [];
    var out = new Array(n);
    for (var i = 0; i < n; i++) {
      var fText = String(fwd[i] || '').trim();
      var rText = String(rev[i] || '').trim();
      var fEmpty = !fText;
      var rEmpty = !rText;

      // Both empty → gap
      if (fEmpty && rEmpty) { out[i] = ''; continue; }

      // One empty, one has content → the direction with content matched here
      // but the other direction left a gap. Keep if the match is decent.
      if (fEmpty !== rEmpty) {
        var txt = fEmpty ? rText : fText;
        var sim = segmentSimilarity(baseSegs[i], txt);
        out[i] = sim >= 0.40 ? txt : '';
        continue;
      }

      // Both have content — check if they agree
      var mutual = segmentSimilarity(fText, rText);
      var fSim = segmentSimilarity(baseSegs[i], fText);
      var rSim = segmentSimilarity(baseSegs[i], rText);

      // Strong mutual agreement — both directions assigned similar content
      if (mutual >= 0.35) {
        out[i] = fSim >= rSim ? fText : rText;
        continue;
      }

      // Both have decent individual match to base
      if (fSim >= 0.45 && rSim >= 0.45) {
        out[i] = fSim >= rSim ? fText : rText;
        continue;
      }

      // One is clearly strong and the other clearly weak
      if (fSim >= 0.55 && rSim < 0.25) { out[i] = fText; continue; }
      if (rSim >= 0.55 && fSim < 0.25) { out[i] = rText; continue; }

      // Disagreement — this is a "window" (gap in the middle)
      out[i] = '';
    }
    return out;
  }

  // Consensus reconciliation across multiple candidates.
  // Keeps a match only where enough candidates agree on similar content.
  function consensusReconcile(baseSegs, candidates) {
    var n = baseSegs.length;
    if (!n) return [];
    if (candidates.length < 2) return candidates.length === 1 ? candidates[0].aligned.slice() : new Array(n).fill('');

    var out = new Array(n);
    for (var i = 0; i < n; i++) {
      var assignments = [];
      for (var c = 0; c < candidates.length; c++) {
        var text = String(candidates[c].aligned[i] || '').trim();
        if (text) {
          assignments.push({ text: text, sim: segmentSimilarity(baseSegs[i], text) });
        }
      }

      // Fewer than 40% of candidates have content → gap
      if (assignments.length < candidates.length * 0.4) { out[i] = ''; continue; }

      // Find the assignment that most others agree with
      var bestText = '';
      var bestAgreement = -1;
      for (var a = 0; a < assignments.length; a++) {
        var agreeCount = 0;
        for (var b = 0; b < assignments.length; b++) {
          if (a === b) continue;
          if (segmentSimilarity(assignments[a].text, assignments[b].text) >= 0.35) agreeCount++;
        }
        var score = assignments[a].sim * 0.5 + (agreeCount / Math.max(1, assignments.length - 1)) * 0.5;
        if (score > bestAgreement) {
          bestAgreement = score;
          bestText = assignments[a].text;
        }
      }

      // Only keep if consensus is strong enough
      out[i] = bestAgreement >= 0.30 ? bestText : '';
    }
    return out;
  }

  function splitWitnessByBaseLengths(witnessText, baseLenA, baseLenB) {
    var toks = String(witnessText || '').split(/\s+/).filter(Boolean);
    if (!toks.length) return ['', ''];
    var total = (baseLenA || 0) + (baseLenB || 0);
    var takeA;
    if (!total) {
      takeA = Math.floor(toks.length / 2);
    } else {
      takeA = Math.round(toks.length * (baseLenA / total));
    }
    takeA = Math.max(1, Math.min(toks.length - 1, takeA));
    var a = toks.slice(0, takeA).join(' ');
    var b = toks.slice(takeA).join(' ');
    return [a, b];
  }

  function lengthScore(aLen, bLen) {
    var ra = Math.max(1, aLen);
    var rb = Math.max(1, bLen);
    var ratio = Math.log(rb / ra);
    var v = Math.min(1, Math.abs(ratio) / 1.2);
    return 1 - v;
  }

  function alignByLengthDP(baseSegs, witSegs) {
    var n = baseSegs.length;
    var m = witSegs.length;
    if (!n) return [];
    if (!m) return Array.from({ length: n }, function () { return ''; });

    var baseLens = baseSegs.map(function (s) { return Math.max(1, tokenizeText(s).length); });
    var witLens = witSegs.map(function (s) { return Math.max(1, tokenizeText(s).length); });

    var NEG = -1e9;
    var dp = Array.from({ length: n + 1 }, function () { return Array(m + 1).fill(NEG); });
    var back = Array.from({ length: n + 1 }, function () { return Array(m + 1).fill(null); });
    dp[0][0] = 0;

    var pen12 = 0.08;
    var pen21 = 0.08;
    var pen22 = 0.12;
    // Reduce gap penalties to allow missing/empty witness windows.
    var pen10 = 0.28;
    var pen01 = 0.25;

    for (var i = 0; i <= n; i++) {
      for (var j = 0; j <= m; j++) {
        var cur = dp[i][j];
        if (cur <= NEG / 2) continue;

        if (i < n && j < m) {
          var s11 = lengthScore(baseLens[i], witLens[j]);
          var v11 = cur + s11;
          if (v11 > dp[i + 1][j + 1]) {
            dp[i + 1][j + 1] = v11;
            back[i + 1][j + 1] = { op: '11', i: i, j: j };
          }
        }
        if (i < n && j + 1 < m) {
          var s12 = lengthScore(baseLens[i], witLens[j] + witLens[j + 1]) - pen12;
          var v12 = cur + s12;
          if (v12 > dp[i + 1][j + 2]) {
            dp[i + 1][j + 2] = v12;
            back[i + 1][j + 2] = { op: '12', i: i, j: j };
          }
        }
        if (i + 1 < n && j < m) {
          var s21 = lengthScore(baseLens[i] + baseLens[i + 1], witLens[j]) - pen21;
          var v21 = cur + s21;
          if (v21 > dp[i + 2][j + 1]) {
            dp[i + 2][j + 1] = v21;
            back[i + 2][j + 1] = { op: '21', i: i, j: j };
          }
        }
        if (i + 1 < n && j + 1 < m) {
          var s22 = lengthScore(baseLens[i] + baseLens[i + 1], witLens[j] + witLens[j + 1]) - pen22;
          var v22 = cur + s22;
          if (v22 > dp[i + 2][j + 2]) {
            dp[i + 2][j + 2] = v22;
            back[i + 2][j + 2] = { op: '22', i: i, j: j };
          }
        }
        if (i < n) {
          var v10 = cur - pen10;
          if (v10 > dp[i + 1][j]) {
            dp[i + 1][j] = v10;
            back[i + 1][j] = { op: '10', i: i, j: j };
          }
        }
        if (j < m) {
          var v01 = cur - pen01;
          if (v01 > dp[i][j + 1]) {
            dp[i][j + 1] = v01;
            back[i][j + 1] = { op: '01', i: i, j: j };
          }
        }
      }
    }

    var ops = [];
    var ii = n;
    var jj = m;
    while (ii > 0 || jj > 0) {
      var b = back[ii][jj];
      if (!b) break;
      ops.push(b);
      ii = b.i;
      jj = b.j;
    }
    ops.reverse();

    var assigned = Array.from({ length: n }, function () { return []; });
    var lastBase = 0;
    ops.forEach(function (op) {
      if (op.op === '11') {
        assigned[op.i].push(witSegs[op.j]);
        lastBase = op.i;
        return;
      }
      if (op.op === '12') {
        assigned[op.i].push((witSegs[op.j] + ' ' + witSegs[op.j + 1]).trim());
        lastBase = op.i;
        return;
      }
      if (op.op === '21') {
        var split = splitWitnessByBaseLengths(witSegs[op.j], baseLens[op.i], baseLens[op.i + 1]);
        assigned[op.i].push(split[0]);
        assigned[op.i + 1].push(split[1]);
        lastBase = op.i + 1;
        return;
      }
      if (op.op === '22') {
        assigned[op.i].push(witSegs[op.j]);
        assigned[op.i + 1].push(witSegs[op.j + 1]);
        lastBase = op.i + 1;
        return;
      }
      if (op.op === '10') {
        lastBase = op.i;
        return;
      }
      if (op.op === '01') {
        var target = Math.max(0, Math.min(n - 1, lastBase));
        assigned[target].push(witSegs[op.j]);
      }
    });

    return assigned.map(function (parts) { return parts.join(' ').trim(); });
  }

  function alignLengthVariants(baseSegs, witnessText) {
    var variants = [
      splitSynopsisText(witnessText),
      splitSynopsisTextWithOptions(witnessText, { longSegmentTokens: 22, minMergeTokens: 3, chunkSize: 16 }),
      splitSynopsisTextWithOptions(witnessText, { longSegmentTokens: 30, minMergeTokens: 5, chunkSize: 20 }),
      splitSynopsisTextWithOptions(witnessText, { longSegmentTokens: 18, minMergeTokens: 2, chunkSize: 14 }),
    ];
    var best = null;
    variants.forEach(function (wSegs) {
      var aligned = alignByLengthDP(baseSegs, wSegs);
      var q = alignmentQuality(baseSegs, aligned);
      var score = alignmentScore(q);
      if (!best || score > best.score) best = { aligned: aligned, score: score, q: q };
    });
    return best;
  }

  function matchScoreFromSim(sim, opts) {
    var s = (sim * 4.2) - 2.2;
    if (sim < (opts && opts.lowSimThreshold != null ? opts.lowSimThreshold : 0.25)) {
      s -= (opts && opts.lowSimPenalty != null ? opts.lowSimPenalty : 1.2);
    }
    return s;
  }

  function alignByMergeDP(baseSegs, witSegs, options) {
    var n = baseSegs.length;
    var m = witSegs.length;
    if (!n) return [];
    if (!m) return Array.from({ length: n }, function () { return ''; });

    var NEG = -1e9;
    var dp = Array.from({ length: n + 1 }, function () { return Array(m + 1).fill(NEG); });
    var back = Array.from({ length: n + 1 }, function () { return Array(m + 1).fill(null); });
    dp[0][0] = 0;

    var pen12 = (options && options.pen12 != null) ? options.pen12 : 0.12;
    var pen21 = (options && options.pen21 != null) ? options.pen21 : 0.12;
    var pen10 = (options && options.pen10 != null) ? options.pen10 : 0.30;
    var pen01 = (options && options.pen01 != null) ? options.pen01 : 0.28;
    var minMatchSim = (options && options.minMatchSim != null) ? options.minMatchSim : 0.18;
    var positionBias = (options && options.positionBias) || 0;

    for (var i = 0; i <= n; i++) {
      for (var j = 0; j <= m; j++) {
        var cur = dp[i][j];
        if (cur <= NEG / 2) continue;

        // Position bias: favor matches near start of array
        var posBonusI = 0;
        if (positionBias && n > 1) {
          posBonusI = positionBias * (1 - 2 * (i / (n - 1)));
        }

        if (i < n && j < m) {
          var s11 = segmentSimilarity(baseSegs[i], witSegs[j]);
          if (s11 >= minMatchSim) {
            var v11 = cur + matchScoreFromSim(s11, options) + posBonusI;
            if (v11 > dp[i + 1][j + 1]) {
              dp[i + 1][j + 1] = v11;
              back[i + 1][j + 1] = { op: '11', i: i, j: j };
            }
          }
        }
        if (i < n && j + 1 < m) {
          var s12 = segmentSimilarity(baseSegs[i], (witSegs[j] + ' ' + witSegs[j + 1]).trim());
          if (s12 >= minMatchSim) {
            var v12 = cur + matchScoreFromSim(s12, options) + posBonusI - pen12;
            if (v12 > dp[i + 1][j + 2]) {
              dp[i + 1][j + 2] = v12;
              back[i + 1][j + 2] = { op: '12', i: i, j: j };
            }
          }
        }
        if (i + 1 < n && j < m) {
          var s21 = segmentSimilarity((baseSegs[i] + ' ' + baseSegs[i + 1]).trim(), witSegs[j]);
          if (s21 >= minMatchSim) {
            var v21 = cur + matchScoreFromSim(s21, options) + posBonusI - pen21;
            if (v21 > dp[i + 2][j + 1]) {
              dp[i + 2][j + 1] = v21;
              back[i + 2][j + 1] = { op: '21', i: i, j: j };
            }
          }
        }
        if (i < n) {
          var v10 = cur - pen10;
          if (v10 > dp[i + 1][j]) {
            dp[i + 1][j] = v10;
            back[i + 1][j] = { op: '10', i: i, j: j };
          }
        }
        if (j < m) {
          var v01 = cur - pen01;
          if (v01 > dp[i][j + 1]) {
            dp[i][j + 1] = v01;
            back[i][j + 1] = { op: '01', i: i, j: j };
          }
        }
      }
    }

    var ops = [];
    var ii = n;
    var jj = m;
    while (ii > 0 || jj > 0) {
      var b = back[ii][jj];
      if (!b) break;
      ops.push(b);
      ii = b.i;
      jj = b.j;
    }
    ops.reverse();

    var assigned = Array.from({ length: n }, function () { return []; });
    var lastBase = 0;
    ops.forEach(function (op) {
      if (op.op === '11') {
        assigned[op.i].push(witSegs[op.j]);
        lastBase = op.i;
        return;
      }
      if (op.op === '12') {
        assigned[op.i].push((witSegs[op.j] + ' ' + witSegs[op.j + 1]).trim());
        lastBase = op.i;
        return;
      }
      if (op.op === '21') {
        var split = splitWitnessByBaseLengths(witSegs[op.j], tokenizeText(baseSegs[op.i]).length, tokenizeText(baseSegs[op.i + 1]).length);
        assigned[op.i].push(split[0]);
        assigned[op.i + 1].push(split[1]);
        lastBase = op.i + 1;
        return;
      }
      if (op.op === '10') {
        lastBase = op.i;
        return;
      }
      if (op.op === '01') {
        var drop = options && options.dropInsertSim != null ? options.dropInsertSim : null;
        var target = Math.max(0, Math.min(n - 1, lastBase));
        if (drop != null) {
          var sim = segmentSimilarity(baseSegs[target], witSegs[op.j]);
          if (sim < drop) return;
        }
        assigned[target].push(witSegs[op.j]);
      }
    });

    return assigned.map(function (parts) { return parts.join(' ').trim(); });
  }

  function alignMergeVariants(baseSegs, witnessText, reverse, options) {
    var variants = [
      splitSynopsisText(witnessText),
      splitSynopsisTextWithOptions(witnessText, { longSegmentTokens: 22, minMergeTokens: 3, chunkSize: 16 }),
      splitSynopsisTextWithOptions(witnessText, { longSegmentTokens: 30, minMergeTokens: 5, chunkSize: 20 }),
      splitSynopsisTextWithOptions(witnessText, { longSegmentTokens: 18, minMergeTokens: 2, chunkSize: 14 }),
    ];
    var best = null;
    variants.forEach(function (wSegs) {
      var b = reverse ? reverseArray(baseSegs) : baseSegs;
      var w = reverse ? reverseArray(wSegs) : wSegs;
      var aligned = alignByMergeDP(b, w, options || {});
      if (reverse) aligned = reverseArray(aligned);
      var q = alignmentQuality(baseSegs, aligned);
      var score = alignmentScore(q);
      if (!best || score > best.score) best = { aligned: aligned, score: score, q: q };
    });
    return best;
  }

  function segmentByBaseLengths(baseSegs, witnessText) {
    var n = baseSegs.length;
    if (!n) return [];
    var words = String(witnessText || '').split(/\s+/).filter(Boolean);
    if (!words.length) return Array.from({ length: n }, function () { return ''; });
    var baseLens = baseSegs.map(function (s) { return Math.max(1, tokenizeText(s).length); });
    var totalBase = baseLens.reduce(function (a, b) { return a + b; }, 0) || 1;

    var counts = baseLens.map(function (len) {
      return Math.max(1, Math.round(words.length * (len / totalBase)));
    });
    var sumCounts = counts.reduce(function (a, b) { return a + b; }, 0);
    while (sumCounts > words.length) {
      for (var i = 0; i < counts.length && sumCounts > words.length; i++) {
        if (counts[i] > 1) { counts[i] -= 1; sumCounts -= 1; }
      }
    }
    while (sumCounts < words.length) {
      var idx = 0;
      var best = -1;
      for (var j = 0; j < counts.length; j++) {
        if (counts[j] > best) { best = counts[j]; idx = j; }
      }
      counts[idx] += 1;
      sumCounts += 1;
    }

    var out = [];
    var cur = 0;
    for (var k = 0; k < n; k++) {
      var take = counts[k];
      out.push(words.slice(cur, cur + take).join(' '));
      cur += take;
    }
    return out;
  }

  function alignToBaseRefined(baseSegs, witnessText, options) {
    var safeBase = Array.isArray(baseSegs) ? baseSegs : [];
    var text = String(witnessText || '');
    var maxCells = (options && options.maxCells) || 180000;
    var minScore = (options && options.minScore) || 0.55;
    // Position bias makes forward anchor the start and reverse anchor the end.
    // This creates true asymmetry: forward is strong at start/weak at end,
    // reverse is strong at end/weak at start. Intersection → gaps in the middle.
    var alignOptsBase = { minMatchSim: 0.18, dropInsertSim: 0.25, useAnchors: false, positionBias: 0.8 };
    var forwardBest = alignDirectional(safeBase, text, { maxCells: maxCells }, false, alignOptsBase);
    var reverseBest = alignDirectional(safeBase, text, { maxCells: maxCells }, true, alignOptsBase);
    var mergeForward = alignMergeVariants(safeBase, text, false, { minMatchSim: 0.18, dropInsertSim: 0.25, positionBias: 0.8 });
    var mergeReverse = alignMergeVariants(safeBase, text, true, { minMatchSim: 0.18, dropInsertSim: 0.25, positionBias: 0.8 });
    var lengthBest = alignLengthVariants(safeBase, text);

    // Always run gap-heavy variants to ensure gaps are properly placed
    var gapHeavyForward = null;
    var gapHeavyReverse = null;
    var gapOpts = { gapOpen: 0.40, gapExt: 0.08, minMatchSim: 0.22, lowSimThreshold: 0.28, lowSimPenalty: 1.5, dropInsertSim: 0.28, useAnchors: false, positionBias: 1.2 };
    gapHeavyForward = alignDirectional(safeBase, text, { maxCells: maxCells }, false, gapOpts);
    gapHeavyReverse = alignDirectional(safeBase, text, { maxCells: maxCells }, true, gapOpts);

    var candidates = [];
    if (forwardBest) { forwardBest._dir = 'forward'; candidates.push(forwardBest); }
    if (reverseBest) { reverseBest._dir = 'reverse'; candidates.push(reverseBest); }
    if (mergeForward) { mergeForward._dir = 'forward'; candidates.push(mergeForward); }
    if (mergeReverse) { mergeReverse._dir = 'reverse'; candidates.push(mergeReverse); }
    if (lengthBest) candidates.push(lengthBest);
    if (gapHeavyForward) { gapHeavyForward._dir = 'forward'; candidates.push(gapHeavyForward); }
    if (gapHeavyReverse) { gapHeavyReverse._dir = 'reverse'; candidates.push(gapHeavyReverse); }

    // --- Intersection-based bidirectional reconciliation ---
    // Forward anchors the start, reverse anchors the end.
    // Intersection keeps only matches where both directions agree;
    // disagreements become gaps ("windows") that naturally cluster in the middle.
    var fwdCands = candidates.filter(function (c) { return c._dir === 'forward'; });
    var revCands = candidates.filter(function (c) { return c._dir === 'reverse'; });

    fwdCands.forEach(function (fc) {
      revCands.forEach(function (rc) {
        var reconciled = intersectionReconcile(safeBase, fc.aligned, rc.aligned);
        var qrec = alignmentQuality(safeBase, reconciled);
        var srec = alignmentScore(qrec);
        candidates.push({ aligned: reconciled, score: srec, q: qrec, _dir: 'blended' });
      });
    });

    // Consensus reconciliation: use ALL directional candidates together
    var multiCands = candidates
      .filter(function (c) { return c._dir === 'forward' || c._dir === 'reverse'; })
      .map(function (c) { return { aligned: c.aligned, dir: c._dir }; });
    if (multiCands.length >= 2) {
      var consRec = consensusReconcile(safeBase, multiCands);
      var qcons = alignmentQuality(safeBase, consRec);
      var scons = alignmentScore(qcons);
      candidates.push({ aligned: consRec, score: scons, q: qcons, _dir: 'blended' });
    }

    if (!candidates.length) {
      return alignToBase(safeBase, splitSynopsisText(text), { maxCells: maxCells });
    }

    var best = candidates[0];
    for (var i = 0; i < candidates.length; i++) {
      if (!best) { best = candidates[i]; continue; }
      if (candidates[i].score > best.score) best = candidates[i];
    }
    // Prefer blended (intersection) candidates — they anchor both start AND end
    var bestBlended = null;
    candidates.forEach(function (c) {
      if (c._dir !== 'blended') return;
      if (!bestBlended || c.score > bestBlended.score) bestBlended = c;
    });
    if (bestBlended && best !== bestBlended) {
      if (bestBlended.score >= best.score - 0.06) {
        best = bestBlended;
      }
    }

    // If the tail degrades, splice in the best tail from another candidate.
    var tailStart = Math.max(0, Math.floor(safeBase.length * 0.75));
    var bestTailScore = tailScore(best.q);
    var bestTail = best;
    for (var t = 0; t < candidates.length; t++) {
      var tc = candidates[t];
      var ts = tailScore(tc.q);
      if (ts > bestTailScore) {
        bestTailScore = ts;
        bestTail = tc;
      }
    }
    if (bestTail && bestTail !== best && bestTailScore >= 0.5 && bestTailScore > tailScore(best.q) + 0.05) {
      var merged = best.aligned.slice(0, tailStart).concat(bestTail.aligned.slice(tailStart));
      var qmerged = alignmentQuality(safeBase, merged);
      var smerged = alignmentScore(qmerged);
      if (smerged > best.score - 0.02) {
        best = { aligned: merged, score: smerged, q: qmerged };
      }
    }

    if (best.q.avg < minScore || best.q.lowRatio > 0.35 || best.q.emptyRatio > 0.40) {
      var lengthSegs = segmentByBaseLengths(safeBase, text);
      var q2 = alignmentQuality(safeBase, lengthSegs);
      var score2 = alignmentScore(q2);
      if (score2 > best.score) {
        lengthSegs._summary = {
          avg: q2.avg, tailAvg: q2.tailAvg,
          gaps: q2.emptyCount, tailGaps: q2.tailEmptyCount,
          low: q2.lowCount, tailLow: q2.tailLowCount,
        };
        return lengthSegs;
      }
    }

    // Final pass: force gaps if match similarity is too low.
    var minMatchFinal = (options && options.minMatchSimFinal) || 0.28;
    for (var k = 0; k < best.aligned.length; k++) {
      var sim = segmentSimilarity(safeBase[k] || '', best.aligned[k] || '');
      if (sim < minMatchFinal) best.aligned[k] = '';
    }

    var qfinal = alignmentQuality(safeBase, best.aligned);
    best.aligned._summary = {
      avg: qfinal.avg, tailAvg: qfinal.tailAvg,
      gaps: qfinal.emptyCount, tailGaps: qfinal.tailEmptyCount,
      low: qfinal.lowCount, tailLow: qfinal.tailLowCount,
    };
    return best.aligned;
  }

  window.SarfattiAlignment = {
    normalizeToken: normalizeToken,
    tokenizeText: tokenizeText,
    textJaccard: textJaccard,
    splitSynopsisText: splitSynopsisText,
    segmentSimilarity: segmentSimilarity,
    alignToBase: alignToBase,
    alignToBaseRefined: alignToBaseRefined,
  };
})();
