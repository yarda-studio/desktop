/*
 * Lets Scriptura's output and stage pages run in an ordinary browser (OBS
 * Browser Source, vMix web input, a TV's browser…) instead of the app's own
 * window. The pages normally talk to the app through Tauri; here the few
 * read-only calls they make are answered over HTTP, and the app's state is
 * polled and handed to the page the same way the app pushes it to its windows.
 *
 * Expects window.__SCRIPTURA_WEB__ = { token, kind } to be set first.
 */
(function () {
  var web = window.__SCRIPTURA_WEB__;
  var key = encodeURIComponent(web.token);
  var latest = { presentation: null, countdown: null };
  var version = -1;
  var callbacks = {};

  var params = new URLSearchParams(location.search);
  if (params.get("alpha") === "1") document.documentElement.classList.add("alpha");

  function getJson(path) {
    return fetch(path + (path.indexOf("?") < 0 ? "?" : "&") + "k=" + key, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function apply(next) {
    latest = { presentation: next.presentation, countdown: next.countdown };
    if (next.presentation && window.__scripturaApplyPresentation) window.__scripturaApplyPresentation(next.presentation);
    if (next.countdown && window.__scripturaApplyCountdown) window.__scripturaApplyCountdown(next.countdown);
  }

  function poll() {
    return getJson("/o/api/state?v=" + version).then(function (r) {
      if (r.changed) {
        version = r.v;
        apply(r);
      }
    });
  }

  // The page asks for the current state when it mounts, so wait for the first answer.
  var ready = poll().catch(function () {});
  setInterval(function () { poll().catch(function () {}); }, 250);

  var windowMeta = { label: web.kind };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: function () {} };
  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: windowMeta,
      currentWebview: { label: web.kind, windowLabel: web.kind },
      windows: [windowMeta],
      webviews: [{ label: web.kind, windowLabel: web.kind }],
    },
    transformCallback: function (cb) {
      var id = Math.floor(Math.random() * 1e9);
      callbacks[id] = cb;
      return id;
    },
    unregisterCallback: function (id) { delete callbacks[id]; },
    // Video backgrounds: the page asks for a path inside the app's media folder.
    convertFileSrc: function (path) {
      return "/o/media/" + encodeURIComponent(String(path).split(/[\\/]/).pop()) + "?k=" + key;
    },
    invoke: function (cmd, args) {
      args = args || {};
      if (cmd === "get_presentation_state") return ready.then(function () { return latest.presentation; });
      if (cmd === "get_countdown_state") return ready.then(function () { return latest.countdown; });
      if (cmd === "get_media_dir") return Promise.resolve("/media");
      // The page saves display preferences when it receives them; a browser output must never write.
      if (cmd === "set_preferences") return Promise.resolve(null);
      if (cmd === "get_chapter") {
        return getJson("/o/api/chapter?module=" + encodeURIComponent(args.moduleId) + "&book=" + encodeURIComponent(args.book) + "&chapter=" + encodeURIComponent(args.chapter));
      }
      // Event listeners and window calls the page makes out of habit: accept and ignore.
      if (cmd.indexOf("plugin:") === 0) return Promise.resolve(null);
      return Promise.reject(new Error("'" + cmd + "' is not available in a browser output"));
    },
  };
})();
