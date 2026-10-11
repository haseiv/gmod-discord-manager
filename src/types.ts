export type TicketTypeKey = "amnesty" | "complaint" | "helper";

export interface TicketTypeConfig {
  key: TicketTypeKey;
  label: string;
  description: string;
  emoji?: string;
  categoryId?: string;
  supportRoleId?: string;
  enabled: boolean;
}

export interface GuildConfig {
  ticketLogChannelId?: string;
  reportChannelId?: string;
  reportReviewerRoleId?: string;
  securityLogChannelId?: string;
  securityEnabled: boolean;
  raidJoinLimit: number;
  raidWindowSeconds: number;
  minAccountAgeHours: number;
  nukeActionLimit: number;
  nukeWindowSeconds: number;
  voiceLobbyChannelId?: string;
  voiceCategoryId?: string;
  ticketTypes: Record<TicketTypeKey, TicketTypeConfig>;
}

export interface TempVoice {
  guildId: string;
  ownerId: string;
  createdAt: string;
  locked: boolean;
  hidden: boolean;
}

export interface PlayerStat {
  steamId64: string;
  name: string;
  money: number;
  playtimeMinutes: number;
  kills: number;
  updatedAt: string;
}

export interface ServerStat {
  serverId: string;
  serverName: string;
  online: number;
  maxPlayers: number;
  updatedAt: string;
  players: Record<string, PlayerStat>;
}

export interface DatabaseShape {
  guilds: Record<string, GuildConfig>;
  servers: Record<string, ServerStat>;
  openTickets: Record<string, { ownerId: string; type: TicketTypeKey; createdAt: string }>;
  tempVoices: Record<string, TempVoice>;
}
