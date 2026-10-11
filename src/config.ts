import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DISCORD_TOKEN: z.string().min(20),
  DISCORD_CLIENT_ID: z.string().min(5),
  DISCORD_GUILD_ID: z.string().optional().default(""),
  GMOD_API_SECRET: z.string().min(24),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z.string().default("./data")
});

export const env = schema.parse(process.env);
