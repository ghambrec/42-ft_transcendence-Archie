import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentSearchIndexes1794681828900 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		// trigram index fuer ILIKE '%wort%'
		await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

		await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS documents_filename_trgm_idx
      ON documents USING gin (filename gin_trgm_ops)
    `);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS documents_filename_trgm_idx`);
	}
}
