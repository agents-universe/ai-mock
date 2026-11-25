import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('projects', (t) => {
    t.string('id', 36).primary();
    t.string('slug', 64).notNullable().unique();
    t.string('name', 255).notNullable();
    t.text('description').nullable();
    t.string('created_at', 40).notNullable();
    t.string('updated_at', 40).notNullable();
  });

  await knex.schema.createTable('environments', (t) => {
    t.string('id', 36).primary();
    t.string('project_id', 36).notNullable().references('id').inTable('projects').onDelete('CASCADE');
    t.string('slug', 64).notNullable();
    t.string('name', 255).notNullable();
    t.text('variables').notNullable();
    t.integer('sort_order').notNullable().defaultTo(0);
    t.string('created_at', 40).notNullable();
    t.string('updated_at', 40).notNullable();
    t.unique(['project_id', 'slug']);
  });

  await knex.schema.createTable('apis', (t) => {
    t.string('id', 36).primary();
    t.string('project_id', 36).notNullable().references('id').inTable('projects').onDelete('CASCADE');
    t.string('name', 255).notNullable();
    t.string('method', 8).notNullable();
    t.string('path', 512).notNullable();
    t.text('description').nullable();
    t.boolean('enabled').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.string('created_at', 40).notNullable();
    t.string('updated_at', 40).notNullable();
    t.unique(['project_id', 'method', 'path']);
    t.index(['project_id', 'sort_order']);
  });

  await knex.schema.createTable('response_branches', (t) => {
    t.string('id', 36).primary();
    t.string('api_id', 36).notNullable().references('id').inTable('apis').onDelete('CASCADE');
    t.string('name', 255).notNullable();
    t.integer('sort_order').notNullable().defaultTo(0);
    t.boolean('enabled').notNullable().defaultTo(true);
    t.string('condition_type', 16).notNullable().defaultTo('always');
    t.text('condition_rules').nullable();
    t.text('condition_expression').nullable();
    t.boolean('is_default').notNullable().defaultTo(false);
    t.integer('status_code').notNullable().defaultTo(200);
    t.text('headers').notNullable();
    t.integer('delay_ms').notNullable().defaultTo(0);
    t.string('content_type', 128).notNullable().defaultTo('application/json');
    t.string('body_type', 8).notNullable().defaultTo('static');
    t.text('static_body').nullable();
    t.text('script').nullable();
    t.string('created_at', 40).notNullable();
    t.string('updated_at', 40).notNullable();
    t.index(['api_id', 'sort_order']);
  });

  await knex.schema.createTable('mock_logs', (t) => {
    t.string('id', 36).primary();
    t.string('project_id', 36).nullable();
    t.string('environment_id', 36).nullable();
    t.string('api_id', 36).nullable();
    t.string('branch_id', 36).nullable();
    t.string('method', 8).notNullable();
    t.string('path', 512).notNullable();
    t.integer('status_code').nullable();
    t.integer('duration_ms').nullable();
    t.boolean('matched').notNullable().defaultTo(false);
    t.string('reason', 64).notNullable();
    t.text('request_snapshot').nullable();
    t.text('response_snapshot').nullable();
    t.string('created_at', 40).notNullable();
    t.index(['project_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('mock_logs');
  await knex.schema.dropTableIfExists('response_branches');
  await knex.schema.dropTableIfExists('apis');
  await knex.schema.dropTableIfExists('environments');
  await knex.schema.dropTableIfExists('projects');
}
