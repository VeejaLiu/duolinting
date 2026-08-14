# MySQL Schema Migrations

`infra/mysql/migrations` is the authoritative schema migration directory.

## File Types

- `VyyyyMMddNNNN__description.sql`: versioned migrations. Use these for table, column, index, and schema changes.
- `R__description.sql`: repeatable SQL. Use these only for tiny built-in reference rows that must stay stable across environments.

## Rules

- Runtime backend code must not create, alter, or seed tables.
- Database tables use `id bigint unsigned auto_increment primary key`.
- Do not add database foreign keys.
- Do not put lesson catalog content, test content, or large seed data in migrations.
- Existing migration files are immutable after they have been applied to any shared or production database. Add a new versioned migration instead.
- Repeatable migrations may be updated when their stable reference SQL changes; Flyway reruns them when the checksum changes. Keep them idempotent and data-preserving.
- For MySQL 8.4 upserts, use a row alias after `VALUES (...)` instead of the deprecated `VALUES(column)` function.

`init.sql` is kept as a legacy local bootstrap snapshot. New deployments should run Flyway against `infra/mysql/migrations`.
