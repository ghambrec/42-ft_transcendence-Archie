import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationPreferences1793836800000 implements MigrationInterface {
  name = 'AddNotificationPreferences1793836800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "notification_active" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(
      `INSERT INTO "permissions" ("perm_key", "description") VALUES ($1, $2)
       ON CONFLICT ("perm_key") DO NOTHING`,
      ['notifications.manage', 'Create and change shared document notifications in a group'],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "user_permission" WHERE "permission_id" IN
       (SELECT "id" FROM "permissions" WHERE "perm_key" = $1)`,
      ['notifications.manage'],
    );
    await queryRunner.query(`DELETE FROM "permissions" WHERE "perm_key" = $1`, ['notifications.manage']);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "notification_active"`);
  }
}
