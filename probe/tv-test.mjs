// 对指定 IP 的 MiTV Assistant Server (6095) 做安全功能验证
// 只读操作 + 音量±(立即复原)，不发送 power/changesource/导航键
const HOST = process.argv[2];
const PORT = 6095;

async function call(path, timeout = 3000) {
  const res = await fetch(`http://${HOST}:${PORT}${path}`, { signal: AbortSignal.timeout(timeout) });
  const body = await res.text();
  return { status: res.status, body };
}

function pretty(label, r) {
  console.log(`\n== ${label} ==`);
  console.log(`HTTP ${r.status}`);
  try { console.log(JSON.stringify(JSON.parse(r.body), null, 2)); }
  catch { console.log(r.body.slice(0, 500)); }
}

// 1. isalive：设备名与在线状态
pretty("isalive", await call("/request?action=isalive"));

// 2. 可用性检查（MiTV-Remote 同款）
pretty("getinstalledapp", await call("/controller?action=getinstalledapp&count=1"));

// 3. 读取系统信息（拿 MAC，为 setVolum 签名做准备）
const sys = await call("/controller?action=getsysteminfo");
pretty("getsysteminfo", sys);

// 4. 读当前音量
const vol1 = await call("/controller?action=getvolume");
pretty("getvolume (前)", vol1);
let volData = {};
try { volData = JSON.parse(vol1.body).data ?? {}; } catch {}

// 5. keyevent: volumeup 一次 → 读回 → volumedown 一次 → 读回（复原）
if (typeof volData.volume === "number") {
  pretty("keyevent volumeup", await call("/controller?action=keyevent&keycode=volumeup"));
  await new Promise(r => setTimeout(r, 500));
  pretty("getvolume (加1后)", await call("/controller?action=getvolume"));
  pretty("keyevent volumedown", await call("/controller?action=keyevent&keycode=volumedown"));
  await new Promise(r => setTimeout(r, 500));
  pretty("getvolume (复原后)", await call("/controller?action=getvolume"));
}

// 6. setVolum 签名接口：设置为当前值（无副作用，验证签名是否被接受）
try {
  const sysData = JSON.parse(sys.body).data ?? {};
  const mac = (sysData.ethmac ?? sysData.wifimac ?? "").replaceAll(":", "").toLowerCase();
  if (mac) {
    const cur = typeof volData.volume === "number" ? volData.volume : 0;
    const ts = String(Math.floor(Date.now() / 1000));
    const crypto = await import("node:crypto");
    const sign = crypto.createHash("md5").update(`mitvsignsalt&${cur}&${mac}&${ts}`).digest("hex");
    pretty(`setVolum(=${cur})`, await call(`/general?action=setVolum&volum=${cur}&ts=${ts}&sign=${sign}`));
  }
} catch (e) { console.log("setVolum 测试失败:", e.message); }
