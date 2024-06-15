import knex from "knex"
import crypto from "crypto"

export class SessionProgramError extends Error {}
export class SessionInvalidError extends Error {}
export class SessionExpiredError extends Error {}

export interface Lifetime {
  years?: number
  months?: number
  weeks?: number
  days?: number
  hours?: number
  minutes?: number
  seconds?: number
  milliseconds?: number
}

export class Session {
  static db: knex.Knex | null = null

  constructor(
    private db: knex.Knex,
    private id: number,
    private token: string,
    private userId: number | null,
    private expirationDate: Date | null
  ) {}

  private static lifetimeToMs(t: Lifetime): number {
    const completeTime: Lifetime = {
      years: 0,
      months: 0,
      weeks: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    }
    Object.assign(completeTime, t)
    return (
      (completeTime.milliseconds as number) +
      (completeTime.seconds as number) * 1000 +
      (completeTime.minutes as number) * 60 * 1000 +
      (completeTime.hours as number) * 60 * 60 * 1000 +
      (completeTime.days as number) * 24 * 60 * 60 * 1000 +
      (completeTime.weeks as number) * 7 * 24 * 60 * 60 * 1000 +
      (completeTime.months as number) * 30.5 * 24 * 60 * 60 * 1000 +
      (completeTime.years as number) * 365 * 24 * 60 * 60 * 1000
    )
  }

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

    if (schemaVersion < 2) {
      await db.schema.alterTable("session_tokens", (table) => {
        table.datetime("expires")
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

  static async create(
    lifetime: Lifetime = { days: 30 }
  ): Promise<Session> {
    const db = this.ensureDatabaseConnection()
    const token = this.generateToken(20)
    const lifetimeMs = this.lifetimeToMs(lifetime)
    const expirationDate = new Date(new Date().getTime() + lifetimeMs)
    const id = await db("session_tokens").insert({
      session_token: token,
      user_id: null,
      expires: expirationDate,
    })
    return new Session(db, id[0], token, null, expirationDate)
  }

  static async open(token: string): Promise<Session> {
    const db = this.ensureDatabaseConnection()
    const sessionResult = await db
      .select("id", "session_token", "user_id", "expires")
      .from("session_tokens")
      .where({ session_token: token })

    if (sessionResult.length === 0) {
      throw new SessionInvalidError(
        `Failed to open session: Invalid token.`
      )
    }

    const row = sessionResult[0]
    const expirationDate = row.expires ? new Date(row.expires) : null

    if (
      expirationDate &&
      expirationDate.getTime() < new Date().getTime()
    ) {
      throw new SessionExpiredError(
        "Failed to open session: The session has expired."
      )
    }

    return new Session(
      db,
      row.id,
      row.session_token,
      row.user_id,
      expirationDate
    )
  }

  getId(): number {
    return this.id
  }

  getToken(): string {
    return this.token
  }

  getUserId(): number | null {
    return this.userId
  }

  getExpirationDate(): Date | null {
    return this.expirationDate
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

  async updateLifetime(lifetime: Lifetime) {
    const expirationDate = new Date(
      new Date().getTime() + Session.lifetimeToMs(lifetime)
    )
    await this.db("session_tokens")
      .update({ expires: expirationDate })
      .where({ id: this.id })
    this.expirationDate = expirationDate
  }
}
