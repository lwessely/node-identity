# README
> A simple library for managing users, user groups, and sessions

> **Note:** This package is still in alpha. API stability is not guaranteed,
> and it would be unwise to use it in production.

## Introduction
This package helps you to quickly add user accounts, user groups, and sessions in your APIs/WebApps.

## Change log
### v0.4.1
- Added feature: User names can be listed with paging functionality
- Added feature: Group names can be listed with paging functionality
- Added feature: Users can be searched for by their indexed data, with paging functionality

### v0.4.0
- Breaking change: Moved all static methods from the Group, Session, and User classes to their new respective *Admin classes
- Breaking change: New table schema & setup incompatible with previous one
- Introduced new Identity class that allows for multiple operations within one transaction

### v0.3.1
- Fixed issue: `group.removeMember()` now only removes the user from the specified group instead of all groups

### v0.3.0
- Fixed inconsistency: `group.removeMember()` now throws a `GroupNotAMemberError` instead of `GroupHasMemberError`

### v0.2.2
- Added middleware: `requireAnyGroup()`
- Added middleware: `requireAllGroups()`
- Added middleware: `requireCondition()`
- Fixed issue: Exceptions in the middleware are now passed on to express error handlers, instead of causing a crash

### v0.2.1
- Added feature: User groups

### v0.2.0
- Added feature: Expired sessions can now be renewed using renewal tokens
- Introduced breaking change to signature of method ```session.updateLifetime()```
- Introduced breaking change to interface ```RequireGuardOptions```

### v0.1.4
- Added feature: Middleware can now automatically update the lifetime of valid sessions
- Added feature: Session lifetime can be updated
- Cleaned up leaking sessions from tests

### v0.1.3
- Added tests for route options

### v0.1.2
- Added feature: Data in the from of key-value pairs can be added to users

### v0.1.1
- Added this README file.

## Installation

```sh
npm install @lwtw/identity
```

## Usage

### Connect to your database, create schema
```ts
import knex from "knex"
import { Identity } from "@lwtw/identity"

const db = knex(/* Your database connection parameters go here */)
const identity = new Identity(db) // Create a new instance of the Identity class

await identity.user.schema.build() // Create the required user tables
await identity.group.schema.build() // Create the required group tables - these reference the user_accounts table, so always build the user tables first
await identity.session.schema.build() // Create the required session tables - these reference the user_accounts table, so always build the user tables first
```

### Create a new session and get the session token
```ts
const session = await identity.session.create() // Create new session that expires after 30 days
const sessionToken = session.getToken() // Get session token
const longLivedSession = await identity.session.create({ months: 3, days: 15 }) // Create a new session that expires after 3 months and 15 days
```

### Open an existing session
```ts
const session = await identity.session.open(sessionToken) // Open an existing session - This will throw if the session token is invalid, or the session has expired
```

### Renew a session
```ts
const renewedSession = await identity.session.renew(expiredSessionToken, renewalTokenForExpiredSession) // Renew a session - this will generate a new session- and renewal token
```


### Set a timer to purge sessions with expired renewal periods from the database once a day
```ts
setInterval(() => {
  identity.session.purge() // Purges all sessions with expired renewal periods
}, 24 * 60 * 60 * 1000 /* One day in milliseconds */)
```

### Destroy a session
```ts
const session = await identity.session.open(sessionToken) // Open an existing session
await session.destroy() // Destroy the session you just opened
```

### Create a new user and set their password
```ts
const user = await identity.user.create("my-user") // Create a new user
await user.setPassword("my secret password") // Set the password for the user you just created
```

### Get a user by username
```ts
const user = await identity.user.get("my-user") // Get a user by their username
```

### Check if a user exists
```ts
await userExists = await identity.user.exists("my-user") // true if the user exists, false otherwise
```

### Get user data
```ts
const user = await identity.user.get("my-user") // Get a user
const username = user.getUsername() // Get their username
const authenticated = user.isAuthenticated() // Check whether they are currently authenticated
```

### Check if a password is correct
```ts
const user = await identity.user.get("my-user") // Get a user
const passwordIsCorrect = await user.verifyPassword("my secret password") // true if the password is correct, false otherwise
```

### Remove a user
```ts
await identity.user.remove("my-user")
```

### Authenticate a user
```ts
const user = await identity.user.get("my-user") // Get a user
await user.authenticate("my secret password") // Throws an error if the password is wrong
const userIsAutheticated = user.isAuthenticated() // Will be true if authentication succeeded
```

### Log in a user to a session
```ts
const session = await identity.session.create() // Create a new session (you could also open an existing one)
const user = await identity.user.get("my-user") // Get the user
user.login(session, "my secret password") // Log in the user - This will throw if the password is wrong
const userIsAutheticated = user.isAuthenticated() // Will be true if login succeeded
```

### Get a user from a session
```ts
const session = await identity.session.open(sessionToken) // Open an existing session
const user = await identity.user.fromSession(session) // Get the session user - this will throw if the session has no user logged in
```

### Log out a user from a session
```ts
const session = await identity.session.open(sessionToken) // Open an existing session
const user = await identity.user.fromSession(session) // Get the session user
await user.logout(session) // Log out the user from this session
```

### Deal with user data
```ts
const user = await identity.user.get("my-user") // Get a user
await user.setItems({ firstName: "Jane", lastName: "Doe", age: 28 }) // set values for custom keys 'firstName', 'lastName', and 'age'
const { firstName, age } = await user.getItems(["firstName", "age"]) // Get values for keys 'firstName' and 'age'
await user.removeItems(["firstName", "lastName"]) // Remove items 'firstName' and 'lastName'
```

### List usernames
```ts
const firstTenUsernames = await identity.user.list(0, 10) // get the first 10 usernames in alphabetical order
const secondTenUsernames = await identity.user.list(10, 10) // get the next 10 usernames in alphabetical order
```

### Index user data so it can be matched in a search
```ts
const user = await identity.user.get("my-user") // Get a user
await user.setItems(
  { firstName: "Jane", lastName: "Doe", age: 28 }, // set values for custom keys 'firstName', 'lastName', and 'age'
  true // Tell the backend to create an index of all 3 items, so they can be matched during a search operation
) 
```

### Search for users
Note that the search only looks at user data that was added using the setItems() method with indexing explicitly enabled.
```ts
const firstTenUsernames = await identity.user.list(0, 10, "jane doe") // get the first 10 usernames with indexed data matching the search string, in order of relevance
const secondTenUsernames = await identity.user.list(10, 10, "jane.doe@example.com") // get the next 10 usernames with indexed data matching the search string, in order of relevance
```

### Get names of groups the user is a member of
```ts
const user = await identity.user.get("my-user") // Get an existing user
const groupNames = user.listGroups() // Get a list of all group names the user is a member of
```

### Create a group
```ts
const newGroup = await identity.group.create("my-group") // Create a new group
const groupName = newGroup.getName() // Get the name of the newly created group
```

### Check whether a group exists
```ts
await groupExists = await identity.group.exists("my-group") // Resolves to true if the group exists, to false otherwise
```

### Get an existing group
```ts
const existingGroup = await identity.group.get("my-group") // Get an existing group named 'my-group'
```

### Add a user to a group
```ts
const group = await identity.group.get("my-group") // Get an existing group
const user = await identity.user.get("my-user") // Get an existing user
await group.addMember(user) // Add the user to the group
```

### Get usernames of group members
```ts
const group = await identity.group.get("my-group") // Get an existing group
const usernames = await group.listMembers() // Gets a list of all usernames of users that are a member of the group
```

### Check if user is a member of a group
```ts
const group = await identity.group.get("my-group") // Get an existing group
const user = await identity.user.get("my-user") // Get an existing user
const isMember = await group.hasMember(user) // Resolves to true if the user is a member of the group, to false otherwise
```

### Remove a user from a group
```ts
const group = await identity.group.get("my-group") // Get an existing group
const user = await identity.user.get("my-user") // Get an existing user
await group.removeMember(user) // Removes the user from the group
```

### List group names
```ts
const firstTenGroupNames = await identity.group.list(0, 10) // Get the first ten group names in alphabetical order
const secondTenGroupNames = await identity.group.list(10, 10) // Get the next ten group names in alphabetical order
```

### Remove a group
```ts
await identity.group.remove("my-group") // Remove a group
```

### Perform multiple operations as one atomic operation
```ts
await identity.atomicOperation(async (atomic) => {
    const user = await atomic.user.create("my-user")
    await user.setPassword("123")
    await user.setItems({
      foo: "bar",
      lorem: "ipsum",
    })

    const group = await atomic.group.create(
      "my-group"
    )
    await group.addMember(user)

    const session = await atomic.session.create()
    await user.login(session, "123")
  }) // Uses the same database transaction for all operations inside the callback
     // If an error is thrown inside the callback, all the previous operations in the callback are rolled back
```

## Express middleware

For the middleware to do its job, the session token needs to be provided as Bearer token in the
Authorization header.

### Make a valid session required for a route
```ts
import express, { Request, Response } from "express"
import { Identity, requireSession, RequestWithIdentity } from "@lwtw/identity"
import knex from "knex"

const db = knex(/* Your database connection parameters go here */)
const identity = new Identity(db) // Create a new instance of the Identity class

app = express()
app.use("/session-required/", requireSession(identity)) // This will respond with an error if the request includes no valid session token

app.get("/session-required", (req: Request, res: Response) => {
  const { session } = req as RequestWithIdentity // Get the session from the request
})
```

### Make a login required for a route
```ts
import express, { Request, Response } from "express"
import { Identity, requireLogin, RequestWithIdentity } from "@lwtw/identity"
import knex from "knex"

const db = knex(/* Your database connection parameters go here */)
const identity = new Identity(db) // Create a new instance of the Identity class

app = express()
app.use("/login-required/", requireLogin(identity)) // This will respond with an error if the request includes no valid session token with a logged in user

app.get("/login-required", (req: Request, res: Response) => {
  const { session, user } = req as RequestWithIdentity // Get the session and user from the request
})
```

### Make it a requirement for the user to be in at least one group in a list
```ts
import express, { Request, Response } from "express"
import { Identity, requireAnyGroup, RequestWithIdentity } from "@lwtw/identity"
import knex from "knex"

const db = knex(/* Your database connection parameters go here */)
const identity = new Identity(db) // Create a new instance of the Identity class

app = express()
app.use(
    "/require-any-group",
    requireAnyGroup(identity, ["this-group", "or-that-group", "or-even-this-group"])
  ) // Responds with an error if the request comes from a user who is not in at least one of these groups

app.get("/require-any-group", (req: Request, res: Response) => {
  const { session, user } = req as RequestWithIdentity // Get the session and user from the request
})
```

### Make it a requirement for the user to be in all groups in a list
```ts
import express, { Request, Response } from "express"
import { Identity, requireAllGroups, RequestWithIdentity } from "@lwtw/identity"
import knex from "knex"

const db = knex(/* Your database connection parameters go here */)
const identity = new Identity(db) // Create a new instance of the Identity class

app = express()
app.use(
    "/require-all-groups",
    requireAllGroups(identity, ["this-group", "and-this-group", "this-group-as-well"])
  ) // Responds with an error if the request comes from a user who is not in all of these groups

app.get("/require-all-groups", (req: Request, res: Response) => {
  const { session, user } = req as RequestWithIdentity // Get the session and user from the request
})
```

### Make a custom requirement
```ts
import express, { Request, Response } from "express"
import { Identity, User, Session, requireCondition, RequestWithIdentity, UserInvalidError } from "@lwtw/identity"
import knex from "knex"

const db = knex(/* Your database connection parameters go here */)
const identity = new Identity(db) // Create a new instance of the Identity class

app = express()
app.use(
    "/require-condition",
    requireCondition(identity, (req: Request, res: Response) => {
      const { session, user } = req as RequestWithIdentity // Get the session and user from the request, if they are available
      const username = user instanceof User ? user.getUsername() : ""
      const sessionId = session instanceof Session ? session.getId() : ""

      if (username !== "admin") {
        console.warn(`User '${username}' tried to access the admin area (sessionId: ${sessionId})!`)
        throw new UserInvalidError("Only the administrator is allowed here!") // Prevents access
      }
    })
  ) // Responds with an error if the callback throws or rejects with a Group*, User* or Session* error - all other errors are forwarded to express
    // You can handle other kinds of errors as well by providing a responseCallback (see 'Middleware options' below)

app.get("/require-condition", (req: Request, res: Response) => {
  const { session, user } = req as RequestWithIdentity // Get the session and user from the request
})
```

### Middleware options
You can pass an object of type ```RequireGuardOptions``` as the last argument to any `require*` middleware function to change its behavior.

```ts
export interface RequireGuardOptions {
  responseCode?: number // The HTTP-response code to send on error
  responseData?: { [key: string]: any } | string | Buffer // The response data to send on error
  headers?: { [key: string]: string } // The response headers to send on error
  responseCallback?: (
    req: Request,
    res: Response,
    error: Error
  ) => Promise<void> | void // A callback responsible for sending a response on error - if provided, the above options will have no effect
  update?:{
    lifetime: Lifetime
    renewalPeriod: Lifetime
  } // The new lifetime and renewal period for the session if a valid token was provided - by default, lifetime and renewal period remain unchanged
}
```

## Notes on caching and access control security
When you get or create a user, or open or create a session, some data is cached in the resulting object. You can assume
that any synchronous method returning data for a session or user (e.g. ```user.getUsername()```, ```session.getExpirationDate()```)
may return stale information. Consider the following two examples:

```ts
const originalSession = await identity.session.create({ days: 1 })
const sessionCopy = await identity.session.open(originalSession.getToken())
await sessionCopy.updateLifetime({ days: 10 })

originalSession.getExpirationDate() // Will return a (stale) expiration date one day in the future
sessionCopy.getExpirationDate() // Will return an accurate expiration date 10 days in the future
```

```ts
const user = await identity.user.create("my-user") // Create a new user
const group = await identity.group.create("my-group") // Create a new, empty group
await group.addMember(user) // Add user to group

const groupList = user.listGroups() // will be a stale (and thus empty) array
const memberList = await identity.group.listMembers() // will correctly contain "my-user"
```

For this reason, it is recommended to keep session and user objects alive for as short as possible. Short lifespans tend
to be the natural case for REST endpoints using the middleware provided, since the middleware checks access against a fresh instance of
a session and/or user, and adds the session and user to the ```Request``` object express passes to route handlers. Once the route handler
returns, the objects will go out of scope, and there is no risk of accessing stale data at some much later point.

WebSockets however may keep connections alive for long periods of time. In this case, it is recommended to create a new ```User```
or ```Session``` instance for each request coming in on the WebSocket, instead of keeping them around from when the connection was first
initiated. You can however cache the session token at the beginning of the connection, and reopen the session for each request, so the
client does not have to re-authenticate with every single request after the initial connection.

If you need to make sure your data is as recent as possible, you can simply re-get a user or group, or re-open a session:

```ts
let user = await identity.user.create("my-user") // Create a new user
const group = await identity.group.create("my-group") // Create a new, empty group
await group.addMember(user) // Add user to group

user = await identity.user.get(user.getUsername()) // Get a fresh instance of the user

const groupList = user.listGroups() // will correctly contain 'my-group'
const memberList = await identity.group.listMembers() // will still correctly contain 'my-user'
```

# ToDos
- Add tests to all methods that update or delete from the database to make sure only the desired row is affected