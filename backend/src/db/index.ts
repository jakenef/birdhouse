import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const DB_PATH = path.resolve(__dirname, "../../birdhouse.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL"); // better concurrent read performance

export const db = drizzle(sqlite, { schema });
