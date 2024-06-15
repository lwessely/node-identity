import knex from "knex"
import crypto from "crypto"

export class SessionProgramError extends Error {}
export class SessionInvalidError extends Error {}

export class Session {
  static db: knex.Knex | null = null

  constructor(
    private db: knex.Knex,
    private id: number,
    private token: string,
    private userId: number | null = null
  ) {}

  private static async ensureDatabaseSchema(): Promise<void> {
    const db = this.db as knex.Knex
    let dbInitialized = await db.schema.hasTable("session_schema")

    if (!dbInitialized) {
      await db.schema.createTable("session_schema", (table) => {
        table.increments("schema_version")
      })
    }

    const schemaVersionResult = await db("session_schema")
      .select("schema_version")
      .orderBy("schema_version", "desc")
      .limit(1)
    let schemaVersion = schemaVersionResult[0]?.schema_version ?? 0

    if (schemaVersion < 1) {
      await db.schema.createTable("session_tokens", (table) => {
        table.increments("id")
        table.string("session_token").notNullable().unique()
        table
          .integer("user_id")
          .unsigned()
          .references("id")
          .inTable("user_accounts")
          .onDelete("SET NULL")
        table.index(
          "session_token",
          "session_tokens_session_token_index"
        )
      })
      await db.insert({}).into("session_schema")
    }
  }

  private static ensureDatabaseConnection(): knex.Knex {
    if (this.db === null) {
      throw new SessionProgramError(
        "Operation failed: You need to provide a database object to 'Session.connect()' first."
      )
    }

    return this.db
  }

  static async connect(knex: knex.Knex): Promise<void> {
    this.db = knex
    await this.ensureDatabaseSchema()
  }

  private static generateToken(byteCount: number): string {
    return crypto.randomBytes(byteCount).toString("hex")
  }

  static async create(): Promise<Session> {
    const db = this.ensureDatabaseConnection()
    const token = this.generateToken(20)
    const id = await db("session_tokens").insert({
      session_token: token,
      user_id: null,
    })
    return new Session(db, id[0], token)
  }

  static async open(token: string): Promise<Session> {
    const db = this.ensureDatabaseConnection()
    const sessionResult = await db
      .select("id", "session_token", "user_id")
      .from("session_tokens")
      .where({ session_token: token })

    if (sessionResult.length === 0) {
      throw new SessionInvalidError(
        `Failed to open session: Invalid token.`
      )
    }

    const row = sessionResult[0]
    return new Session(db, row.id, row.session_token, row.user_id)
  }

  getId() {
    return this.id
  }

  getToken() {
    return this.token
  }

  getUserId() {
    return this.userId
  }

  async destroy() {
    await this.db.del().from("session_tokens").where({ id: this.id })
  }

  async setUserId(userId: number) {
    await this.db("session_tokens")
      .update({ user_id: userId })
      .where({ id: this.id })
    this.userId = userId
  }

  async discardUserId() {
    await this.db("session_tokens")
      .update({ user_id: null })
      .where({ id: this.id })
    this.userId = null
  }
}
