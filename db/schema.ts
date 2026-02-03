import { pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const projectStatusEnum = pgEnum('project_status', ['active', 'archived', 'draft']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  slug: text('slug').notNull().unique(),
  status: projectStatusEnum('status').default('draft').notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const projectsRelations = {
  owner: {
    fields: [projects.ownerId],
    references: [users.id],
  },
};
