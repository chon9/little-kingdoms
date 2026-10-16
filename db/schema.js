import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
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
