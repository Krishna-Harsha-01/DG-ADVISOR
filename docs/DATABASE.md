# Database Schema (MySQL)

Database: `dg_advisor` (auto-created on first run). Engine: InnoDB.

## generations
Every AI compliance check.
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AUTO_INCREMENT | |
| inputs | JSON | the form data submitted |
| prompt_version | VARCHAR | which prompt built it (e.g. v5) |
| ai_response | JSON | the parsed AI output |
| provider | VARCHAR | openrouter / gemini / openai / mock |
| response_time_ms | INT | AI round-trip time in milliseconds |
| created_at | DATETIME | default now |

## feedback
Star ratings on a generation.
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| generation_id | INT | → generations.id |
| rating | INT | 1–5 |
| comment | TEXT | optional |
| created_at | DATETIME | |

## templates
One-click Advisor presets.
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| name | VARCHAR | |
| description | TEXT | |
| inputs | JSON | pre-filled form values |
| created_at | DATETIME | |

## staff
The six shift-based staff members.
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| code | VARCHAR(6) UNIQUE | personal access code (e.g. DGMOR1) |
| name | VARCHAR | |
| shift | VARCHAR | morning / evening / night |
| created_at | DATETIME | |

## login_logs
Who logged in/out and when (admin Access Log).
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| staff_code | VARCHAR(6) | |
| staff_name | VARCHAR | |
| shift | VARCHAR | morning/evening/night/admin |
| role | VARCHAR | staff / admin |
| logged_in_at | DATETIME | |
| logged_out_at | DATETIME NULL | null = still active |

## Relationships
- `feedback.generation_id` → `generations.id` (one generation has many feedback rows)
- `login_logs.staff_code` → `staff.code` (logical link; logs are kept even if staff change)
