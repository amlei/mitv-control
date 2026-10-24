// ddc-helper — macOS DDC/CLI 传输层（IOAVService + DCPAVServiceProxy 精确配对）
// 设计依据：Crisp DDCService（MIT）的防御规则；命令：
//   list                                   → 通道与显示器配对表（JSON）
//   get  <vendor> <model> <vcp>            → 读 VCP（3 次尝试，只认校验和合法应答）
//   set  <vendor> <model> <vcp> <value>    → 写 VCP（写后回读校验）
import AppKit
import IOKit
import Foundation

typealias IOAVServiceRef = UnsafeMutableRawPointer
@_silgen_name("IOAVServiceCreateWithService")
func IOAVServiceCreateWithService(_ allocator: CFAllocator?, _ service: io_service_t) -> IOAVServiceRef?
@_silgen_name("IOAVServiceReadI2C")
func IOAVServiceReadI2C(_ service: IOAVServiceRef, _ chip: UInt32, _ offset: UInt32,
                        _ buffer: UnsafeMutableRawPointer, _ size: UInt32) -> IOReturn
@_silgen_name("IOAVServiceWriteI2C")
func IOAVServiceWriteI2C(_ service: IOAVServiceRef, _ chip: UInt32, _ dataAddress: UInt32,
                         _ buffer: UnsafeMutableRawPointer, _ size: UInt32) -> IOReturn

func className(_ entry: io_service_t) -> String? {
    let buf = UnsafeMutablePointer<CChar>.allocate(capacity: 128)
    defer { buf.deallocate() }
    guard IOObjectGetClass(entry, buf) == KERN_SUCCESS else { return nil }
    return String(cString: buf)
}

func u32(_ value: Any?) -> UInt32? {
    if let v = value as? UInt32 { return v }
    if let v = value as? Int { return UInt32(bitPattern: Int32(truncatingIfNeeded: v)) }
    if let v = value as? NSNumber { return v.uint32Value }
    return nil
}

struct Channel {
    let service: IOAVServiceRef
    let vendor: UInt32
    let model: UInt32
    let serial: UInt32
    let name: String
    let acked: Bool
}

/// 与 Crisp 相同的遍历策略：IOService 平面深度优先，「最近一次见到的身份」归属通道
func enumerateChannels() -> [Channel] {
    let root = IORegistryGetRootEntry(kIOMainPortDefault)
    var iterator: io_iterator_t = 0
    guard IORegistryEntryCreateIterator(root, kIOServicePlane,
            IOOptionBits(kIORegistryIterateRecursively), &iterator) == KERN_SUCCESS else { return [] }
    var channels: [Channel] = []
    var lastVendor: UInt32 = 0
    var lastModel: UInt32 = 0
    var lastSerial: UInt32 = 0
    var lastName = "none"
    var entry = IOIteratorNext(iterator)
    while entry != IO_OBJECT_NULL {
        if let da = IORegistryEntryCreateCFProperty(entry, "DisplayAttributes" as CFString,
                kCFAllocatorDefault, 0)?.takeRetainedValue() as? [String: Any],
           let pa = da["ProductAttributes"] as? [String: Any],
           let vendor = u32(pa["LegacyManufacturerID"]), let product = u32(pa["ProductID"]) {
            lastVendor = vendor
            lastModel = product
            lastSerial = u32(pa["SerialNumber"]) ?? 0
            lastName = pa["ProductName"] as? String ?? "?"
        }
        if className(entry) == "DCPAVServiceProxy" {
            let location = IORegistryEntryCreateCFProperty(entry, "Location" as CFString,
                kCFAllocatorDefault, 0)?.takeRetainedValue() as? String
            if location == nil || location == "External",
               let av = IOAVServiceCreateWithService(kCFAllocatorDefault, entry) {
                var probe = [UInt8](repeating: 0, count: 32)
                let acked = IOAVServiceReadI2C(av, 0x37, 0x51, &probe, 32) == kIOReturnSuccess
                channels.append(Channel(service: av, vendor: lastVendor, model: lastModel,
                                        serial: lastSerial, name: lastName, acked: acked))
            }
        }
        IOObjectRelease(entry)
        entry = IOIteratorNext(iterator)
    }
    IOObjectRelease(iterator)
    IOObjectRelease(root)
    return channels
}

func findChannel(vendor: UInt32, model: UInt32) -> Channel? {
    let all = enumerateChannels()
    return all.first { $0.acked && $0.vendor == vendor && $0.model == model }
        ?? (all.count == 1 && all[0].acked ? all[0] : nil)
}

/// DDC/CI GET：写 [0x82,0x01,vcp]+校验，读 12 字节应答，验头与校验和，3 次尝试
func ddcGet(_ ch: Channel, _ vcp: UInt8) -> (current: UInt16, max: UInt16)? {
    for _ in 1...3 {
        var chk = UInt8(0x6E ^ 0x51)
        let payload: [UInt8] = [0x82, 0x01, vcp]
        for b in payload { chk ^= b }
        var req = payload + [chk]
        guard IOAVServiceWriteI2C(ch.service, 0x37, 0x51, &req, UInt32(req.count)) == kIOReturnSuccess else {
            Thread.sleep(forTimeInterval: 0.12); continue
        }
        Thread.sleep(forTimeInterval: 0.04)
        var reply = [UInt8](repeating: 0, count: 12)
        guard IOAVServiceReadI2C(ch.service, 0x37, 0x51, &reply, UInt32(reply.count)) == kIOReturnSuccess else {
            Thread.sleep(forTimeInterval: 0.12); continue
        }
        let headerOK = reply[0] == 0x6E && reply[2] == 0x02 && reply[3] == 0x00 && reply[4] == vcp
        var expected = UInt8(0x50)
        for b in reply[0...9] { expected ^= b }
        let checksumOK = expected == reply[10]
        guard headerOK, checksumOK else { Thread.sleep(forTimeInterval: 0.12); continue }
        let cur = (UInt16(reply[8]) << 8) | UInt16(reply[9])
        let max = (UInt16(reply[6]) << 8) | UInt16(reply[7])
        guard max > 0, cur <= max else { Thread.sleep(forTimeInterval: 0.12); continue }
        return (cur, max)
    }
    return nil
}

/// DDC/CI SET：写 [0x84,0x03,vcp,hi,lo]+校验
func ddcSet(_ ch: Channel, _ vcp: UInt8, _ value: UInt16) -> Bool {
    var chk = UInt8(0x6E ^ 0x51)
    let payload: [UInt8] = [0x84, 0x03, vcp, UInt8((value >> 8) & 0xFF), UInt8(value & 0xFF)]
    for b in payload { chk ^= b }
    var buf = payload + [chk]
    return IOAVServiceWriteI2C(ch.service, 0x37, 0x51, &buf, UInt32(buf.count)) == kIOReturnSuccess
}

func jstr(_ s: String) -> String { "\"" + s.replacingOccurrences(of: "\"", with: "\\\"") + "\"" }

// ---- 命令分发 ----
let args = Array(CommandLine.arguments.dropFirst())
let cmd = args.first ?? "list"

switch cmd {
case "list":
    let displays = NSScreen.screens.compactMap { screen -> String? in
        guard let id = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID,
              CGDisplayIsBuiltin(id) == 0 else { return nil }
        return "{\"id\":\(id),\"name\":\(jstr(screen.localizedName)),\"vendor\":\(CGDisplayVendorNumber(id)),\"model\":\(CGDisplayModelNumber(id)),\"serial\":\(CGDisplaySerialNumber(id))}"
    }
    let channels = enumerateChannels().enumerated().map { (i, ch) in
        "{\"index\":\(i),\"vendor\":\(ch.vendor),\"model\":\(ch.model),\"serial\":\(ch.serial),\"name\":\(jstr(ch.name)),\"acked\":\(ch.acked)}"
    }
    print("{\"displays\":[\(displays.joined(separator: ","))],\"channels\":[\(channels.joined(separator: ","))]}")

case "get":
    // get <vendor> <model> <vcp>
    guard args.count >= 4, let vendor = UInt32(args[1]), let model = UInt32(args[2]),
          let vcp = UInt8(args[3], radix: 16) else { print("{\"error\":\"bad args\"}"); exit(1) }
    guard let ch = findChannel(vendor: vendor, model: model) else { print("{\"error\":\"channel not found\"}"); exit(2) }
    if let r = ddcGet(ch, vcp) {
        print("{\"ok\":true,\"current\":\(r.current),\"max\":\(r.max)}")
    } else {
        print("{\"ok\":false,\"error\":\"no valid reply after 3 attempts\"}"); exit(3)
    }

case "set":
    // set <vendor> <model> <vcp> <value>
    guard args.count >= 5, let vendor = UInt32(args[1]), let model = UInt32(args[2]),
          let vcp = UInt8(args[3], radix: 16), let value = UInt16(args[4]) else { print("{\"error\":\"bad args\"}"); exit(1) }
    guard let ch = findChannel(vendor: vendor, model: model) else { print("{\"error\":\"channel not found\"}"); exit(2) }
    let wrote = ddcSet(ch, vcp, value)
    Thread.sleep(forTimeInterval: 0.15)
    let readback = ddcGet(ch, vcp)
    // 某些显示器读回有延迟/不支持，写 ack 即算送达；读回一致则 verified
    if let r = readback {
        print("{\"ok\":\(wrote),\"verified\":\(r.current == value),\"current\":\(r.current)}")
    } else {
        print("{\"ok\":\(wrote),\"verified\":false}")
    }

default:
    print("usage: ddc-helper list | get <vendor> <model> <vcpHex> | set <vendor> <model> <vcpHex> <value>")
}
