import fs from "fs";
import path from "path";
import { Company, Customer, Property, Post, InboxMessage, AutomationTask, AppSettings, User } from "../src/types";

const DB_FILE = path.join(process.cwd(), "db.json");

export interface DatabaseSchema {
  companies?: Company[];
  users?: User[];
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
        companies: [],
        users: [],
        customers: [],
        properties: [],
        inbox: [],
        posts: [],
        automations: [],
        settings: {
          ai_mode: "auto",
          ollama_endpoint: "http://localhost:11434",
          ollama_model: "qwen3:8b",
          openai_model: "gpt-5-mini",
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
      companies: [],
      users: [],
      customers: [],
      properties: [],
      inbox: [],
      posts: [],
      automations: [],
      settings: {
        ai_mode: "auto",
        ollama_endpoint: "http://localhost:11434",
        ollama_model: "qwen3:8b",
        openai_model: "gpt-5-mini",
        agent_tone: "sang trọng và chuyên nghiệp"
      }
    };
  }
}

export function writeDatabase(db: DatabaseSchema): boolean {
  try {
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), "utf-8");
    fs.renameSync(tempFile, DB_FILE);
    return true;
  } catch (error) {
    console.error("Error writing database:", error);
    return false;
  }
}
