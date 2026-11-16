import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTwoFactor1794770742551 implements MigrationInterface {
  name = 'AddTwoFactor1794770742551';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "totp_secret" varchar,
      ADD COLUMN "totp_enabled" boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "totp_enabled",
      DROP COLUMN "totp_secret"
    `);
  }
}
