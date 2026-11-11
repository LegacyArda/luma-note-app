const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('luma', {
  isDesktop: true,
  showWidget: () => ipcRenderer.send('widget:show'),
  hideWidget: () => ipcRenderer.send('widget:hide'),
  toggleWidgetVisibility: () => ipcRenderer.send('widget:toggle-visibility'),
  toggleWidget: (expanded) => ipcRenderer.send('widget:expand', Boolean(expanded)),
  setWidgetPreference: (key, value) => ipcRenderer.send('widget:preference', key, value),
  openProject: (projectId) => ipcRenderer.send('main:open-project', projectId),
  onOpenProject: (callback) => ipcRenderer.on('main:open-project', (_event, id) => callback(id)),
  onWidgetVisibility: (callback) => ipcRenderer.on('widget:visibility', (_event, visible) => callback(visible)),
});
