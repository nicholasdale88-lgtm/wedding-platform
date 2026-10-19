# Design deviations (need the owner's sign-off, DESIGN_LOCK.md)

Every intentional difference from `design/` is listed here. Nothing else may differ.

| # | Screen | What differs | Why | Status |
|---|---|---|---|---|
| 1 | Admin sign-in (passcode screen) | An **Email** field is added above **Passcode**, in the identical pill style. The heading shows the couple's names once this device has signed in before; on a first visit it reads "Welcome back". | Real accounts for a product sold to many couples: the server needs to know who is signing in, and before sign-in it doesn't know which wedding to name. The prototype's single shared passcode can't work for multiple couples. | Awaiting sign-off |
