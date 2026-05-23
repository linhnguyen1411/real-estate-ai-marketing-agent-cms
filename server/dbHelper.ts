import fs from "fs";
import path from "path";
import { Customer, Property, Post, InboxMessage, AutomationTask, AppSettings } from "../src/types";

const DB_FILE = path.join(process.cwd(), "db.json");

export interface DatabaseSchema {
  customers: Customer[];
  properties: Property[];
  inbox: InboxMessage[];
  posts: Post[];
  automations: AutomationTask[];
  settings: AppSettings;
}

// Ensure database file exists with baseline schema if missing
export function readDatabase(): DatabaseSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      console.warn("DB_FILE not found, creating baseline structure.");
      const defaultSchema: DatabaseSchema = {
        customers: [],
        properties: [],
        inbox: [],
        posts: [],
        automations: [],
        settings: {
          ai_mode: "gemini",
          ollama_endpoint: "http://localhost:11434",
          ollama_model: "qwen2.5",
          agent_tone: "sang trọng và chuyên nghiệp"
        }
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultSchema, null, 2), "utf-8");
      return defaultSchema;
    }
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("Error reading database:", error);
    return {
      customers: [],
      properties: [],
      inbox: [],
      posts: [],
      automations: [],
      settings: {
        ai_mode: "gemini",
        ollama_endpoint: "http://localhost:11434",
        ollama_model: "qwen2.5",
        agent_tone: "sang trọng và chuyên nghiệp"
      }
    };
  }
}

export function writeDatabase(db: DatabaseSchema): boolean {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("Error writing database:", error);
    return false;
  }
}
