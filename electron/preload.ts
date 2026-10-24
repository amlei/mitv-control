import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('mitvDesktop', {
  isDesktop: true,
  platform: process.platform,
});
