import Foundation
import CoreWLAN

/// Volá se z procesu Scaner IP (po povolení Polohy) — sdílí TCC s hlavní appkou.
@_cdecl("scaner_wifi_ssid")
public func scaner_wifi_ssid(_ buffer: UnsafeMutablePointer<CChar>, _ buflen: Int32) -> Int32 {
  guard buflen > 1 else { return 0 }
  guard let ssid = CWWiFiClient.shared().interface()?.ssid(), !ssid.isEmpty else {
    buffer.pointee = 0
    return 0
  }
  let bytes = Array(ssid.utf8CString)
  let maxIndex = min(Int(buflen) - 1, bytes.count - 1)
  var i = 0
  while i < maxIndex {
    buffer[i] = bytes[i]
    i += 1
  }
  buffer[i] = 0
  return 1
}
