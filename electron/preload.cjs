const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('scaner', {
  getNetworkContext: () => ipcRenderer.invoke('get-network-context'),
  openLocalNetworkSettings: () => ipcRenderer.invoke('open-local-network-settings'),
  openLocationSettings: () => ipcRenderer.invoke('open-location-settings'),
  requestLocationForSsid: () => ipcRenderer.invoke('request-location-for-ssid'),
  openDeviceDetail: (device) => ipcRenderer.invoke('open-device-detail', device),
  focusMainTool: (payload) => ipcRenderer.invoke('focus-main-tool', payload || {}),
  broadcastDevicePatch: (patch) => ipcRenderer.invoke('broadcast-device-patch', patch),
  closeWindow: () => ipcRenderer.invoke('close-current-window'),
  scanSubnet: (options) => ipcRenderer.invoke('scan-subnet', options || {}),
  stopScan: () => ipcRenderer.invoke('stop-scan'),
  pingHost: (address) => ipcRenderer.invoke('ping-host', address),
  probeServices: (ip) => ipcRenderer.invoke('probe-services', ip),
  exportCsv: (payload) => ipcRenderer.invoke('export-csv', payload),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  tracerouteHost: (address) => ipcRenderer.invoke('traceroute-host', address),
  stopTraceroute: () => ipcRenderer.invoke('stop-traceroute'),
  speedTest: () => ipcRenderer.invoke('speed-test'),
  stopSpeedTest: () => ipcRenderer.invoke('stop-speed-test'),
  wakeOnLan: (payload) => ipcRenderer.invoke('wake-on-lan', payload || {}),
  refreshDeviceStatus: (ips) => ipcRenderer.invoke('refresh-device-status', ips || []),
  onScanUpdate: (handler) => {
    const listener = (_event, data) => handler(data)
    ipcRenderer.on('scan-update', listener)
    return () => ipcRenderer.removeListener('scan-update', listener)
  },
  onScanPartial: (handler) => {
    const listener = (_event, data) => handler(data)
    ipcRenderer.on('scan-partial-results', listener)
    return () => ipcRenderer.removeListener('scan-partial-results', listener)
  },
  onTracerouteLine: (handler) => {
    const listener = (_event, data) => handler(data)
    ipcRenderer.on('traceroute-line', listener)
    return () => ipcRenderer.removeListener('traceroute-line', listener)
  },
  onSpeedTestUpdate: (handler) => {
    const listener = (_event, data) => handler(data)
    ipcRenderer.on('speed-test-update', listener)
    return () => ipcRenderer.removeListener('speed-test-update', listener)
  },
  onDeviceDetailData: (handler) => {
    const listener = (_event, data) => handler(data)
    ipcRenderer.on('device-detail-data', listener)
    return () => ipcRenderer.removeListener('device-detail-data', listener)
  },
  onDevicePatch: (handler) => {
    const listener = (_event, data) => handler(data)
    ipcRenderer.on('device-patch', listener)
    return () => ipcRenderer.removeListener('device-patch', listener)
  },
  onOpenTool: (handler) => {
    const listener = (_event, data) => handler(data)
    ipcRenderer.on('open-tool', listener)
    return () => ipcRenderer.removeListener('open-tool', listener)
  },
})
