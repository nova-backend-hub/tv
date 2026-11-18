(function () {
  window.io = function () {
    var handlers = {};
    var ws = null;
    var queue = [];
    var connected = false;
    function fire(ev, data) {
      var list = handlers[ev] || [];
      for (var i = 0; i < list.length; i++) {
        try { list[i](data); } catch (e) {}
      }
    }
    function tvHost() {
      return (window.__TV_IP__ || localStorage.getItem('tv.ip') || '192.168.1.115').trim();
    }
    function connect() {
      var host = tvHost();
      ws = new WebSocket('ws://' + host + ':8484/ws');
      ws.onopen = function () {
        connected = true;
        while (queue.length) { ws.send(queue.shift()); }
        fire('connect');
      };
      ws.onmessage = function (m) {
        try {
          var msg = JSON.parse(m.data);
          fire(msg.ev, msg.data);
        } catch (e) {}
      };
      ws.onclose = function () {
        connected = false;
        fire('disconnect');
        setTimeout(connect, 1000);
      };
      ws.onerror = function () {
        try { ws.close(); } catch (e) {}
      };
    }
    connect();
    return {
      on: function (ev, fn) {
        (handlers[ev] = handlers[ev] || []).push(fn);
        return this;
      },
      emit: function (ev, data) {
        var payload = JSON.stringify({ ev: ev, data: data });
        if (connected && ws && ws.readyState === 1) { ws.send(payload); }
        else if (ev === 'register') { queue.push(payload); }
        return this;
      }
    };
  };
})();
