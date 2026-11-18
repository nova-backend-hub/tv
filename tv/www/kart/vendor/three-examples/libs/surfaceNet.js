let surfaceNet = (dims, potential, bounds) => {
  var cube_edges = new Int32Array(24), edge_table = new Int32Array(256);
  (function() {
    var k2 = 0;
    for (var i2 = 0; i2 < 8; ++i2) {
      for (var j2 = 1; j2 <= 4; j2 <<= 1) {
        var p2 = i2 ^ j2;
        if (i2 <= p2) {
          cube_edges[k2++] = i2;
          cube_edges[k2++] = p2;
        }
      }
    }
    for (var i2 = 0; i2 < 256; ++i2) {
      var em = 0;
      for (var j2 = 0; j2 < 24; j2 += 2) {
        var a2 = !!(i2 & 1 << cube_edges[j2]), b2 = !!(i2 & 1 << cube_edges[j2 + 1]);
        em |= a2 !== b2 ? 1 << (j2 >> 1) : 0;
      }
      edge_table[i2] = em;
    }
  })();
  var buffer = new Array(4096);
  (function() {
    for (var i2 = 0; i2 < buffer.length; ++i2) {
      buffer[i2] = 0;
    }
  })();
  if (!bounds) {
    bounds = [[0, 0, 0], dims];
  }
  var scale = [0, 0, 0];
  var shift = [0, 0, 0];
  for (var i = 0; i < 3; ++i) {
    scale[i] = (bounds[1][i] - bounds[0][i]) / dims[i];
    shift[i] = bounds[0][i];
  }
  var vertices = [], faces = [], n = 0, x = [0, 0, 0], R = [1, dims[0] + 1, (dims[0] + 1) * (dims[1] + 1)], grid = [0, 0, 0, 0, 0, 0, 0, 0], buf_no = 1;
  if (R[2] * 2 > buffer.length) {
    var ol = buffer.length;
    buffer.length = R[2] * 2;
    while (ol < buffer.length) {
      buffer[ol++] = 0;
    }
  }
  for (x[2] = 0; x[2] < dims[2] - 1; ++x[2], n += dims[0], buf_no ^= 1, R[2] = -R[2]) {
    var m = 1 + (dims[0] + 1) * (1 + buf_no * (dims[1] + 1));
    for (x[1] = 0; x[1] < dims[1] - 1; ++x[1], ++n, m += 2)
      for (x[0] = 0; x[0] < dims[0] - 1; ++x[0], ++n, ++m) {
        var mask = 0, g = 0;
        for (var k = 0; k < 2; ++k)
          for (var j = 0; j < 2; ++j)
            for (var i = 0; i < 2; ++i, ++g) {
              var p = potential(
                scale[0] * (x[0] + i) + shift[0],
                scale[1] * (x[1] + j) + shift[1],
                scale[2] * (x[2] + k) + shift[2]
              );
              grid[g] = p;
              mask |= p < 0 ? 1 << g : 0;
            }
        if (mask === 0 || mask === 255) {
          continue;
        }
        var edge_mask = edge_table[mask], v = [0, 0, 0], e_count = 0;
        for (var i = 0; i < 12; ++i) {
          if (!(edge_mask & 1 << i)) {
            continue;
          }
          ++e_count;
          var e0 = cube_edges[i << 1], e1 = cube_edges[(i << 1) + 1], g0 = grid[e0], g1 = grid[e1], t = g0 - g1;
          if (Math.abs(t) > 1e-6) {
            t = g0 / t;
          } else {
            continue;
          }
          for (var j = 0, k = 1; j < 3; ++j, k <<= 1) {
            var a = e0 & k, b = e1 & k;
            if (a !== b) {
              v[j] += a ? 1 - t : t;
            } else {
              v[j] += a ? 1 : 0;
            }
          }
        }
        var s = 1 / e_count;
        for (var i = 0; i < 3; ++i) {
          v[i] = scale[i] * (x[i] + s * v[i]) + shift[i];
        }
        buffer[m] = vertices.length;
        vertices.push(v);
        for (var i = 0; i < 3; ++i) {
          if (!(edge_mask & 1 << i)) {
            continue;
          }
          var iu = (i + 1) % 3, iv = (i + 2) % 3;
          if (x[iu] === 0 || x[iv] === 0) {
            continue;
          }
          var du = R[iu], dv = R[iv];
          if (mask & 1) {
            faces.push([buffer[m], buffer[m - du], buffer[m - dv]]);
            faces.push([buffer[m - dv], buffer[m - du], buffer[m - du - dv]]);
          } else {
            faces.push([buffer[m], buffer[m - dv], buffer[m - du]]);
            faces.push([buffer[m - du], buffer[m - dv], buffer[m - du - dv]]);
          }
        }
      }
  }
  return { positions: vertices, cells: faces };
};
export { surfaceNet };
