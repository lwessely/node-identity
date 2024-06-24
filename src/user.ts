import knex from "knex"
import bcrypt from "bcrypt"
import { Session, SessionInvalidError } from "./session"
import { Schema } from "./schema"

export class UserProgramError extends Error {}
export class UserExistsError extends Error {}
export class UserInvalidError extends Error {}
export class UserAuthenticationError extends Error {}

export class UserAdmin {
  public schema: Schema

  constructor(public db: knex.Knex | knex.Knex.Transaction) {
    this.schema = new Schema(db, "user_schema", [
      {
        up: async (db) => {
          await db.schema.createTable("user_accounts", (table) => {
            table.increments("id")
            table.string("username").notNullable().unique()
            table.string("password")
            table
              .datetime("created")
              .notNullable()
              .defaultTo(db.fn.now())
            table.index("username", "user_accounts_username_index")
          })
        },
        down: async (db) => {
          await db.schema.dropTableIfExists("user_accounts")
        },
      },
      {
        up: async (db) => {
          await db.schema.createTable("user_data", (table) => {
            table.increments("id")
            table
              .integer("user_id")
              .unsigned()
              .notNullable()
              .references("id")
              .inTable("user_accounts")
              .onDelete("CASCADE")
            table.string("key").notNullable()
            table.string("value").notNullable()
            table
              .string("type", 7)
              .notNullable()
              .checkIn(["string", "number", "boolean"])
          })
        },
        down: async (db) => {
          await db.schema.dropTableIfExists("user_data")
        },
      },
    ])
  }

  async exists(username: string): Promise<boolean> {
    const userIdResult = await this.db
      .select("id")
      .from("user_accounts")
      .where({ username })
    return userIdResult.length > 0
  }

  async create(username: string): Promise<User> {
    if (await this.exists(username)) {
      throw new UserExistsError(
        `Failed to create user '${username}': A user with that name already exists.`
      )
    }

    await this.db
      .insert({ username, password: null })
      .into("user_accounts")

    return await this.get(username)
  }

  async get(username: string): Promise<User> {
    const userResult = await this.db
      .select("id")
      .from("user_accounts")
      .where({ username })

    if (userResult.length === 0) {
      throw new UserInvalidError(
        `Failed to get user '${username}': No such user.`
      )
    }

    const { id } = userResult[0]
    const groupResult = await this.db
      .select("group_names.name")
      .from("group_members")
      .leftJoin(
        "group_names",
        "group_members.group_id",
        "group_names.id"
      )
      .where({ user_id: id as number })
    const groups = groupResult.map((row) => row.name)

    return new User(this.db, id as number, username, false, groups)
  }

  async fromSession(session: Session) {
    const userId = session.getUserId()

    if (userId === null) {
      throw new UserAuthenticationError(
        "Failed to get user from session: There is no user" +
          " authenticated with the session provided."
      )
    }

    const userResult = await this.db
      .select("username")
      .from("user_accounts")
      .where({ id: userId })

    if (userResult.length === 0) {
      throw new UserInvalidError(
        `Failed to get user with id '${userId}' from session: No such user.`
      )
    }

    const groupResult = await this.db
      .select("group_names.name")
      .from("group_members")
      .leftJoin(
        "group_names",
        "group_members.group_id",
        "group_names.id"
      )
      .where({ user_id: userId })
    const groups = groupResult.map((row) => row.name)

    const { username } = userResult[0]
    return new User(this.db, userId, username, true, groups)
  }

  async remove(username: string): Promise<void> {
    if (!(await this.exists(username))) {
      throw new UserInvalidError(
        `Failed to remove user '${username}': No such user.`
      )
    }

    await this.db.del().from("user_accounts").where({ username })
  }
}

export class User {
  static db: knex.Knex | null = null

  constructor(
    private db: knex.Knex,
    private id: number,
    private username: string,
    private authenticated: boolean = false,
    private groups: string[]
  ) {}

  getId(): number {
    return this.id
  }

  getUsername(): string {
    return this.username
  }

  listGroups(): string[] {
    return this.groups
  }

  async setPassword(password: string): Promise<void> {
    const hash = await bcrypt.hash(password, 10)
    await this.db("user_accounts")
      .update({ password: hash })
      .where({ id: this.id })
  }

  async verifyPassword(password: string): Promise<boolean> {
    const userResult = await this.db
      .select("password")
      .from("user_accounts")
      .where({ id: this.id })

    if (userResult.length === 0) {
      throw new UserInvalidError(
        `Failed to verify password: User '${this.username}' with id '${this.id}' does not exist.`
      )
    }

    const hash = userResult[0].password

    if (hash === null) {
      return false
    }

    return await bcrypt.compare(password, hash)
  }

  async authenticate(password: string) {
    if (!(await this.verifyPassword(password))) {
      throw new UserAuthenticationError(
        `Failed to authenticate user '${this.username}': Wrong password .`
      )
    }

    this.authenticated = true
  }

  async login(session: Session, password: string) {
    await this.authenticate(password)
    await session.setUserId(this.id)
  }

  async logout(session: Session) {
    if (!this.authenticated) {
      throw new UserAuthenticationError(
        `Cannot log out user '${this.username}': Not authenticated.`
      )
    }

    if (session.getUserId() !== this.id) {
      throw new SessionInvalidError(
        `Cannot log user '${this.username}' out of session: The user is not logged in with the session provided.`
      )
    }

    await session.discardUserId()
    this.authenticated = false
  }

  isAuthenticated() {
    return this.authenticated
  }

  requireAuthentication() {
    if (!this.authenticated) {
      throw new UserAuthenticationError(
        "Action aborted: User is not authenticated."
      )
    }
  }

  async setItems(data: { [key: string]: string | number | boolean }) {
    const updateItems = async (
      db: knex.Knex | knex.Knex.Transaction
    ) => {
      for (const [key, value] of Object.entries(data)) {
        let type = typeof value
        await db
          .del()
          .from("user_data")
          .where({ user_id: this.id, key })
        await db("user_data").insert({
          user_id: this.id,
          key,
          value: `${value}`,
          type,
        })
      }
    }

    if (this.db.isTransaction) {
      await updateItems(this.db)
    } else {
      await this.db.transaction(async (trx) => {
        await updateItems(trx)
      })
    }
  }

  async removeItems(keys: string[]) {
    await this.db
      .del()
      .from("user_data")
      .whereIn("key", keys)
      .andWhere({ user_id: this.id })
  }

  async getItems(keys: string[]): Promise<{
    [key: string]: string | number | boolean
  }> {
    const dataResult = await this.db
      .select("key", "value", "type")
      .from("user_data")
      .whereIn("key", keys)
      .andWhere({ user_id: this.id })
    const result: { [key: string]: string | number | boolean } = {}

    for (const row of dataResult) {
      const { key, type } = row
      let { value } = row

      switch (type) {
        case "number":
          value = parseFloat(value)
          break
        case "boolean":
          value = value === "true"
          break
      }

      result[key] = value
    }

    return result
  }
}
