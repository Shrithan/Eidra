// Cesium loads its web workers and widget assets from a static folder; copy them into public/ so Vite serves them.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
const from = 'node_modules/cesium/Build/Cesium'
const to = 'public/cesium'
if (!existsSync(from)) { console.error('cesium is not installed, run npm install first'); process.exit(1) }
mkdirSync(to, { recursive: true })
for (const dir of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) cpSync(`${from}/${dir}`, `${to}/${dir}`, { recursive: true })
