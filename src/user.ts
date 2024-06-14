import knex from "knex"
import bcrypt from "bcrypt"
import { Session, SessionInvalidError } from "./session"

export class UserProgramError extends Error {}
export class UserExistsError extends Error {}
export class UserInvalidError extends Error {}
export class UserAuthenticationError extends Error {}

export class User {
  static db: knex.Knex | null = null

  constructor(
    private db: knex.Knex,
    private id: number,
    private username: string,
    private authenticated: boolean = false
  ) {}

  private static async ensureDatabaseSchema(): Promise<void> {
    const db = this.db as knex.Knex
    let dbInitialized = await db.schema.hasTable("user_schema")

    if (!dbInitialized) {
      await db.schema.createTable("user_schema", (table) => {
        table.increments("schema_version")
      })
    }

    const schemaVersionResult = await db("user_schema")
      .select("schema_version")
      .orderBy("schema_version", "desc")
      .limit(1)
    let schemaVersion = schemaVersionResult[0] ?? 0

    if (schemaVersion < 1) {
      await db.schema.createTable("user_accounts", (table) => {
        table.increments("id")
        table.string("username").notNullable().unique()
        table.string("password")
        table.index("username", "user_accounts_username_index")
      })
      await db.insert({}).into("user_schema")
    }
  }

  private static ensureDatabaseConnection(): knex.Knex {
    if (this.db === null) {
      throw new UserProgramError(
        "Operation failed: You need to provide a database object to 'User.connect()' first."
      )
    }

    return this.db
  }

  static async connect(knex: knex.Knex): Promise<void> {
    this.db = knex
    await this.ensureDatabaseSchema()
  }

  static async exists(username: string): Promise<boolean> {
    const db = this.ensureDatabaseConnection()
    const userIdResult = await db
      .select("id")
      .from("user_accounts")
      .where({ username })
    return userIdResult.length > 0
  }

  static async create(username: string): Promise<User> {
    const db = this.ensureDatabaseConnection()

    if (await this.exists(username)) {
      throw new UserExistsError(
        `Failed to create user '${username}': A user with that name already exists.`
      )
    }

    await db
      .insert({ username, password: null })
      .into("user_accounts")

    return await User.get(username)
  }

  static async get(username: string): Promise<User> {
    const db = this.ensureDatabaseConnection()
    const userResult = await db
      .select("id")
      .from("user_accounts")
      .where({ username })

    if (userResult.length === 0) {
      throw new UserInvalidError(
        `Failed to get user '${username}': No such user.`
      )
    }

    const { id } = userResult[0]
    return new User(db, id as number, username, false)
  }

  static async fromSession(session: Session) {
    const db = this.ensureDatabaseConnection()
    const userId = session.getUserId()

    if (userId === null) {
      throw new UserAuthenticationError(
        "Failed to get user from session: There is no user" +
          " authenticated with the session provided."
      )
    }

    const userResult = await db
      .select("username")
      .from("user_accounts")
      .where({ id: userId })

    if (userResult.length === 0) {
      throw new UserInvalidError(
        `Failed to get user with id '${userId}' from session: No such user.`
      )
    }

    const { username } = userResult[0]
    return new User(db, userId, username, true)
  }

  static async remove(username: string): Promise<void> {
    if (!(await this.exists(username))) {
      throw new UserInvalidError(
        `Failed to remove user '${username}': No such user.`
      )
    }

    const db = this.ensureDatabaseConnection()
    await db.del().from("user_accounts").where({ username })
  }

  async setPassword(password: string): Promise<void> {
    const hash = await bcrypt.hash(password, 10)
    await this.db("user_accounts")
      .update({ password: hash })
      .where({ id: this.id })
  }

  getId(): number {
    return this.id
  }

  getUsername(): string {
    return this.username
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
}
