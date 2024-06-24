import { expect, test } from "@jest/globals"
import {
  User,
  UserAdmin,
  UserAuthenticationError,
  UserExistsError,
  UserInvalidError,
  UserProgramError,
} from "../src/user"
import {
  Session,
  SessionAdmin,
  SessionInvalidError,
  SessionProgramError,
  SessionExpiredError,
  SessionRenewalError,
} from "../src/session"
import {
  Group,
  GroupAdmin,
  GroupExistsError,
  GroupHasMemberError,
  GroupInvalidError,
  GroupProgramError,
  GroupNotAMemberError,
} from "../src/group"
import {
  Identity,
  IdentityNestedAtomicOperationError,
} from "../src/identity"
import * as identity from "../src/index"
import * as routes from "../src/routes"

test("Exports members correctly", () => {
  expect(identity.User).toBe(User)
  expect(identity.UserAdmin).toBe(UserAdmin)
  expect(identity.UserAuthenticationError).toBe(
    UserAuthenticationError
  )
  expect(identity.UserExistsError).toBe(UserExistsError)
  expect(identity.UserInvalidError).toBe(UserInvalidError)
  expect(identity.UserProgramError).toBe(UserProgramError)
  expect(identity.Session).toBe(Session)
  expect(identity.SessionAdmin).toBe(SessionAdmin)
  expect(identity.SessionInvalidError).toBe(SessionInvalidError)
  expect(identity.SessionProgramError).toBe(SessionProgramError)
  expect(identity.SessionExpiredError).toBe(SessionExpiredError)
  expect(identity.SessionRenewalError).toBe(SessionRenewalError)
  expect(identity.getSessionFromRequest).toBe(
    routes.getSessionFromRequest
  )
  expect(identity.requireSession).toBe(routes.requireSession)
  expect(identity.requireLogin).toBe(routes.requireLogin)
  expect(identity.requireAnyGroup).toBe(routes.requireAnyGroup)
  expect(identity.requireAllGroups).toBe(routes.requireAllGroups)
  expect(identity.requireCondition).toBe(routes.requireCondition)
  expect(identity.Group).toBe(Group)
  expect(identity.GroupAdmin).toBe(GroupAdmin)
  expect(identity.GroupExistsError).toBe(GroupExistsError)
  expect(identity.GroupHasMemberError).toBe(GroupHasMemberError)
  expect(identity.GroupInvalidError).toBe(GroupInvalidError)
  expect(identity.GroupProgramError).toBe(GroupProgramError)
  expect(identity.GroupNotAMemberError).toBe(GroupNotAMemberError)
  expect(identity.Identity).toBe(Identity)
  expect(identity.IdentityNestedAtomicOperationError).toBe(
    IdentityNestedAtomicOperationError
  )
})
