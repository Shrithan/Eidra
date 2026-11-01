import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './storage.js';
mkdirSync(dataDir,{recursive:true,mode:0o700});
chmodSync(dataDir,0o700);
const filename=process.env.TWITCH_CLIENT_ID&&process.env.TWITCH_CLIENT_SECRET?'world.sqlite':'world-mock.sqlite';
export const db=new DatabaseSync(join(dataDir,filename));
chmodSync(join(dataDir,filename),0o600);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS streams(login TEXT PRIMARY KEY,payload TEXT NOT NULL,viewers INTEGER NOT NULL,language TEXT NOT NULL,game TEXT NOT NULL,genre TEXT NOT NULL,slot_lat REAL NOT NULL,slot_lng REAL NOT NULL,demo INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS streams_viewers ON streams(viewers DESC,login);
CREATE INDEX IF NOT EXISTS streams_language ON streams(language);
CREATE INDEX IF NOT EXISTS streams_game ON streams(game);
CREATE TABLE IF NOT EXISTS crawl AS SELECT * FROM streams WHERE 0;
CREATE UNIQUE INDEX IF NOT EXISTS crawl_login ON crawl(login);
CREATE TABLE IF NOT EXISTS optins(login TEXT PRIMARY KEY,user_id TEXT UNIQUE NOT NULL,city TEXT NOT NULL,lat REAL NOT NULL,lng REAL NOT NULL,display_lat REAL NOT NULL,display_lng REAL NOT NULL);
CREATE TABLE IF NOT EXISTS research(login TEXT PRIMARY KEY,result TEXT NOT NULL,usable INTEGER NOT NULL,genre TEXT NOT NULL,lat REAL,lng REAL,fetched_at INTEGER NOT NULL,checked_at INTEGER NOT NULL,description_hash TEXT NOT NULL,model TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS research_jobs(login TEXT PRIMARY KEY,lease_until INTEGER NOT NULL DEFAULT 0,retry_at INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS research_budget(day TEXT PRIMARY KEY,logins INTEGER NOT NULL DEFAULT 0,calls INTEGER NOT NULL DEFAULT 0,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,search_calls INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS averages(login TEXT PRIMARY KEY,value REAL NOT NULL);
`);
export function transaction<T>(fn:()=>T):T {db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}
export function getMeta(key:string):string|undefined{return (db.prepare('SELECT value FROM meta WHERE key=?').get(key) as any)?.value;}
export function setMeta(key:string,value:string){db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(key,value);}
