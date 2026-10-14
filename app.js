// ============================================================
// InternTrack Portal - Frontend
// ============================================================

let currentUser = null;
let internships = [];
let applications = [];
let activePage = "dashboard";
let boardMode = true;

const $ = selector => document.querySelector(selector);

const STATUS_GROUPS = [
    { key: "saved", label: "Saved" },
    { key: "applied", label: "Applied" },
    { key: "interviewing", label: "Interviewing" },
    { key: "offer", label: "Offer" },
    { key: "closed", label: "Closed" }
];

const APPLICATION_STATUS = [
    "submitted",
    "reviewing",
    "shortlisted",
    "rejected",
    "accepted"
];

// ============================================================
// API helper
// ============================================================

async function api(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
    }

    return data;
}

// ============================================================
// Utility
// ============================================================

function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric"
          });
}

function showToast(message) {
    const toast = $("#toast");

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2600);
}

function statusClass(status) {
    return `status-${String(status || "")
        .toLowerCase()
        .replace(/\s+/g, "-")}`;
}

// ============================================================
// Authentication
// ============================================================

async function loadSession() {
    const data = await api("/api/auth/me");

    currentUser = data.user;

    if (currentUser) {
        showApp();
    } else {
        showAuth();
    }
}

function showAuth() {
    $("#authScreen").classList.remove("hidden");
    $("#appScreen").classList.add("hidden");
}

function showApp() {
    $("#authScreen").classList.add("hidden");
    $("#appScreen").classList.remove("hidden");

    $("#userEmail").textContent = currentUser.email;

    setupRoleUI();
    renderPage();
}

function setupRoleUI() {
    const nav = $("#studentNav");
    const topAction = $("#topActionBtn");

    if (currentUser.role === "student") {
        nav.classList.remove("hidden");

        topAction.textContent = "+ Add application";
        topAction.onclick = () => openManualApplicationModal();
    } else {
        nav.classList.add("hidden");

        topAction.textContent =
            currentUser.role === "admin"
                ? "+ Add internship"
                : "+ Post internship";

        topAction.onclick = () => openInternshipModal();
    }
}

document.querySelectorAll("[data-auth]").forEach(button => {
    button.addEventListener("click", () => {
        const login = button.dataset.auth === "login";

        document.querySelectorAll(".auth-tab").forEach(tab => {
            tab.classList.remove("active");
        });

        button.classList.add("active");

        $("#loginForm").classList.toggle("hidden", !login);
        $("#signupForm").classList.toggle("hidden", login);
    });
});

$("#signupRole").addEventListener("change", () => {
    $("#companyField").classList.toggle(
        "hidden",
        $("#signupRole").value !== "company"
    );
});

$("#loginForm").addEventListener("submit", async event => {
    event.preventDefault();

    try {
        const data = await api("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({
                email: $("#loginEmail").value,
                password: $("#loginPassword").value
            })
        });

        currentUser = data.user;
        showApp();
        showToast("Welcome back!");
    } catch (error) {
        showToast(error.message);
    }
});

$("#signupForm").addEventListener("submit", async event => {
    event.preventDefault();

    try {
        const data = await api("/api/auth/signup", {
            method: "POST",
            body: JSON.stringify({
                name: $("#signupName").value,
                email: $("#signupEmail").value,
                password: $("#signupPassword").value,
                role: $("#signupRole").value,
                company: $("#signupCompany").value
            })
        });

        currentUser = data.user;
        showApp();
        showToast("Account created!");
    } catch (error) {
        showToast(error.message);
    }
});

$("#logoutBtn").addEventListener("click", async () => {
    await api("/api/auth/logout", {
        method: "POST"
    });

    currentUser = null;
    showAuth();
    showToast("Logged out.");
});

// ============================================================
// Page navigation
// ============================================================

document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
        activePage = button.dataset.page;
        renderPage();
    });
});

async function renderPage() {
    if (currentUser.role === "student") {
        await renderStudentPage();
    } else if (currentUser.role === "company") {
        await renderCompanyPage();
    } else {
        await renderAdminPage();
    }
}

// ============================================================
// Student
// ============================================================

async function loadStudentData() {
    const [internshipData, applicationData] = await Promise.all([
        api("/api/internships"),
        api("/api/applications")
    ]);

    internships = internshipData.internships;
    applications = applicationData.applications;
}

async function renderStudentPage() {
    await loadStudentData();

    if (activePage === "internships") {
        renderStudentInternships();
        return;
    }

    if (activePage === "applications") {
        renderStudentApplications();
        return;
    }

    renderStudentDashboard();
}

function studentStats() {
    const tracked = applications.length;

    const interviewing = applications.filter(
        app =>
            app.status === "reviewing" ||
            app.status === "shortlisted"
    ).length;

    const offers = applications.filter(
        app => app.status === "accepted"
    ).length;

    const responseRate = tracked
        ? Math.round(
              applications.filter(
                  app => app.status !== "submitted"
              ).length / tracked * 100
          )
        : 0;

    return { tracked, interviewing, offers, responseRate };
}

function renderStudentDashboard() {
    const stats = studentStats();

    $("#mainContent").innerHTML = `
        <div class="page-heading">
            <div>
                <h2>Your internship search</h2>
                <p>Track applications, interviews and offers in one place.</p>
            </div>

            <button class="soft-btn" id="toggleBoard">
                ${boardMode ? "List view" : "Board view"}
            </button>
        </div>

        <div class="stats">
            ${statCard(stats.tracked, "Tracked")}
            ${statCard(stats.interviewing, "Interviewing")}
            ${statCard(stats.offers, "Offers")}
            ${statCard(deadlinesThisWeek(), "Due this week")}
            ${statCard(stats.responseRate + "%", "Response rate")}
        </div>

        <div class="toolbar">
            <input
                id="applicationSearch"
                class="search"
                placeholder="Search company, role or location..."
            >
            <select id="statusFilter">
                <option value="">Any status</option>
                ${APPLICATION_STATUS.map(status =>
                    `<option value="${status}">${status}</option>`
                ).join("")}
            </select>
        </div>

        <div id="studentBoard"></div>
    `;

    $("#toggleBoard").onclick = () => {
        boardMode = !boardMode;
        renderStudentDashboard();
    };

    $("#applicationSearch").oninput = renderStudentBoard;
    $("#statusFilter").onchange = renderStudentBoard;

    renderStudentBoard();
}

function statCard(value, label) {
    return `
        <div class="stat">
            <strong>${value}</strong>
            <span>${label}</span>
        </div>
    `;
}

function deadlinesThisWeek() {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    return applications.filter(app => {
        const job = internships.find(
            internship => internship.id === app.internshipId
        );

        if (!job || !job.deadline) {
            return false;
        }

        const deadline = new Date(job.deadline);

        return deadline >= today && deadline <= nextWeek;
    }).length;
}

function applicationStage(application) {
    if (application.status === "accepted") return "offer";

    if (
        application.status === "reviewing" ||
        application.status === "shortlisted"
    ) {
        return "interviewing";
    }

    if (application.status === "rejected") return "closed";

    return "applied";
}

function renderStudentBoard() {
    const search = (
        $("#applicationSearch")?.value || ""
    ).toLowerCase();

    const filter = $("#statusFilter")?.value || "";

    let filtered = applications.filter(application => {
        const text = [
            application.companyName,
            application.internshipTitle,
            application.studentEmail
        ].join(" ").toLowerCase();

        return (
            text.includes(search) &&
            (!filter || application.status === filter)
        );
    });

    if (!boardMode) {
        $("#studentBoard").innerHTML = renderApplicationTable(
            filtered
        );
        return;
    }

    $("#studentBoard").innerHTML = `
        <div class="board">
            ${STATUS_GROUPS.map(group => {
                const items = filtered.filter(
                    app => applicationStage(app) === group.key
                );

                return `
                    <section class="column">
                        <div class="column-head">
                            <span class="column-title">
                                ${group.label}
                            </span>
                            <span class="column-count">
                                ${items.length}
                            </span>
                        </div>

                        ${
                            items.length
                                ? items.map(renderApplicationCard).join("")
                                : `<div class="empty">No applications yet</div>`
                        }
                    </section>
                `;
            }).join("")}
        </div>
    `;
}

function renderApplicationCard(application) {
    const job = internships.find(
        internship => internship.id === application.internshipId
    );

    return `
        <article class="application-card">
            <h4>${escapeHtml(application.companyName)}</h4>
            <p>${escapeHtml(application.internshipTitle)}</p>

            <div class="card-meta">
                <span class="chip">
                    ${escapeHtml(job?.type || "Internship")}
                </span>

                <span class="chip">
                    ${escapeHtml(job?.stipend || "—")}
                </span>
            </div>

            ${
                job?.deadline
                    ? `<div class="deadline">
                        Deadline · ${formatDate(job.deadline)}
                       </div>`
                    : ""
            }

            <div class="card-actions">
                <button onclick="viewApplication('${application.id}')">
                    View
                </button>
            </div>
        </article>
    `;
}

function renderApplicationTable(items) {
    if (!items.length) {
        return `
            <div class="section-card">
                <div class="empty">No applications found.</div>
            </div>
        `;
    }

    return `
        <div class="section-card table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Company</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Applied</th>
                        <th></th>
                    </tr>
                </thead>

                <tbody>
                    ${items.map(app => `
                        <tr>
                            <td>${escapeHtml(app.companyName)}</td>
                            <td>${escapeHtml(app.internshipTitle)}</td>
                            <td>
                                <span class="status-pill ${statusClass(app.status)}">
                                    ${escapeHtml(app.status)}
                                </span>
                            </td>
                            <td>${formatDate(app.createdAt)}</td>
                            <td>
                                <button class="soft-btn"
                                    onclick="viewApplication('${app.id}')">
                                    View
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderStudentInternships() {
    $("#mainContent").innerHTML = `
        <div class="page-heading">
            <div>
                <h2>Find internships</h2>
                <p>Search current opportunities and apply in a few clicks.</p>
            </div>
        </div>

        <div class="toolbar">
            <input
                id="internshipSearch"
                class="search"
                placeholder="Search company, role, location or skill..."
            >
            <button class="primary-btn" id="searchInternships">
                Search
            </button>
        </div>

        <div id="internshipGrid" class="internship-grid"></div>
    `;

    $("#searchInternships").onclick = loadInternshipsForStudent;
    $("#internshipSearch").onkeydown = event => {
        if (event.key === "Enter") {
            loadInternshipsForStudent();
        }
    };

    renderInternshipCards(internships);
}

async function loadInternshipsForStudent() {
    const query = encodeURIComponent(
        $("#internshipSearch").value.trim()
    );

    const data = await api(`/api/internships?q=${query}`);
    internships = data.internships;

    renderInternshipCards(internships);
}

function renderInternshipCards(items) {
    const applied = new Set(
        applications.map(app => app.internshipId)
    );

    $("#internshipGrid").innerHTML = items.length
        ? items.map(job => `
            <article class="internship-card">
                <h3>${escapeHtml(job.title)}</h3>
                <p class="company-line">
                    ${escapeHtml(job.companyName)} ·
                    ${escapeHtml(job.location)}
                </p>

                <div class="detail-grid">
                    <span>◉ ${escapeHtml(job.type)}</span>
                    <span>₹ ${escapeHtml(
                        job.stipend.replace(/^₹\s?/, "")
                    )}</span>
                    <span>◷ ${escapeHtml(job.duration)}</span>
                    <span>⌁ ${escapeHtml(job.eligibility)}</span>
                </div>

                <p>${escapeHtml(job.description)}</p>

                <div class="skill-row">
                    ${(job.skills || []).map(skill =>
                        `<span class="skill">${escapeHtml(skill)}</span>`
                    ).join("")}
                </div>

                <button
                    class="primary-btn full"
                    ${
                        applied.has(job.id)
                            ? "disabled style='opacity:.55;cursor:not-allowed'"
                            : `onclick="openApplyModal('${job.id}')"`
                    }>
                    ${
                        applied.has(job.id)
                            ? "Already applied"
                            : "Apply now"
                    }
                </button>
            </article>
        `).join("")
        : `<div class="section-card">
                <div class="empty">No internships match your search.</div>
           </div>`;
}

function renderStudentApplications() {
    $("#mainContent").innerHTML = `
        <div class="page-heading">
            <div>
                <h2>Application tracker</h2>
                <p>Every application, status and deadline in one place.</p>
            </div>

            <button class="primary-btn"
                onclick="openManualApplicationModal()">
                + Add application
            </button>
        </div>

        ${renderApplicationTable(applications)}
    `;
}

// ============================================================
// Company
// ============================================================

async function renderCompanyPage() {
    const [jobData, applicationData] = await Promise.all([
        api("/api/company/internships"),
        api("/api/applications")
    ]);

    internships = jobData.internships;
    applications = applicationData.applications;

    $("#mainContent").innerHTML = `
        <div class="page-heading">
            <div>
                <h2>Company dashboard</h2>
                <p>Manage internships and review your applicants.</p>
            </div>

            <button class="primary-btn"
                onclick="openInternshipModal()">
                + Post internship
            </button>
        </div>

        <div class="stats">
            ${statCard(internships.length, "My internships")}
            ${statCard(applications.length, "Applicants")}
            ${statCard(
                internships.filter(job => job.status === "pending").length,
                "Pending approval"
            )}
        </div>

        <section class="section-card">
            <h3>My internships</h3>
            <div class="internship-grid">
                ${
                    internships.length
                        ? internships.map(renderCompanyJob).join("")
                        : `<div class="empty">No internships posted yet.</div>`
                }
            </div>
        </section>

        <section class="section-card">
            <h3>Applicants</h3>
            ${renderCompanyApplications()}
        </section>
    `;
}

function renderCompanyJob(job) {
    return `
        <article class="internship-card">
            <h3>${escapeHtml(job.title)}</h3>
            <p class="company-line">
                ${escapeHtml(job.location)} · ${escapeHtml(job.type)}
            </p>

            <span class="status-pill ${statusClass(job.status)}">
                ${escapeHtml(job.status)}
            </span>

            <p>${escapeHtml(job.description)}</p>

            <div class="card-actions">
                <button class="danger-btn"
                    onclick="deleteInternship('${job.id}')">
                    Remove
                </button>
            </div>
        </article>
    `;
}

function renderCompanyApplications() {
    if (!applications.length) {
        return `<div class="empty">No applicants yet.</div>`;
    }

    return `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Internship</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Update</th>
                    </tr>
                </thead>

                <tbody>
                    ${applications.map(app => `
                        <tr>
                            <td>${escapeHtml(app.studentName)}</td>
                            <td>${escapeHtml(app.internshipTitle)}</td>
                            <td>${escapeHtml(app.studentEmail)}</td>
                            <td>
                                <span class="status-pill ${statusClass(app.status)}">
                                    ${escapeHtml(app.status)}
                                </span>
                            </td>
                            <td>
                                <select
                                    onchange="updateApplicationStatus(
                                        '${app.id}',
                                        this.value
                                    )">
                                    ${APPLICATION_STATUS.map(status => `
                                        <option
                                            value="${status}"
                                            ${status === app.status ? "selected" : ""}>
                                            ${status}
                                        </option>
                                    `).join("")}
                                </select>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

// ============================================================
// Admin
// ============================================================

async function renderAdminPage() {
    const data = await api("/api/admin/overview");

    internships = data.internships;
    applications = data.applications;

    $("#mainContent").innerHTML = `
        <div class="page-heading">
            <div>
                <h2>Admin dashboard</h2>
                <p>Manage users, internship approvals and applications.</p>
            </div>

            <button class="primary-btn"
                onclick="openInternshipModal()">
                + Add internship
            </button>
        </div>

        <div class="stats">
            ${statCard(data.users.length, "Users")}
            ${statCard(internships.length, "Internships")}
            ${statCard(
                internships.filter(job => job.status === "pending").length,
                "Pending posts"
            )}
            ${statCard(applications.length, "Applications")}
            ${statCard(
                applications.filter(app => app.status === "accepted").length,
                "Accepted"
            )}
        </div>

        <section class="section-card">
            <h3>Internship approvals</h3>

            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Role</th>
                            <th>Company</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${internships.map(job => `
                            <tr>
                                <td>${escapeHtml(job.title)}</td>
                                <td>${escapeHtml(job.companyName)}</td>
                                <td>
                                    <span class="status-pill ${statusClass(job.status)}">
                                        ${escapeHtml(job.status)}
                                    </span>
                                </td>
                                <td>
                                    <button class="soft-btn"
                                        onclick="changeInternshipStatus(
                                            '${job.id}', 'published')">
                                        Publish
                                    </button>

                                    <button class="soft-btn"
                                        onclick="changeInternshipStatus(
                                            '${job.id}', 'pending')">
                                        Pending
                                    </button>

                                    <button class="danger-btn"
                                        onclick="changeInternshipStatus(
                                            '${job.id}', 'rejected')">
                                        Reject
                                    </button>
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        </section>

        <section class="section-card">
            <h3>All applications</h3>
            ${renderAdminApplications()}
        </section>

        <section class="section-card">
            <h3>Users</h3>
            ${renderUsers(data.users)}
        </section>
    `;
}

function renderAdminApplications() {
    if (!applications.length) {
        return `<div class="empty">No applications yet.</div>`;
    }

    return `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Internship</th>
                        <th>Company</th>
                        <th>Status</th>
                        <th>Update</th>
                    </tr>
                </thead>

                <tbody>
                    ${applications.map(app => `
                        <tr>
                            <td>${escapeHtml(app.studentName)}</td>
                            <td>${escapeHtml(app.internshipTitle)}</td>
                            <td>${escapeHtml(app.companyName)}</td>
                            <td>
                                <span class="status-pill ${statusClass(app.status)}">
                                    ${escapeHtml(app.status)}
                                </span>
                            </td>
                            <td>
                                <select
                                    onchange="updateApplicationStatus(
                                        '${app.id}',
                                        this.value
                                    )">
                                    ${APPLICATION_STATUS.map(status => `
                                        <option
                                            value="${status}"
                                            ${status === app.status ? "selected" : ""}>
                                            ${status}
                                        </option>
                                    `).join("")}
                                </select>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderUsers(users) {
    return `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Company</th>
                    </tr>
                </thead>

                <tbody>
                    ${users.map(user => `
                        <tr>
                            <td>${escapeHtml(user.name)}</td>
                            <td>${escapeHtml(user.email)}</td>
                            <td>${escapeHtml(user.role)}</td>
                            <td>${escapeHtml(user.company || "—")}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

// ============================================================
// Modals
// ============================================================

function openApplyModal(internshipId) {
    const job = internships.find(
        internship => internship.id === internshipId
    );

    if (!job) return;

    openModal(`
        <h2>Apply to ${escapeHtml(job.title)}</h2>
        <p class="company-line">
            ${escapeHtml(job.companyName)} · ${escapeHtml(job.location)}
        </p>

        <form id="applyForm">
            <div class="form-grid">
                <label>
                    Phone
                    <input id="applyPhone" placeholder="Phone number">
                </label>

                <label>
                    Resume URL
                    <input id="applyResume"
                           placeholder="https://...">
                </label>

                <label class="full">
                    Cover letter
                    <textarea id="applyCover"
                        placeholder="Tell the company why you are a good fit..."></textarea>
                </label>
            </div>

            <div class="modal-actions">
                <button type="button" class="soft-btn"
                    onclick="closeModal()">Cancel</button>
                <button class="primary-btn" type="submit">
                    Submit application
                </button>
            </div>
        </form>
    `);

    $("#applyForm").onsubmit = async event => {
        event.preventDefault();

        try {
            await api("/api/applications", {
                method: "POST",
                body: JSON.stringify({
                    internshipId,
                    phone: $("#applyPhone").value,
                    resumeUrl: $("#applyResume").value,
                    coverLetter: $("#applyCover").value
                })
            });

            closeModal();
            showToast("Application submitted.");
            await renderPage();
        } catch (error) {
            showToast(error.message);
        }
    };
}

function openManualApplicationModal() {
    openModal(`
        <h2>Add application</h2>
        <p class="company-line">
            Quickly add an application you found outside the portal.
        </p>

        <form id="manualForm">
            <div class="form-grid">
                <label>
                    Company
                    <input id="manualCompany" required>
                </label>

                <label>
                    Role
                    <input id="manualRole" required>
                </label>

                <label>
                    Status
                    <select id="manualStatus">
                        <option value="submitted">Applied</option>
                        <option value="reviewing">Interviewing</option>
                        <option value="accepted">Offer</option>
                        <option value="rejected">Closed</option>
                    </select>
                </label>

                <label>
                    Location
                    <input id="manualLocation">
                </label>
            </div>

            <div class="modal-actions">
                <button type="button" class="soft-btn"
                    onclick="closeModal()">Cancel</button>
                <button class="primary-btn" type="submit">
                    Add application
                </button>
            </div>
        </form>
    `);

    // Manual applications are UI-only records for the personal tracker.
    $("#manualForm").onsubmit = event => {
        event.preventDefault();

        showToast(
            "For portal applications, use an internship card and Apply now."
        );

        closeModal();
    };
}

function openInternshipModal() {
    const isAdmin = currentUser.role === "admin";

    openModal(`
        <h2>${isAdmin ? "Add internship" : "Post internship"}</h2>
        <p class="company-line">
            ${isAdmin
                ? "Create a published internship."
                : "New company posts go to admin approval."}
        </p>

        <form id="internshipForm">
            <div class="form-grid">
                ${
                    isAdmin
                        ? `<label>
                            Company
                            <input id="jobCompany"
                                   placeholder="Company name">
                           </label>`
                        : ""
                }

                <label>
                    Internship title
                    <input id="jobTitle"
                           placeholder="e.g. Software Intern" required>
                </label>

                <label>
                    Location
                    <input id="jobLocation"
                           placeholder="Remote / Delhi / Noida">
                </label>

                <label>
                    Type
                    <select id="jobType">
                        <option>Remote</option>
                        <option>Hybrid</option>
                        <option>On-site</option>
                    </select>
                </label>

                <label>
                    Stipend
                    <input id="jobStipend"
                           placeholder="₹15,000/month">
                </label>

                <label>
                    Duration
                    <input id="jobDuration"
                           placeholder="3 months">
                </label>

                <label>
                    Deadline
                    <input id="jobDeadline" type="date">
                </label>

                <label class="full">
                    Eligibility
                    <input id="jobEligibility"
                           placeholder="Skills or requirements">
                </label>

                <label class="full">
                    Skills
                    <input id="jobSkills"
                           placeholder="JavaScript, Node.js, SQL">
                </label>

                <label class="full">
                    Description
                    <textarea id="jobDescription"
                              placeholder="Describe the internship..."
                              required></textarea>
                </label>
            </div>

            <div class="modal-actions">
                <button type="button" class="soft-btn"
                    onclick="closeModal()">Cancel</button>
                <button class="primary-btn" type="submit">
                    ${isAdmin ? "Create internship" : "Submit for approval"}
                </button>
            </div>
        </form>
    `);

    $("#internshipForm").onsubmit = async event => {
        event.preventDefault();

        try {
            await api("/api/internships", {
                method: "POST",
                body: JSON.stringify({
                    companyName: isAdmin
                        ? $("#jobCompany").value
                        : "",
                    title: $("#jobTitle").value,
                    location: $("#jobLocation").value,
                    type: $("#jobType").value,
                    stipend: $("#jobStipend").value,
                    duration: $("#jobDuration").value,
                    deadline: $("#jobDeadline").value,
                    eligibility: $("#jobEligibility").value,
                    skills: $("#jobSkills").value,
                    description: $("#jobDescription").value
                })
            });

            closeModal();

            showToast(
                isAdmin
                    ? "Internship created."
                    : "Internship sent for admin approval."
            );

            await renderPage();
        } catch (error) {
            showToast(error.message);
        }
    };
}

function viewApplication(id) {
    const application = applications.find(
        item => item.id === id
    );

    if (!application) return;

    const job = internships.find(
        internship => internship.id === application.internshipId
    );

    openModal(`
        <h2>${escapeHtml(application.internshipTitle)}</h2>
        <p class="company-line">
            ${escapeHtml(application.companyName)}
        </p>

        <div class="section-card">
            <p>
                <strong>Status:</strong>
                <span class="status-pill ${statusClass(application.status)}">
                    ${escapeHtml(application.status)}
                </span>
            </p>

            <p>
                <strong>Applied:</strong>
                ${formatDate(application.createdAt)}
            </p>

            ${
                job?.deadline
                    ? `<p>
                        <strong>Deadline:</strong>
                        ${formatDate(job.deadline)}
                       </p>`
                    : ""
            }

            ${
                application.resumeUrl
                    ? `<p>
                        <strong>Resume:</strong>
                        <a href="${escapeHtml(application.resumeUrl)}"
                           target="_blank" rel="noopener">
                           Open resume
                        </a>
                       </p>`
                    : ""
            }

            ${
                application.coverLetter
                    ? `<p>
                        <strong>Cover letter:</strong><br>
                        ${escapeHtml(application.coverLetter)}
                       </p>`
                    : ""
            }
        </div>

        <div class="modal-actions">
            <button class="soft-btn" onclick="closeModal()">
                Close
            </button>
        </div>
    `);
}

// ============================================================
// Actions
// ============================================================

async function deleteInternship(id) {
    if (!confirm("Remove this internship?")) return;

    try {
        await api(`/api/internships/${id}`, {
            method: "DELETE"
        });

        showToast("Internship removed.");
        await renderPage();
    } catch (error) {
        showToast(error.message);
    }
}

async function changeInternshipStatus(id, status) {
    try {
        await api(`/api/internships/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ status })
        });

        showToast(`Internship marked ${status}.`);
        await renderPage();
    } catch (error) {
        showToast(error.message);
    }
}

async function updateApplicationStatus(id, status) {
    try {
        await api(`/api/applications/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ status })
        });

        showToast("Application status updated.");
        await renderPage();
    } catch (error) {
        showToast(error.message);
    }
}

// ============================================================
// Modal helpers
// ============================================================

function openModal(html) {
    $("#modal").innerHTML = html;
    $("#modalBackdrop").classList.remove("hidden");
}

function closeModal() {
    $("#modalBackdrop").classList.add("hidden");
    $("#modal").innerHTML = "";
}

$("#modalBackdrop").addEventListener("click", event => {
    if (event.target === $("#modalBackdrop")) {
        closeModal();
    }
});

// ============================================================
// Start
// ============================================================

loadSession().catch(error => {
    console.error(error);
    showToast("Could not connect to the server.");
});
