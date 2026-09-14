'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronDB', {
  // Read
  getAll: (table) => ipcRenderer.invoke('db:getAll', table),
  getById: (table, id) => ipcRenderer.invoke('db:getById', table, id),
  getMeta: (key) => ipcRenderer.invoke('db:getMeta', key),

  // Write
  upsert: (table, row) => ipcRenderer.invoke('db:upsert', table, row),
  insert: (table, row) => ipcRenderer.invoke('db:insert', table, row),
  update: (table, id, row) => ipcRenderer.invoke('db:update', table, id, row),
  remove: (table, id) => ipcRenderer.invoke('db:remove', table, id),
  clearTable: (table) => ipcRenderer.invoke('db:clearTable', table),
  setMeta: (key, value) => ipcRenderer.invoke('db:setMeta', key, value),

  // Bulk
  saveAll: (data) => ipcRenderer.invoke('db:saveAll', data),
  loadAll: () => ipcRenderer.invoke('db:loadAll'),

  // Utility
  dbPath: () => ipcRenderer.invoke('db:path'),
  isElectron: true,
});
