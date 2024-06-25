import knex from "knex"
import { User } from "./user"
import { Schema } from "./schema"

export class GroupExistsError extends Error {}
export class GroupInvalidError extends Error {}
export class GroupProgramError extends Error {}
export class GroupHasMemberError extends Error {}
export class GroupNotAMemberError extends Error {}

export class GroupAdmin {
  public schema: Schema

  constructor(public db: knex.Knex | knex.Knex.Transaction) {
    this.schema = new Schema(db, "group_schema", [
      {
        up: async (db) => {
          await db.schema.createTable("group_names", (table) => {
            table.increments("id")
            table.string("name").notNullable().unique()
            table
              .datetime("created")
              .notNullable()
              .defaultTo(db.fn.now())
            table.index("name", "group_names_name_index")
          })
        },
        down: async (db) => {
          await db.schema.dropTableIfExists("group_names")
        },
      },
      {
        up: async (db) => {
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
            table
              .datetime("added")
              .notNullable()
              .defaultTo(db.fn.now())
          })
        },
        down: async (db) => {
          await db.schema.dropTableIfExists("group_names")
        },
      },
    ])
  }

  async create(name: string): Promise<Group> {
    if (await this.exists(name)) {
      throw new GroupExistsError(
        `Failed to create group: Group with name '${name}' already exists.`
      )
    }

    await this.db("group_names").insert({ name })
    return await this.get(name)
  }

  async exists(name: string): Promise<boolean> {
    const groupResult = await this.db
      .select("id")
      .from("group_names")
      .where({ name })
    return groupResult.length > 0
  }

  async get(name: string): Promise<Group> {
    const groupResult = await this.db
      .select("id", "name")
      .from("group_names")
      .where({ name })

    if (groupResult.length === 0) {
      throw new GroupInvalidError(
        `Failed to ge group '${name}': No group with that name exists.`
      )
    }

    const row = groupResult[0]
    return new Group(this.db, row.id, row.name)
  }

  async remove(name: string): Promise<void> {
    if (!(await this.exists(name))) {
      throw new GroupInvalidError(
        `Failed to remove group '${name}': No group with that name exists.`
      )
    }

    await this.db.del().from("group_names").where({ name })
  }

  async list(offset: number, count: number): Promise<string[]> {
    const groupResult = await this.db("group_names")
      .select("name")
      .orderBy("name", "asc")
      .offset(offset)
      .limit(count)

    const groupNames: string[] = groupResult.map((row) => row.name)

    return groupNames
  }
}

export class Group {
  static db: knex.Knex | null = null

  constructor(
    private db: knex.Knex,
    private id: number,
    private name: string
  ) {}

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
      throw new GroupNotAMemberError(
        `Failed to remove user '${user.getUsername()}' from group: User not in group.`
      )
    }

    await this.db
      .del()
      .from("group_members")
      .where({ user_id: user.getId(), group_id: this.getId() })
  }
}
