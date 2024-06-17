import knex from "knex"
import { User } from "./user"

export class GroupExistsError extends Error {}
export class GroupInvalidError extends Error {}
export class GroupProgramError extends Error {}
export class GroupHasMemberError extends Error {}

export class Group {
  static db: knex.Knex | null = null

  constructor(
    private db: knex.Knex,
    private id: number,
    private name: string
  ) {}

  static async connect(db: knex.Knex): Promise<void> {
    this.db = db
    await this.ensureDatabaseSchema()
  }

  private static async ensureDatabaseSchema(): Promise<void> {
    const db = this.db as knex.Knex
    let dbInitialized = await db.schema.hasTable("group_schema")

    if (!dbInitialized) {
      await db.schema.createTable("group_schema", (table) => {
        table.increments("schema_version")
      })
    }

    const schemaVersionResult = await db("group_schema")
      .select("schema_version")
      .orderBy("schema_version", "desc")
      .limit(1)
    let schemaVersion = schemaVersionResult[0]?.schema_version ?? 0

    if (schemaVersion < 1) {
      await db.schema.createTable("group_names", (table) => {
        table.increments("id")
        table.string("name").notNullable().unique()
        table.index("name", "group_names_name_index")
      })
      await db.schema.createTable("group_members", (table) => {
        table.increments("id")
        table
          .integer("group_id")
          .unsigned()
          .references("id")
          .inTable("group_names")
          .onDelete("CASCADE")
        table
          .integer("user_id")
          .unsigned()
          .references("id")
          .inTable("user_accounts")
          .onDelete("CASCADE")
      })
      await db.insert({}).into("group_schema")
    }
  }

  private static ensureDatabaseConnection() {
    if (this.db === null) {
      throw new GroupProgramError(
        "Operation failed: You need to provide a database object to 'Group.connect()' first."
      )
    }

    return this.db
  }

  static async create(name: string): Promise<Group> {
    const db = this.ensureDatabaseConnection()

    if (await this.exists(name)) {
      throw new GroupExistsError(
        `Failed to create group: Group with name '${name}' already exists.`
      )
    }

    await db("group_names").insert({ name })
    return await Group.get(name)
  }

  static async exists(name: string): Promise<boolean> {
    const db = this.ensureDatabaseConnection()
    const groupResult = await db
      .select("id")
      .from("group_names")
      .where({ name })
    return groupResult.length > 0
  }

  static async get(name: string): Promise<Group> {
    const db = this.ensureDatabaseConnection()
    const groupResult = await db
      .select("id", "name")
      .from("group_names")
      .where({ name })

    if (groupResult.length === 0) {
      throw new GroupInvalidError(
        `Failed to ge group '${name}': No group with that name exists.`
      )
    }

    const row = groupResult[0]
    return new Group(db, row.id, row.name)
  }

  static async remove(name: string): Promise<void> {
    if (!(await this.exists(name))) {
      throw new GroupInvalidError(
        `Failed to remove group '${name}': No group with that name exists.`
      )
    }

    const db = this.ensureDatabaseConnection()
    await db.del().from("group_names").where({ name })
  }

  getId(): number {
    return this.id
  }

  getName(): string {
    return this.name
  }

  async addMember(user: User): Promise<void> {
    if (await this.hasMember(user)) {
      throw new GroupHasMemberError(
        `Failed to add user '${user.getUsername()}' to group: User already in group.`
      )
    }

    await this.db("group_members").insert({
      group_id: this.id,
      user_id: user.getId(),
    })
  }

  async hasMember(user: User): Promise<boolean> {
    const groupResult = await this.db
      .select("id")
      .from("group_members")
      .where({ group_id: this.id, user_id: user.getId() })
    return groupResult.length > 0
  }

  async listMembers(): Promise<string[]> {
    const groupResult = await this.db
      .select("user_accounts.username")
      .from("group_members")
      .leftJoin(
        "user_accounts",
        "user_accounts.id",
        "group_members.user_id"
      )
    const usernames = groupResult.map((row: any) => {
      return row["username"]
    })
    return usernames
  }

  async removeMember(user: User): Promise<void> {
    if (!(await this.hasMember(user))) {
      throw new GroupHasMemberError(
        `Failed to remove user '${user.getUsername()}' from group: User not in group.`
      )
    }

    await this.db
      .del()
      .from("group_members")
      .where({ user_id: user.getId() })
  }
}
