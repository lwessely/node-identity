import knex from "knex"

export interface Migration {
  up: (db: knex.Knex) => Promise<any>
  down: (db: knex.Knex) => Promise<any>
}

export class Schema {
  constructor(
    private db: knex.Knex,
    public migrationTable: string,
    public migrations: Migration[]
  ) {}

  async createMigrationTable() {
    await this.db.schema.createTable(this.migrationTable, (table) => {
      table.integer("migration_number").unsigned().notNullable()
    })
    await this.db(this.migrationTable).insert({ migration_number: 0 })
  }

  async getCurrentMigrationNumber() {
    const migrationTableExists = await this.db.schema.hasTable(
      this.migrationTable
    )

    if (!migrationTableExists) {
      await this.createMigrationTable()
      return 0
    }

    const results = await this.db(this.migrationTable).select(
      "migration_number"
    )

    return results[0].migration_number
  }

  async incrementCurrentMigrationNumber() {
    const migrationNumber = await this.getCurrentMigrationNumber()
    await this.db(this.migrationTable).update({
      migration_number: migrationNumber + 1,
    })
  }

  async decrementCurrentMigrationNumber() {
    const migrationNumber = await this.getCurrentMigrationNumber()

    if (migrationNumber === 0) {
      return
    }

    await this.db(this.migrationTable).update({
      migration_number: migrationNumber - 1,
    })
  }

  async down() {
    const previousMigrationIndex =
      (await this.getCurrentMigrationNumber()) - 1

    if (previousMigrationIndex < 0) {
      return false
    }

    const previousMigration = this.migrations[previousMigrationIndex]

    if (!previousMigration) {
      return false
    }

    await previousMigration.down(this.db)
    await this.decrementCurrentMigrationNumber()

    return true
  }

  async up() {
    const nextMigrationIndex = await this.getCurrentMigrationNumber()
    const nextMigration = this.migrations[nextMigrationIndex]

    if (!nextMigration) {
      return false
    }

    await nextMigration.up(this.db)
    await this.incrementCurrentMigrationNumber()

    return true
  }

  async build() {
    while (await this.up()) {}
  }

  async teardown() {
    while (await this.down()) {}
  }
}
