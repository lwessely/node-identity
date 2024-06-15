# README
> A simple library for managing users and sessions

## Introduction
This package helps you to quickly implement user accounts and sessions in your APIs/WebApps.

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
const session = await Session.create() // Create new session
const sessionToken = session.getToken() // Get session token
```

### Open an existing session
```ts
const session = await Session.open(sessionToken) // Open an existing session
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
app.use("/session-required/", requireSession()) // This will repsond with an error if the request includes no valid session token

app.get("/session-required", (req: Request, res: Response) => {
  const { session } = req as RequestWithIdentity // Get the session from the request
})
```

### Make a login required for a route
```ts
import express, { Request, Response } from "express"
import { requireLogin, RequestWithIdentity } from "@lwtw/identity"

app = express()
app.use("/login-required/", requireLogin()) // This will repsond with an error if the request includes no valid session token with a logged in user

app.get("/login-required", (req: Request, res: Response) => {
  const { session, user } = req as RequestWithIdentity // Get the session and user from the request
})
```

## ToDo
- Sessions should have an expiration date
- Renewal tokens should be issued, so sessions can be renewed for a period of time after expiration