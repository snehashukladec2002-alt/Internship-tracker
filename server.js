const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

// ============================================================
// InternTrack Portal - Backend
// Node.js only: no Express or external backend dependency.
// ============================================================

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");

const USERS_FILE = path.join(DATA_DIR, "users.json");
const INTERNSHIPS_FILE = path.join(DATA_DIR, "internships.json");
const APPLICATIONS_FILE = path.join(DATA_DIR, "applications.json");

const PORT = Number(process.env.PORT || 3000);
const sessions = new Map();

// ============================================================
// JSON storage helpers
// ============================================================

function readJson(file, fallback = []) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function makeId() {
    return crypto.randomUUID();
}

// ============================================================
// HTTP helpers
// ============================================================

function sendJson(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    res.end(JSON.stringify(data));
}

function parseCookies(req) {
    const header = req.headers.cookie || "";

    return Object.fromEntries(
        header
            .split(";")
            .map(part => part.trim())
            .filter(Boolean)
            .map(part => {
                const index = part.indexOf("=");
                return [
                    part.slice(0, index),
                    decodeURIComponent(part.slice(index + 1))
                ];
            })
    );
}

function setSessionCookie(res, sessionId) {
    res.setHeader(
        "Set-Cookie",
        `sid=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
    );
}

function clearSessionCookie(res) {
    res.setHeader(
        "Set-Cookie",
        "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    );
}

function getCurrentUser(req) {
    const sessionId = parseCookies(req).sid;
    return sessionId ? sessions.get(sessionId) : null;
}

function safeUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company: user.company || ""
    };
}

function requireRole(user, ...roles) {
    return Boolean(user) && roles.includes(user.role);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = "";

        req.on("data", chunk => {
            raw += chunk;

            if (raw.length > 1_000_000) {
                reject(new Error("Request too large"));
                req.destroy();
            }
        });

        req.on("end", () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch {
                reject(new Error("Invalid JSON"));
            }
        });

        req.on("error", reject);
    });
}

// ============================================================
// Password security
// ============================================================

function hashPassword(
    password,
    salt = crypto.randomBytes(16).toString("hex")
) {
    return {
        salt,
        hash: crypto.scryptSync(password, salt, 64).toString("hex")
    };
}

function checkPassword(password, user) {
    try {
        const actual = Buffer.from(
            hashPassword(password, user.salt).hash,
            "hex"
        );

        const stored = Buffer.from(user.passwordHash, "hex");

        return crypto.timingSafeEqual(actual, stored);
    } catch {
        return false;
    }
}

// ============================================================
// Seed demo data
// ============================================================

function seedData() {
    const users = readJson(USERS_FILE);

    const adminEmail = (
        process.env.ADMIN_EMAIL || "admin@interntrack.local"
    ).toLowerCase();

    if (!users.some(user => user.email === adminEmail)) {
        const password = process.env.ADMIN_PASSWORD || "Admin@12345";
        const passwordData = hashPassword(password);

        users.push({
            id: makeId(),
            name: "InternTrack Admin",
            email: adminEmail,
            role: "admin",
            company: "",
            salt: passwordData.salt,
            passwordHash: passwordData.hash,
            createdAt: new Date().toISOString()
        });

        writeJson(USERS_FILE, users);

        console.log(
            `Default admin: ${adminEmail} / ${password}`
        );
    }

    if (readJson(INTERNSHIPS_FILE).length === 0) {
        const now = new Date().toISOString();

        writeJson(INTERNSHIPS_FILE, [
            {
                id: makeId(),
                title: "Frontend Developer Intern",
                companyName: "PixelCraft",
                location: "Remote",
                type: "Remote",
                stipend: "₹8,000/month",
                duration: "3 months",
                deadline: "2026-10-25",
                description:
                    "Build responsive interfaces using HTML, CSS and JavaScript.",
                eligibility: "HTML, CSS and JavaScript basics",
                skills: ["HTML", "CSS", "JavaScript"],
                status: "published",
                createdBy: "seed",
                createdAt: now
            },
            {
                id: makeId(),
                title: "Data Analyst Intern",
                companyName: "InsightWorks",
                location: "Bengaluru",
                type: "Hybrid",
                stipend: "₹12,000/month",
                duration: "6 months",
                deadline: "2026-11-05",
                description:
                    "Clean datasets, prepare reports and create useful dashboards.",
                eligibility: "Excel and SQL basics; Python is a plus",
                skills: ["SQL", "Excel", "Python"],
                status: "published",
                createdBy: "seed",
                createdAt: now
            },
            {
                id: makeId(),
                title: "Marketing Intern",
                companyName: "BrightSide",
                location: "Mumbai",
                type: "On-site",
                stipend: "₹6,000/month",
                duration: "2 months",
                deadline: "2026-10-18",
                description:
                    "Support social media content, research and campaign reporting.",
                eligibility: "Strong writing and communication",
                skills: ["Content", "Research", "Social Media"],
                status: "published",
                createdBy: "seed",
                createdAt: now
            },
            {
                id: makeId(),
                title: "Backend Developer Intern",
                companyName: "CloudNova",
                location: "Noida",
                type: "Hybrid",
                stipend: "₹15,000/month",
                duration: "4 months",
                deadline: "2026-11-15",
                description:
                    "Work on APIs, databases and backend services with the engineering team.",
                eligibility: "JavaScript, Node.js and database fundamentals",
                skills: ["Node.js", "REST API", "SQL"],
                status: "published",
                createdBy: "seed",
                createdAt: now
            }
        ]);
    }

    if (!fs.existsSync(APPLICATIONS_FILE)) {
        writeJson(APPLICATIONS_FILE, []);
    }
}

// ============================================================
// Authentication routes
// ============================================================

async function authRoutes(req, res, url) {
    const users = readJson(USERS_FILE);

    if (url.pathname === "/api/auth/me" && req.method === "GET") {
        const user = getCurrentUser(req);

        return sendJson(res, 200, {
            user: user ? safeUser(user) : null
        });
    }

    if (url.pathname === "/api/auth/signup" && req.method === "POST") {
        const body = await readBody(req);

        const name = String(body.name || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        const role = body.role;
        const company = String(body.company || "").trim();

        if (
            !name ||
            !/^\S+@\S+\.\S+$/.test(email) ||
            password.length < 8 ||
            !["student", "company"].includes(role)
        ) {
            return sendJson(res, 400, {
                error: "Enter valid account details. Password must contain at least 8 characters."
            });
        }

        if (users.some(user => user.email === email)) {
            return sendJson(res, 409, {
                error: "An account with this email already exists."
            });
        }

        const passwordData = hashPassword(password);

        const user = {
            id: makeId(),
            name,
            email,
            role,
            company: role === "company" ? company : "",
            salt: passwordData.salt,
            passwordHash: passwordData.hash,
            createdAt: new Date().toISOString()
        };

        users.push(user);
        writeJson(USERS_FILE, users);

        const sessionId = makeId();
        sessions.set(sessionId, user);
        setSessionCookie(res, sessionId);

        return sendJson(res, 201, {
            user: safeUser(user)
        });
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
        const body = await readBody(req);

        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        const user = users.find(item => item.email === email);

        if (!user || !checkPassword(password, user)) {
            return sendJson(res, 401, {
                error: "Email or password is incorrect."
            });
        }

        const sessionId = makeId();
        sessions.set(sessionId, user);
        setSessionCookie(res, sessionId);

        return sendJson(res, 200, {
            user: safeUser(user)
        });
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
        const sessionId = parseCookies(req).sid;

        if (sessionId) {
            sessions.delete(sessionId);
        }

        clearSessionCookie(res);

        return sendJson(res, 200, { ok: true });
    }

    return null;
}

// ============================================================
// Internship routes
// ============================================================

async function internshipRoutes(req, res, url, user) {
    const internships = readJson(INTERNSHIPS_FILE);

    if (url.pathname === "/api/internships" && req.method === "GET") {
        const query = (
            url.searchParams.get("q") || ""
        ).toLowerCase();

        let result = internships.filter(
            internship => internship.status === "published"
        );

        if (query) {
            result = result.filter(internship => {
                const searchable = [
                    internship.title,
                    internship.companyName,
                    internship.location,
                    internship.description,
                    internship.skills.join(" ")
                ]
                    .join(" ")
                    .toLowerCase();

                return searchable.includes(query);
            });
        }

        result.sort(
            (a, b) => b.createdAt.localeCompare(a.createdAt)
        );

        return sendJson(res, 200, { internships: result });
    }

    if (
        url.pathname === "/api/company/internships" &&
        req.method === "GET"
    ) {
        if (!requireRole(user, "company", "admin")) {
            return sendJson(res, 403, {
                error: "Company or admin access required."
            });
        }

        const result = internships.filter(
            internship =>
                user.role === "admin" ||
                internship.createdBy === user.id
        );

        return sendJson(res, 200, { internships: result });
    }

    if (url.pathname === "/api/internships" && req.method === "POST") {
        if (!requireRole(user, "company", "admin")) {
            return sendJson(res, 403, {
                error: "Company or admin access required."
            });
        }

        const body = await readBody(req);

        if (!String(body.title || "").trim()) {
            return sendJson(res, 400, {
                error: "Internship title is required."
            });
        }

        const internship = {
            id: makeId(),
            title: String(body.title).trim(),
            companyName:
                user.role === "admin"
                    ? String(body.companyName || "InternTrack").trim()
                    : user.company || user.name,
            location: String(body.location || "Remote").trim(),
            type: String(body.type || "Remote"),
            stipend: String(body.stipend || "Not specified").trim(),
            duration: String(body.duration || "Not specified").trim(),
            deadline: String(body.deadline || "").trim(),
            description: String(body.description || "").trim(),
            eligibility: String(body.eligibility || "").trim(),
            skills: String(body.skills || "")
                .split(",")
                .map(skill => skill.trim())
                .filter(Boolean),
            status: user.role === "admin" ? "published" : "pending",
            createdBy: user.id,
            createdAt: new Date().toISOString()
        };

        internships.unshift(internship);
        writeJson(INTERNSHIPS_FILE, internships);

        return sendJson(res, 201, { internship });
    }

    const match = url.pathname.match(
        /^\/api\/internships\/([^/]+)$/
    );

    if (!match) {
        return null;
    }

    const internship = internships.find(
        item => item.id === match[1]
    );

    if (!internship) {
        return sendJson(res, 404, {
            error: "Internship not found."
        });
    }

    if (req.method === "DELETE") {
        if (!requireRole(user, "company", "admin")) {
            return sendJson(res, 403, {
                error: "Company or admin access required."
            });
        }

        if (
            user.role === "company" &&
            internship.createdBy !== user.id
        ) {
            return sendJson(res, 403, {
                error: "You can only delete your own internship."
            });
        }

        writeJson(
            INTERNSHIPS_FILE,
            internships.filter(item => item.id !== internship.id)
        );

        return sendJson(res, 200, { ok: true });
    }

    if (req.method === "PATCH") {
        if (!requireRole(user, "admin")) {
            return sendJson(res, 403, {
                error: "Admin access required."
            });
        }

        const body = await readBody(req);

        if (
            !["published", "pending", "rejected"].includes(body.status)
        ) {
            return sendJson(res, 400, {
                error: "Invalid internship status."
            });
        }

        internship.status = body.status;
        writeJson(INTERNSHIPS_FILE, internships);

        return sendJson(res, 200, { internship });
    }

    return null;
}

// ============================================================
// Application routes
// ============================================================

async function applicationRoutes(req, res, url, user) {
    if (url.pathname === "/api/applications" && req.method === "POST") {
        if (!requireRole(user, "student")) {
            return sendJson(res, 403, {
                error: "Only students can apply."
            });
        }

        const body = await readBody(req);
        const internships = readJson(INTERNSHIPS_FILE);

        const internship = internships.find(
            item =>
                item.id === body.internshipId &&
                item.status === "published"
        );

        if (!internship) {
            return sendJson(res, 404, {
                error: "Internship is not available."
            });
        }

        const applications = readJson(APPLICATIONS_FILE);

        if (
            applications.some(
                application =>
                    application.studentId === user.id &&
                    application.internshipId === internship.id
            )
        ) {
            return sendJson(res, 409, {
                error: "You have already applied to this internship."
            });
        }

        const application = {
            id: makeId(),
            internshipId: internship.id,
            internshipTitle: internship.title,
            companyName: internship.companyName,
            studentId: user.id,
            studentName: user.name,
            studentEmail: user.email,
            phone: String(body.phone || "").trim(),
            resumeUrl: String(body.resumeUrl || "").trim(),
            coverLetter: String(body.coverLetter || "").trim(),
            status: "submitted",
            createdAt: new Date().toISOString()
        };

        applications.unshift(application);
        writeJson(APPLICATIONS_FILE, applications);

        return sendJson(res, 201, { application });
    }

    if (url.pathname === "/api/applications" && req.method === "GET") {
        if (!user) {
            return sendJson(res, 401, {
                error: "Please log in."
            });
        }

        let applications = readJson(APPLICATIONS_FILE);

        if (user.role === "student") {
            applications = applications.filter(
                application => application.studentId === user.id
            );
        }

        if (user.role === "company") {
            const jobs = readJson(INTERNSHIPS_FILE);

            const ownIds = new Set(
                jobs
                    .filter(job => job.createdBy === user.id)
                    .map(job => job.id)
            );

            applications = applications.filter(
                application => ownIds.has(application.internshipId)
            );
        }

        return sendJson(res, 200, { applications });
    }

    const match = url.pathname.match(
        /^\/api\/applications\/([^/]+)$/
    );

    if (!match || req.method !== "PATCH") {
        return null;
    }

    if (!requireRole(user, "company", "admin")) {
        return sendJson(res, 403, {
            error: "Company or admin access required."
        });
    }

    const applications = readJson(APPLICATIONS_FILE);
    const application = applications.find(
        item => item.id === match[1]
    );

    if (!application) {
        return sendJson(res, 404, {
            error: "Application not found."
        });
    }

    if (user.role === "company") {
        const ownsInternship = readJson(INTERNSHIPS_FILE).some(
            internship =>
                internship.id === application.internshipId &&
                internship.createdBy === user.id
        );

        if (!ownsInternship) {
            return sendJson(res, 403, {
                error: "You cannot update this application."
            });
        }
    }

    const body = await readBody(req);

    const statuses = [
        "submitted",
        "reviewing",
        "shortlisted",
        "rejected",
        "accepted"
    ];

    if (!statuses.includes(body.status)) {
        return sendJson(res, 400, {
            error: "Invalid application status."
        });
    }

    application.status = body.status;
    application.updatedAt = new Date().toISOString();

    writeJson(APPLICATIONS_FILE, applications);

    return sendJson(res, 200, { application });
}

// ============================================================
// Admin overview
// ============================================================

function adminRoutes(req, res, url, user) {
    if (
        url.pathname !== "/api/admin/overview" ||
        req.method !== "GET"
    ) {
        return null;
    }

    if (!requireRole(user, "admin")) {
        return sendJson(res, 403, {
            error: "Admin access required."
        });
    }

    return sendJson(res, 200, {
        users: readJson(USERS_FILE).map(safeUser),
        internships: readJson(INTERNSHIPS_FILE),
        applications: readJson(APPLICATIONS_FILE)
    });
}

// ============================================================
// API router
// ============================================================

async function handleApi(req, res, url) {
    if (url.pathname === "/api/health") {
        return sendJson(res, 200, {
            ok: true,
            app: "InternTrack"
        });
    }

    const authResult = await authRoutes(req, res, url);

    if (authResult !== null) {
        return authResult;
    }

    const user = getCurrentUser(req);

    const internshipResult =
        await internshipRoutes(req, res, url, user);

    if (internshipResult !== null) {
        return internshipResult;
    }

    const applicationResult =
        await applicationRoutes(req, res, url, user);

    if (applicationResult !== null) {
        return applicationResult;
    }

    const adminResult = adminRoutes(req, res, url, user);

    if (adminResult !== null) {
        return adminResult;
    }

    return sendJson(res, 404, {
        error: "API route not found."
    });
}

// ============================================================
// Static frontend
// ============================================================

function serveStatic(res, url) {
    const requested =
        url.pathname === "/"
            ? "index.html"
            : decodeURIComponent(url.pathname);

    const filePath = path.resolve(
        path.join(PUBLIC_DIR, requested)
    );

    if (
        filePath !== PUBLIC_DIR &&
        !filePath.startsWith(PUBLIC_DIR + path.sep)
    ) {
        return sendJson(res, 403, {
            error: "Forbidden"
        });
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            res.writeHead(404, {
                "Content-Type": "text/plain"
            });
            return res.end("Page not found");
        }

        const types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".jpg": "image/jpeg"
        };

        res.writeHead(200, {
            "Content-Type":
                types[path.extname(filePath)] ||
                "application/octet-stream"
        });

        res.end(data);
    });
}

// ============================================================
// Start
// ============================================================

seedData();

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(
            req.url,
            `http://${req.headers.host || "localhost"}`
        );

        if (url.pathname.startsWith("/api/")) {
            return await handleApi(req, res, url);
        }

        return serveStatic(res, url);
    } catch (error) {
        console.error(error);

        sendJson(res, 500, {
            error: error.message || "Internal server error"
        });
    }
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(
        `InternTrack is running at http://localhost:${PORT}`
    );
});
