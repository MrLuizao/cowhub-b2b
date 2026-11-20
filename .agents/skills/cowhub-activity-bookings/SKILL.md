---
name: cowhub-activity-bookings
description: >-
  Use this skill when working on activity management, activity bookings/reservations,
  roster views, or the /espacios pages. Covers class CRUD, per-occurrence booking,
  branch-specific capacity, host assignment, and close-day reset.
---

# Class Bookings System

## Class Model

- Collection: `activities` in Firestore
- Key fields: `name`, `host_id`, `schedule` (weekday + time), `max_capacity`,
  `branch_times` (per-branch schedule overrides), `booked_by_date`

## Booking Flow (Per-Occurrence)

`POST /api/activities/{id}/book` `{date?, branchId?}`:

1. Validates:
   - Membership ACTIVE + not expired
   - Date in `[today, today+8]` (CDMX timezone)
   - If today: class hasn't ended yet (checks `end_minutes` + `branch_times`)
   - Branch scope: `all_branches` or member's branch matches
2. **Transaction** on `activities.booked_by_date[date][branchId]`:
   - Checks `< max_capacity` for that branch+date
   - Increments count
3. Creates `bookings/{id}`:
   - `class_id`, `class_date` (YYYY-MM-DD CDMX), `auth_uid`, `branch_id`, `status: 'confirmed'`
4. Idempotent: same class+member+date = no duplicate

### Cancellation

`DELETE /api/activities/{id}/book?date=`:
- Sets booking `status: 'cancelled'`
- Decrements `booked_by_date[date][branchId]`

## Capacity Tracking

- `activities.booked` = legacy mirror of "total booked today" (compat)
- `activities.booked_by_date` = `{date: {branchId: count}}` — **real source**
  - Per-branch capacity: each branch has its own count
  - Legacy flat values migrate to booking's branch (or `'_'` on read)
- Close-day resets `booked` and prunes keys `<= today`; future dates preserved

## Roster

`GET /api/activities/{id}/roster` — confirmed bookings for today:
- Staff with branch sees only their branch's bookings
- Returns member info + booking status

## UI Pages

- `/espacios` — class list with schedule grid
- `/espacios/[id]` — class detail + roster
- `/espacios/nuevo` — create class (admin/manager)

## Permissions

- View: all roles
- Edit schedule/room (branch-specific fields): manager (own branch) + admin
- Edit global fields (name, host, max_capacity): admin only
- Create: admin + manager (auto-assigned to own branch)
