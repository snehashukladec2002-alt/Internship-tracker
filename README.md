# InternTrack Portal

A no-dependency Node.js internship portal with student, company, and admin roles.

## Run locally
1. Install Node.js 18 or newer.
2. Open this folder in VS Code.
3. In the terminal run `node server.js` (or `npm start`).
4. Open http://localhost:3000

## Demo admin
On first start, the server prints the admin email and password. Defaults are:
- Email: `admin@interntrack.local`
- Password: `Admin@12345`

Change these before deploying publicly by setting `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables. If an admin account already exists in `users.json`, changing env vars does not reset its password.

## Roles
- Student: browse listings, apply once per listing, track application status.
- Company: post internships (new posts require admin approval), view applicants for its own listings, update application status, remove own listings.
- Admin: view users/listings/applications, approve/reject/publish listings, update application status.

## Data and public hosting
Data is stored in `users.json`, `internships.json`, and `applications.json`. For hosting, use a Node-capable host such as Render. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `DATA_DIR` to a persistent mounted disk directory (for example `/var/data` if you attach a disk). Without persistent storage, many hosts may erase JSON data on redeploy/restart. For a production service with multiple instances, replace the JSON store with a managed database (PostgreSQL) and add rate limiting, email verification, password reset, CSRF protections, and resume file scanning/storage.

The app listens on `0.0.0.0` and uses the host-provided `PORT` environment variable.
