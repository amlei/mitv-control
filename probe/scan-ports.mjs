// 多端口 TCP 扫描 + miio UDP 广播探测
import net from "node:net";
import dgram from "node:dgram";

const TCP_PORTS = [6095, 8009, 8008, 54321, 6466, 5555, 10000, 1984];
const CONCURRENCY = 160;
const TIMEOUT = 350;

function probePort(host, port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(TIMEOUT);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    sock.connect(port, host);
  });
}

const hosts = Array.from({ length: 254 }, (_, k) => `192.168.0.${k + 1}`);
const found = {};
let i = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (i < hosts.length) {
    const host = hosts[i++];
    for (const port of TCP_PORTS) {
      if (await probePort(host, port)) {
        (found[host] ||= []).push(port);
      }
    }
  }
}));

const entries = Object.entries(found);
if (!entries.length) console.log("TCP: 无任何命中");
for (const [host, ports] of entries) console.log(`TCP ${host}: ${ports.join(", ")}`);

// miio UDP 广播
const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
const msg = Buffer.from(JSON.stringify({ id: 1, method: "miIO.info", params: {} }));
sock.on("message", (buf, rinfo) => {
  console.log(`UDP miio ${rinfo.address}:54321 => ${buf.toString().slice(0, 300)}`);
});
sock.bind(() => {
  sock.send(msg, 54321, "192.168.0.255");
});
await new Promise((r) => setTimeout(r, 3000));
sock.close();
console.log("UDP miio 广播探测完成");
