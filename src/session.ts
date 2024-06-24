import knex from "knex"
import crypto from "crypto"
import { Schema } from "./schema"

export class SessionProgramError extends Error {}
export class SessionInvalidError extends Error {}
export class SessionExpiredError extends Error {}
export class SessionRenewalError extends Error {}

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

export class SessionAdmin {
  public schema: Schema

  constructor(public db: knex.Knex | knex.Knex.Transaction) {
    this.schema = new Schema(db, "session_schema", [
      {
        up: async (db) => {
          await db.schema.createTable("session_tokens", (table) => {
            table.increments("id")
            table.string("session_token").notNullable().unique()
            table
              .integer("user_id")
              .unsigned()
              .references("id")
              .inTable("user_accounts")
              .onDelete("SET NULL")
            table.datetime("expires")
            table.string("renewal_token")
            table.datetime("renewable_until")
            table
              .datetime("created")
              .notNullable()
              .defaultTo(db.fn.now())
            table.index(
              "session_token",
              "session_tokens_session_token_index"
            )
          })
        },
        down: async (db) => {
          await db.schema.dropTableIfExists("session_tokens")
        },
      },
    ])
  }

  static lifetimeToMs(t: Lifetime): number {
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

  private generateToken(byteCount: number): string {
    return crypto.randomBytes(byteCount).toString("hex")
  }

  async create(
    lifetime: Lifetime = { days: 30 },
    renewalPeriod: Lifetime = { days: 90 }
  ): Promise<Session> {
    const token = this.generateToken(20)
    const lifetimeMs = SessionAdmin.lifetimeToMs(lifetime)
    const expirationDate = new Date(new Date().getTime() + lifetimeMs)
    const renewalToken = this.generateToken(20)
    const renewalPeriodMs = SessionAdmin.lifetimeToMs(renewalPeriod)
    const renewableUntilDate = new Date(
      new Date().getTime() + lifetimeMs + renewalPeriodMs
    )
    const id = await this.db("session_tokens").insert({
      session_token: token,
      user_id: null,
      expires: expirationDate,
      renewal_token: renewalToken,
      renewable_until: renewableUntilDate,
    })
    return new Session(
      this.db,
      id[0],
      token,
      null,
      expirationDate,
      renewalToken,
      renewableUntilDate
    )
  }

  async renew(
    sessionToken: string,
    lifetime: Lifetime,
    renewalToken: string,
    renewalPeriod: Lifetime
  ): Promise<Session> {
    const sessionResult = await this.db
      .select("id", "user_id", "renewable_until")
      .from("session_tokens")
      .where({
        session_token: sessionToken,
        renewal_token: renewalToken,
      })

    if (sessionResult.length === 0) {
      throw new SessionRenewalError(
        "Session renewal failed: Could not find matching session and renewal token with valid renewal period."
      )
    }

    const row = sessionResult[0]

    if (row.renewable_until) {
      const renewableUntil = new Date(row.renewable_until)

      if (new Date().getTime() > renewableUntil.getTime()) {
        throw new SessionRenewalError(
          "Session renewal failed: Renewal period has expired."
        )
      }
    }

    const newToken = this.generateToken(20)
    const newRenewalToken = this.generateToken(20)
    const lifetimeMs = SessionAdmin.lifetimeToMs(lifetime)
    const expirationDate = new Date(new Date().getTime() + lifetimeMs)
    const renewalPeriodMs = SessionAdmin.lifetimeToMs(renewalPeriod)
    const renewableUntilDate = new Date(
      new Date().getTime() + lifetimeMs + renewalPeriodMs
    )

    await this.db("session_tokens")
      .update({
        session_token: newToken,
        expires: expirationDate,
        renewal_token: newRenewalToken,
        renewable_until: renewableUntilDate,
      })
      .where({ id: row.id })

    return new Session(
      this.db,
      row.id,
      newToken,
      row.user_id,
      expirationDate,
      newRenewalToken,
      renewableUntilDate
    )
  }

  async purge(): Promise<void> {
    await this.db
      .del()
      .from("session_tokens")
      .where("renewable_until", "<", new Date())
  }

  async open(token: string): Promise<Session> {
    const sessionResult = await this.db
      .select(
        "id",
        "session_token",
        "user_id",
        "expires",
        "renewal_token",
        "renewable_until"
      )
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

    const renewableUntil = row.renewable_until
      ? new Date(row.renewable_until)
      : null

    return new Session(
      this.db,
      row.id,
      row.session_token,
      row.user_id,
      expirationDate,
      row.renewal_token,
      renewableUntil
    )
  }
}

export class Session {
  static db: knex.Knex | null = null

  constructor(
    private db: knex.Knex,
    private id: number,
    private token: string,
    private userId: number | null,
    private expirationDate: Date | null,
    private renewalToken: string | null,
    private renewableUntil: Date | null
  ) {}

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

  getRenewalToken(): string | null {
    return this.renewalToken
  }

  getRenewableUntilDate(): Date | null {
    return this.renewableUntil
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

  async updateLifetime(lifetime: Lifetime, renewalPeriod: Lifetime) {
    const lifetimeMs = SessionAdmin.lifetimeToMs(lifetime)
    const expirationDate = new Date(new Date().getTime() + lifetimeMs)
    const renewableUntilDate = new Date(
      expirationDate.getTime() +
        SessionAdmin.lifetimeToMs(renewalPeriod)
    )
    await this.db("session_tokens")
      .update({
        expires: expirationDate,
        renewable_until: renewableUntilDate,
      })
      .where({ id: this.id })
    this.expirationDate = expirationDate
    this.renewableUntil = renewableUntilDate
  }
}
