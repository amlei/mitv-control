// 扫描局域网 /24 网段，探测小米/Redmi 设备的 6095 端口（MiTV Assistant Server）
import net from "node:net";
import os from "node:os";
import http from "node:http";

const PORT = 6095;
const CONN_TIMEOUT = 300;
const HTTP_TIMEOUT = 1200;
const CONCURRENCY = 128;

function localPrefixes() {
  const out = new Set();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === "IPv4" && !ni.internal) {
        out.add(ni.address.split(".").slice(0, 3).join("."));
      }
    }
  }
  return [...out];
}

function probePort(host) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok ? host : null);
    };
    sock.setTimeout(CONN_TIMEOUT);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    sock.connect(PORT, host);
  });
}

function isalive(host) {
  return new Promise((resolve) => {
    const req = http.get({ host, port: PORT, path: "/request?action=isalive", timeout: HTTP_TIMEOUT }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    });
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}

async function pool(items, worker, size) {
  const results = [];
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) {
      const idx = i++;
      const r = await worker(items[idx]);
      if (r) results.push(r);
    }
  }));
  return results;
}

const prefixes = localPrefixes();
console.log("本机网段:", prefixes.join(", "));
for (const prefix of prefixes) {
  const hosts = Array.from({ length: 254 }, (_, k) => `${prefix}.${k + 1}`);
  const open = await pool(hosts, probePort, CONCURRENCY);
  console.log(`端口 ${PORT} 开放的主机: ${open.length ? open.join(", ") : "无"}`);
  for (const host of open) {
    const body = await isalive(host);
    console.log(`  ${host} isalive => ${body ?? "(无响应)"}`);
  }
}
