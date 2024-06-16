# README
> A simple library for managing users and sessions

> **Note:** This package is still in alpha. API stability is not guaranteed,
> and it would be unwise to use it in production.

## Introduction
This package helps you to quickly implement user accounts and sessions in your APIs/WebApps.

## Change log
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

### Connect to your database
```ts
import knex from "knex"
import { User, Session } from "@lwtw/identity"

const db = knex(/* Your database connection parameters go here */)

// This will provide the Session & User classes with your database connection,
// and also initialize and update all necessary tables
Session.connect(db)
User.connect(db)
```

### Create a new session and get the session token
```ts
const session = await Session.create() // Create new session that expires after 30 days
const sessionToken = session.getToken() // Get session token
const longLivedSession = await Session.create({ months: 3, days: 15 }) // Create a new session that expires after 3 months and 15 days
```

### Open an existing session
```ts
const session = await Session.open(sessionToken) // Open an existing session - This will throw if the session token is invalid, or the session has expired
```

### Renew a session
```ts
const renewedSession = await Session.renew(expiredSessionToken, renewalTokenForExpiredSession) // Renew a session - this will generate a new session- and renewal token
```


### Set a timer to purge sessions with expired renewal periods from the database once a day
```ts
setInterval(() => {
  Session.purge() // Purges all sessions with expired renewal periods
}, 24 * 60 * 60 * 1000 /* One day in milliseconds */)
```

### Destroy a session
```ts
const session = await Session.open(sessionToken) // Open an existing session
await session.destroy() // Destroy the session you just opened
```

### Create a new user and set their password
```ts
const user = await User.create("my-user") // Create a new user
await user.setPassword("my secret password") // Set the password for the user you just created
```

### Get a user by username
```ts
const user = await User.get("my-user") // Get a user by their username
```

### Check if a user exists
```ts
await userExists = await User.exists("my-user") // true if the user exists, false otherwise
```

### Get user data
```ts
const user = await User.get("my-user") // Get a user
const username = user.getUsername() // Get their username
const authenticated = user.isAuthenticated() // Check whether they are currently authenticated
```

### Check if a password is correct
```ts
const user = await User.get("my-user") // Get a user
const passwordIsCorrect = await user.verifyPassword("my secret password") // true if the password is correct, false otherwise
```

### Remove a user
```ts
await User.remove("my-user")
```

### Authenticate a user
```ts
const user = await User.get("my-user") // Get a user
await user.authenticate("my secret password") // Throws an error if the password is wrong
const userIsAutheticated = user.isAuthenticated() // Will be true if authentication succeeded
```

### Log in a user to a session
```ts
const session = await session.create() // Create a new session (you could also open an existing one)
const user = await User.get("my-user") // Get the user
user.login(session, "my secret password") // Log in the user - This will throw if the password is wrong
const userIsAutheticated = user.isAuthenticated() // Will be true if login succeeded
```

### Get a user from a session
```ts
const session = await session.open(sessionToken) // Open an existing session
const user = await User.fromSession(session) // Get the session user - this will throw if the session has no user logged in
```

### Log out a user from a session
```ts
const session = await session.open(sessionToken) // Open an existing session
const user = await User.fromSession(session) // Get the session user
await user.logout(session) // Log out the user from this session
```

### Deal with user data
```ts
const user = await User.get("my-user") // Get a user
await user.setItems({ firstName: "Jane", lastName: "Doe", age: 28 }) // set values for custom keys 'firstName', 'lastName', and 'age'
const { firstName, age } = await user.getItems(["firstName", "age"]) // Get values for keys 'firstName' and 'age'
await user.removeItems(["firstName", "lastName"]) // Remove items 'firstName' and 'lastName'
```

## Express middleware

For the middleware to do its job, the session token needs to be provided as Bearer token in the
Authorization header.

### Make a valid session required for a route
```ts
import express, { Request, Response } from "express"
import { requireSession, RequestWithIdentity } from "@lwtw/identity"

app = express()
app.use("/session-required/", requireSession()) // This will respond with an error if the request includes no valid session token

app.get("/session-required", (req: Request, res: Response) => {
  const { session } = req as RequestWithIdentity // Get the session from the request
})
```

### Make a login required for a route
```ts
import express, { Request, Response } from "express"
import { requireLogin, RequestWithIdentity } from "@lwtw/identity"

app = express()
app.use("/login-required/", requireLogin()) // This will respond with an error if the request includes no valid session token with a logged in user

app.get("/login-required", (req: Request, res: Response) => {
  const { session, user } = req as RequestWithIdentity // Get the session and user from the request
})
```

### Middleware options
You can pass an object of type ```RequireGuardOptions``` as the first argument to both ```requireSession()``` and
```requireLogin()``` to change their behavior:

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
may return stale information. Consider the following example:

```ts
const originalSession = await Session.create({ days: 1 })
const sessionCopy = await Session.open(originalSession.getToken())
await sessionCopy.updateLifetime({ days: 10 })

originalSession.getExpirationDate() // Will return a (stale) expiration date one day in the future
sessionCopy.getExpirationDate() // Will return an accurate expiration date 10 days in the future
```

For this reason, it is recommended to keep session and user objects alive for as short as possible. Short lifespans tend
to be the natural case for REST endpoints using the middleware provided, since the middleware checks access against a fresh instance of
a session and/or user, and adds the session and user to the ```Request``` object express passes to route handlers. Once the route handler
returns, the objects will go out of scope, and there is no risk of accessing stale date at some much later point.

WebSockets however may keep connections alive for long periods of time. In this case, it is recommended to create a new ```User```
or ```Session``` instance for each request coming in on the WebSocket, instead of keeping them around from when the connection was first
initiated. You can however cache the session token at the beginning of the connection, and reopen the session for each request, so the
client does not have to re-authenticate with every single request after the initial connection.