import { GroupAdmin } from "./group"
import { SessionAdmin } from "./session"
import { UserAdmin } from "./user"
import knex from "knex"

export class IdentityNestedAtomicOperationError extends Error {}

export type AtomicOperationCallback = (
  identity: Identity
) => Promise<void>

export class Identity {
  public session: SessionAdmin
  public user: UserAdmin
  public group: GroupAdmin

  constructor(public db: knex.Knex | knex.Knex.Transaction) {
    this.session = new SessionAdmin(db)
    this.user = new UserAdmin(db)
    this.group = new GroupAdmin(db)
  }

  async atomicOperation(callback: AtomicOperationCallback) {
    if (this.db.isTransaction) {
      throw new IdentityNestedAtomicOperationError(
        "You are not allowed to nest atomic operations."
      )
    }

    await this.db.transaction(async (trx) => {
      const identity = new Identity(trx)
      await callback(identity)
    })
  }
}
