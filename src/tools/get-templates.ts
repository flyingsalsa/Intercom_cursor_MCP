import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

export const getTemplatesSchema = z.object({});

export async function getTemplates(_input: Record<string, never>, templateDocPath: string) {
  const resolved = path.resolve(templateDocPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Template file not found: ${resolved}`);
  }

  const ext = path.extname(resolved).toLowerCase();
  if (ext !== ".md") {
    throw new Error(`Only .md files are supported. Use responses.md for full context (persona, templates, workflows).`);
  }

  return fs.readFileSync(resolved, "utf-8");
}
