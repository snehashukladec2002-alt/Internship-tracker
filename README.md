# InternTrack Portal

A clean, modern full-stack internship portal built with plain Node.js,
HTML, CSS and JavaScript.

## Features

### Student
- Create account / login
- Browse published internships
- Search internships
- Apply to an internship
- Prevent duplicate applications
- Track application status
- Modern board and list views
- View application details

### Company
- Create company account / login
- Post internships
- New posts require admin approval
- View own internships
- View applicants
- Update applicant status
- Remove own internship posts

### Admin
- Admin login
- View users
- View all internships
- Publish / keep pending / reject internships
- View all applications
- Update application status
- Add internships directly

## Tech Stack

- Frontend: HTML5, CSS3, JavaScript
- Backend: Node.js HTTP server
- Storage: JSON files
- Authentication: session cookie + scrypt password hashing
- Dependencies: none

## Run in VS Code

Open this folder in VS Code and run:

```bash
npm start
```

Then open:

http://localhost:3000

If PowerShell blocks npm scripts, use:

```bash
node server.js
```

## Default admin

Email:
`admin@interntrack.local`

Password:
`Admin@12345`

For a real deployment, change the admin password through environment variables.

## Project structure

InternTrack_Modern_Project/
│
├── data/
│   ├── users.json
│   ├── internships.json
│   └── applications.json
│
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── package.json
├── README.md
└── server.js

## Viva-friendly architecture

Browser
   ↓
HTML / CSS / JavaScript
   ↓
Node.js HTTP API
   ↓
Authentication + authorization + business logic
   ↓
JSON data files
