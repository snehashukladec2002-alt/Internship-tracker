# InternTrack — Full-stack Internship Application Tracker

A local full-stack project:
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express REST API
- Database: SQLite (`interntrack.db`, created automatically)

## Requirements
Install Node.js LTS from https://nodejs.org/ (npm is included).

## Run on Windows
1. Extract this ZIP to a folder.
2. Open that folder in VS Code, or open Command Prompt in that folder.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open http://localhost:3000

Keep the terminal window open while using the app. To stop the server, press Ctrl+C.

## API routes
- `GET /api/health` — health check
- `GET /api/applications` — list applications
- `GET /api/applications/:id` — get one application
- `POST /api/applications` — create application
- `PUT /api/applications/:id` — update application
- `DELETE /api/applications/:id` — delete application
- `PATCH /api/applications/:id/reminders/:key` — mark a reminder complete
- `GET /api/export` — export backup data as JSON

The SQLite database file is created in this project folder. Keep a copy of `interntrack.db` to back up your records.
