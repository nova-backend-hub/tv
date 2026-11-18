export function goHome(audio) {
  if (goHome.leaving) return;
  goHome.leaving = true;
  if (audio) {
    audio.unlock().then((ok) => {
      if (!ok) return;
      audio.loadOverride("menu-back").then(() => audio.play("menu-back"));
      try {
        sessionStorage.setItem("openwii.homeChimed", "1");
      } catch {
      }
    }).catch(() => {
    });
  }
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;inset:0;background:#e4eaf1;opacity:0;transition:opacity .5s ease;z-index:999;pointer-events:none;";
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
  });
  try {
    sessionStorage.setItem("openwii.home", String(Date.now()));
  } catch {
  }
  setTimeout(() => {
    window.location.href = "/";
  }, 950);
}
export function consumeLaunchSplash() {
  let data;
  try {
    const raw = sessionStorage.getItem("openwii.launch");
    if (!raw) return;
    sessionStorage.removeItem("openwii.launch");
    data = JSON.parse(raw);
  } catch {
    return;
  }
  if (!data || Date.now() - (data.t || 0) > 4e3) return;
  if (!window.location.pathname.includes(`/games/${data.slug}/`)) return;
  const el = document.createElement("div");
  el.innerHTML = `<div style="font-size:17vmin;filter:drop-shadow(0 1.2vmin 2.5vmin rgba(0,0,0,.3))">${data.emoji}</div><div style="font-size:5vmin;font-weight:700;color:#fff;text-shadow:0 .3vmin 1.2vmin rgba(0,0,0,.45)">${data.title}</div>`;
  el.style.cssText = `position:fixed;inset:0;z-index:99;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2vmin;background:linear-gradient(180deg, ${data.c0}, ${data.c1});font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;transition:opacity .35s ease;pointer-events:none;`;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 450);
  }, 300);
}
