import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('rooms', {
  code: text('code').primaryKey(),
  hostHash: text('hostHash').notNull(),
  guestHash: text('guestHash'),
  hostColor: integer('hostColor').notNull(),
  level: integer('level').notNull(),
  state: text('state').notNull(),
  version: integer('version').notNull().default(0),
  expires: integer('expires').notNull()
});

export const commanders = sqliteTable('commanders', {
  id: text('id').primaryKey(),
  tokenHash: text('tokenHash').notNull(),
  displayName: text('displayName').notNull(),
  avatar: integer('avatar').notNull().default(0),
  xp: integer('xp').notNull().default(0),
  matches: integer('matches').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  created: integer('created').notNull()
}, table => [uniqueIndex('commanders_token_hash').on(table.tokenHash)]);

// Results are append-only. A unique match/commander pair makes retries harmless.
export const onlineResults = sqliteTable('online_results', {
  matchId: text('matchId').notNull(),
  commanderId: text('commanderId').notNull().references(() => commanders.id),
  won: integer('won').notNull(),
  completed: integer('completed').notNull()
}, table => [
  primaryKey({ columns: [table.matchId, table.commanderId] }),
  index('online_results_commander_won').on(table.commanderId, table.won)
]);
