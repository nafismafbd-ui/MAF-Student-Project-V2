(function () {
  "use strict";

  function leaveDateToUtc(dateString) {
    if (!dateString) return null;
    const parts = String(dateString).split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  }

  function addLeaveDays(dateString, days) {
    const date = leaveDateToUtc(dateString);
    if (!date) return "";
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  function leaveDayDifference(fromDate, toDate) {
    const from = leaveDateToUtc(fromDate);
    const to = leaveDateToUtc(toDate);
    if (!from || !to) return null;
    return Math.round((to.getTime() - from.getTime()) / 86400000);
  }

  function safeLeaveId(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function leaveRangeText(fromDate, toDate) {
    if (!fromDate || !toDate) return "—";
    return `${fromDate} → ${toDate}`;
  }

  function getExpectedJoinDate(fromDate, toDate, secondFromDate, secondToDate) {
    if (!fromDate || !toDate) return "";
    if (secondFromDate && secondToDate) return addLeaveDays(secondToDate, 1);
    return addLeaveDays(toDate, 1);
  }

  function getJoinStatus(expectedJoinDate, actualJoinDate) {
    if (!actualJoinDate) return "Not Recorded";
    if (!expectedJoinDate) return "Actual Join Recorded";

    const difference = leaveDayDifference(expectedJoinDate, actualJoinDate);
    if (difference === null) return "Actual Join Recorded";
    if (difference === 0) return "Joined on Time";
    if (difference > 0) return `Joined Late - ${difference} Day${difference === 1 ? "" : "s"}`;

    const early = Math.abs(difference);
    return `Joined Early - ${early} Day${early === 1 ? "" : "s"}`;
  }

  function joinStatusClass(status) {
    const text = String(status || "").toLowerCase();
    if (text.includes("late")) return "manager-rejected";
    if (text.includes("on time")) return "manager-recommended";
    if (text.includes("early")) return "partner-approved";
    return "submitted";
  }

  function setTableHeader(tbodyId, cells) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const table = tbody.closest("table");
    const thead = table ? table.querySelector("thead") : null;
    if (thead) thead.innerHTML = `<tr>${cells.map(cell => `<th>${cell}</th>`).join("")}</tr>`;
  }

  window.updateLeaveDayPreview = function () {
    const from1 = document.getElementById("leaveFromDate")?.value || "";
    const to1 = document.getElementById("leaveToDate")?.value || "";
    const from2 = document.getElementById("leaveSecondFromDate")?.value || "";
    const to2 = document.getElementById("leaveSecondToDate")?.value || "";

    const days1 = calculateLeaveDays(from1, to1);
    const days2 = calculateLeaveDays(from2, to2);

    const range1Preview = document.getElementById("leaveRange1Days");
    const range2Preview = document.getElementById("leaveRange2Days");
    const totalPreview = document.getElementById("leaveDayPreview");
    const expectedPreview = document.getElementById("leaveExpectedJoinDate");
    const validation = document.getElementById("leaveRangeValidation");

    if (range1Preview) range1Preview.value = String(days1 || 0);
    if (range2Preview) range2Preview.value = String(days2 || 0);

    let error = "";
    if ((from2 && !to2) || (!from2 && to2)) {
      error = "Leave Range 2 requires both From Date and To Date.";
    } else if (from2 && to2 && days2 < 1) {
      error = "Leave Range 2 is invalid.";
    } else if (from2 && to2 && to1 && from2 <= to1) {
      error = "Leave Range 2 must start after Leave Range 1 ends.";
    }

    if (validation) {
      validation.textContent = error;
      validation.style.display = error ? "block" : "none";
    }

    if (totalPreview) {
      totalPreview.value = error ? "0" : String((days1 || 0) + (days2 || 0));
    }

    if (expectedPreview) {
      expectedPreview.value = error
        ? ""
        : getExpectedJoinDate(from1, to1, from2, to2);
    }
  };

  window.buildStudentLeaveApplicationBox = async function (studentId) {
    const result = await db
      .from("leave_applications")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });

    const rows = result.error ? [] : (result.data || []);
    const pending = rows.some(r => ["Submitted", "Manager Recommended"].includes(r.status));

    const tableRows = rows.length
      ? rows.map(r => {
          const expectedJoin = r.expected_join_date || getExpectedJoinDate(
            r.from_date,
            r.to_date,
            r.second_from_date,
            r.second_to_date
          );
          const joinStatus = getJoinStatus(expectedJoin, r.actual_join_date);
          return `
            <tr>
              <td>${escapeHtml(formatDate(r.created_at))}</td>
              <td>${escapeHtml(r.leave_type)}</td>
              <td>${escapeHtml(leaveRangeText(r.from_date, r.to_date))}</td>
              <td>${escapeHtml(leaveRangeText(r.second_from_date, r.second_to_date))}</td>
              <td>${escapeHtml(r.total_days)}</td>
              <td>${escapeHtml(expectedJoin || "")}</td>
              <td>${escapeHtml(r.actual_join_date || "")}</td>
              <td><span class="leave-status ${joinStatusClass(joinStatus)}">${escapeHtml(joinStatus)}</span></td>
              <td>${escapeHtml(r.reason)}</td>
              <td><span class="leave-status ${leaveStatusClass(r.status)}">${escapeHtml(r.status)}</span></td>
              <td>${escapeHtml(r.manager_note || "")}</td>
              <td>${escapeHtml(r.partner_note || "")}</td>
            </tr>`;
        }).join("")
      : "<tr><td colspan='12'>No leave application found.</td></tr>";

    return `
      <div class="leave-form-card">
        <hr style="border:none; border-top:1px solid var(--border); margin:18px 0;">
        <h3>Apply for Leave</h3>
        <p class="leave-flow-note">Your application will first go to the Manager. After Manager recommendation, it will go to the Partner for final approval. Leave Range 2 is optional.</p>

        <div class="form-grid">
          <div>
            <label>Leave Type</label>
            <select id="leaveType">
              <option value="">Select Leave Type</option>
              <option>Casual Leave</option>
              <option>Sick Leave</option>
              <option>Emergency Leave</option>
              <option>Study Leave</option>
              <option>Other</option>
            </select>
          </div>
          <div><label>Contact During Leave</label><input id="leaveContact" placeholder="Phone / contact (optional)"></div>

          <div><label>Leave Range 1 - From Date</label><input type="date" id="leaveFromDate" onchange="updateLeaveDayPreview()"></div>
          <div><label>Leave Range 1 - To Date</label><input type="date" id="leaveToDate" onchange="updateLeaveDayPreview()"></div>
          <div><label>Range 1 Days</label><input id="leaveRange1Days" value="0" readonly></div>

          <div><label>Leave Range 2 - From Date (Optional)</label><input type="date" id="leaveSecondFromDate" onchange="updateLeaveDayPreview()"></div>
          <div><label>Leave Range 2 - To Date (Optional)</label><input type="date" id="leaveSecondToDate" onchange="updateLeaveDayPreview()"></div>
          <div><label>Range 2 Days</label><input id="leaveRange2Days" value="0" readonly></div>

          <div><label>Total Leave Days</label><input id="leaveDayPreview" value="0" readonly></div>
          <div><label>Expected Join Date</label><input type="date" id="leaveExpectedJoinDate" readonly></div>
          <div><label>Reason</label><input id="leaveReason" placeholder="Reason for leave"></div>
        </div>

        <div id="leaveRangeValidation" class="notice" style="display:none; margin-top:10px;"></div>

        <div class="btn-row">
          <button onclick="submitLeaveApplication()" ${pending ? "disabled" : ""}>Submit Leave Application</button>
        </div>

        ${pending ? '<div class="notice">You already have a leave application under review. Submit a new one after the current application is decided.</div>' : ''}

        <h3>My Leave Applications</h3>
        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr>
                <th>Submitted</th><th>Type</th><th>Range 1</th><th>Range 2</th><th>Days</th>
                <th>Expected Join</th><th>Actual Join</th><th>Join Status</th><th>Reason</th>
                <th>Status</th><th>Manager Note</th><th>Partner Note</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>`;
  };

  window.submitLeaveApplication = async function () {
    if (!currentProfile || !["student", "manager"].includes(currentProfile.role) || !currentProfile.student_id) {
      showMessage("Only an active student can submit a leave application.", "error");
      return;
    }

    const leaveType = document.getElementById("leaveType")?.value || "";
    const fromDate = document.getElementById("leaveFromDate")?.value || "";
    const toDate = document.getElementById("leaveToDate")?.value || "";
    const secondFromDate = document.getElementById("leaveSecondFromDate")?.value || "";
    const secondToDate = document.getElementById("leaveSecondToDate")?.value || "";
    const reason = (document.getElementById("leaveReason")?.value || "").trim();
    const contact = (document.getElementById("leaveContact")?.value || "").trim();

    if (!leaveType || !fromDate || !toDate || !reason) {
      showMessage("Leave type, Leave Range 1 and reason are required.", "error");
      return;
    }

    if (calculateLeaveDays(fromDate, toDate) < 1) {
      showMessage("Please provide a valid Leave Range 1.", "error");
      return;
    }

    if ((secondFromDate && !secondToDate) || (!secondFromDate && secondToDate)) {
      showMessage("For Leave Range 2, enter both From Date and To Date.", "error");
      return;
    }

    if (secondFromDate && secondToDate) {
      if (calculateLeaveDays(secondFromDate, secondToDate) < 1) {
        showMessage("Please provide a valid Leave Range 2.", "error");
        return;
      }
      if (secondFromDate <= toDate) {
        showMessage("Leave Range 2 must start after Leave Range 1 ends.", "error");
        return;
      }
    }

    const result = await db.rpc("submit_leave_application_v2", {
      p_leave_type: leaveType,
      p_from_date: fromDate,
      p_to_date: toDate,
      p_second_from_date: secondFromDate || null,
      p_second_to_date: secondToDate || null,
      p_reason: reason,
      p_contact_during_leave: contact || null
    });

    if (result.error) {
      showMessage("Leave application failed: " + result.error.message, "error");
      return;
    }

    await loadStudentDashboard();
    if (isCurrentUserManager()) await loadManagerLeaveData();
    showMessage("Leave application submitted to Manager for recommendation.", "success");
  };

  window.managerRecordActualJoinDate = async function (leaveId) {
    if (!isCurrentUserManager() && !(currentProfile && currentProfile.role === "manager")) {
      showMessage("Only the Manager can record the actual join date.", "error");
      return;
    }

    const inputId = "actualJoinDate_" + safeLeaveId(leaveId);
    const input = document.getElementById(inputId);
    const actualJoinDate = input ? input.value : "";

    if (!actualJoinDate) {
      showMessage("Please select the Actual Join Date.", "error");
      return;
    }

    const result = await db.rpc("manager_record_actual_join_date", {
      p_leave_id: String(leaveId),
      p_actual_join_date: actualJoinDate
    });

    if (result.error) {
      showMessage("Actual join date update failed: " + result.error.message, "error");
      return;
    }

    await loadManagerLeaveData();
    if (typeof loadStudentDashboard === "function") await loadStudentDashboard();
    showMessage("Actual join date recorded successfully.", "success");
  };

  window.renderManagerLeaveTable = function () {
    const tbody = document.getElementById("managerLeaveTable");
    const recentTbody = document.getElementById("managerRecentLeaveTable");

    setTableHeader("managerLeaveTable", [
      "Date", "Student ID", "Applicant", "Branch", "Type", "Range 1", "Range 2", "Days",
      "Expected Join", "Actual Join", "Join Status", "Reason", "Status", "Action"
    ]);

    setTableHeader("managerRecentLeaveTable", [
      "Action Date", "Student ID", "Applicant", "Type", "Range 1", "Range 2", "Days",
      "Expected Join", "Actual Join", "Join Status", "Manager Action", "Manager Note", "Status"
    ]);

    if (tbody) {
      const pendingRows = leaveApplications.filter(r =>
        ["Submitted", "Manager Recommended"].includes(r.status)
        || (r.status === "Partner Approved" && !r.actual_join_date)
      );

      tbody.innerHTML = pendingRows.length
        ? pendingRows.map(r => {
            const expectedJoin = r.expected_join_date || getExpectedJoinDate(
              r.from_date,
              r.to_date,
              r.second_from_date,
              r.second_to_date
            );
            const joinStatus = getJoinStatus(expectedJoin, r.actual_join_date);
            const canReview = !currentProfile.student_id || r.student_id !== currentProfile.student_id;
            let action = "";

            if (r.status === "Submitted") {
              action = canReview
                ? `<button class="success" onclick="managerReviewLeave('${escapeAttribute(r.id)}','recommend')">Recommend</button> <button class="danger" onclick="managerReviewLeave('${escapeAttribute(r.id)}','reject')">Reject</button>`
                : "Own application";
            } else if (r.status === "Manager Recommended") {
              action = `<span class="leave-status manager-recommended">Sent to Partner</span>`;
            } else if (r.status === "Partner Approved" && !r.actual_join_date) {
              const inputId = "actualJoinDate_" + safeLeaveId(r.id);
              action = `
                <div style="display:flex; gap:6px; align-items:center; min-width:220px;">
                  <input type="date" id="${inputId}" style="min-width:135px;">
                  <button class="success" onclick="managerRecordActualJoinDate('${escapeAttribute(r.id)}')">Save Join Date</button>
                </div>`;
            }

            return `<tr>
              <td>${escapeHtml(formatDate(r.created_at))}</td>
              <td>${escapeHtml(r.student_id)}</td>
              <td>${escapeHtml(r.applicant_name)}</td>
              <td>${escapeHtml(r.branch)}</td>
              <td>${escapeHtml(r.leave_type)}</td>
              <td>${escapeHtml(leaveRangeText(r.from_date, r.to_date))}</td>
              <td>${escapeHtml(leaveRangeText(r.second_from_date, r.second_to_date))}</td>
              <td>${escapeHtml(r.total_days)}</td>
              <td>${escapeHtml(expectedJoin || "")}</td>
              <td>${escapeHtml(r.actual_join_date || "")}</td>
              <td><span class="leave-status ${joinStatusClass(joinStatus)}">${escapeHtml(joinStatus)}</span></td>
              <td>${escapeHtml(r.reason || "")}</td>
              <td><span class="leave-status ${leaveStatusClass(r.status)}">${escapeHtml(r.status)}</span></td>
              <td>${action}</td>
            </tr>`;
          }).join("")
        : "<tr><td colspan='14'>No leave application waiting for Manager action, Partner approval, or Actual Join Date.</td></tr>";
    }

    if (recentTbody) {
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const recentRows = leaveApplications
        .filter(r => r.manager_confirmed_at || r.actual_join_recorded_at)
        .filter(r => {
          const actionTime = Math.max(
            r.manager_confirmed_at ? new Date(r.manager_confirmed_at).getTime() : 0,
            r.actual_join_recorded_at ? new Date(r.actual_join_recorded_at).getTime() : 0
          );
          return actionTime >= sevenDaysAgo;
        })
        .sort((a, b) => {
          const aTime = Math.max(
            a.manager_confirmed_at ? new Date(a.manager_confirmed_at).getTime() : 0,
            a.actual_join_recorded_at ? new Date(a.actual_join_recorded_at).getTime() : 0
          );
          const bTime = Math.max(
            b.manager_confirmed_at ? new Date(b.manager_confirmed_at).getTime() : 0,
            b.actual_join_recorded_at ? new Date(b.actual_join_recorded_at).getTime() : 0
          );
          return bTime - aTime;
        });

      recentTbody.innerHTML = recentRows.length
        ? recentRows.map(r => {
            const expectedJoin = r.expected_join_date || getExpectedJoinDate(
              r.from_date,
              r.to_date,
              r.second_from_date,
              r.second_to_date
            );
            const joinStatus = getJoinStatus(expectedJoin, r.actual_join_date);
            const managerAction = r.status === "Manager Rejected" ? "Manager Rejected" : "Manager Recommended";
            const actionClass = managerAction === "Manager Rejected" ? "manager-rejected" : "manager-recommended";
            const actionDate = r.actual_join_recorded_at || r.manager_confirmed_at;

            return `<tr>
              <td>${escapeHtml(formatDate(actionDate))}</td>
              <td>${escapeHtml(r.student_id)}</td>
              <td>${escapeHtml(r.applicant_name)}</td>
              <td>${escapeHtml(r.leave_type)}</td>
              <td>${escapeHtml(leaveRangeText(r.from_date, r.to_date))}</td>
              <td>${escapeHtml(leaveRangeText(r.second_from_date, r.second_to_date))}</td>
              <td>${escapeHtml(r.total_days)}</td>
              <td>${escapeHtml(expectedJoin || "")}</td>
              <td>${escapeHtml(r.actual_join_date || "")}</td>
              <td><span class="leave-status ${joinStatusClass(joinStatus)}">${escapeHtml(joinStatus)}</span></td>
              <td><span class="leave-status ${actionClass}">${escapeHtml(managerAction)}</span></td>
              <td>${escapeHtml(r.manager_note || "")}</td>
              <td><span class="leave-status ${leaveStatusClass(r.status)}">${escapeHtml(r.status)}</span></td>
            </tr>`;
          }).join("")
        : "<tr><td colspan='13'>No Manager action in the last 7 days.</td></tr>";
    }
  };

  window.renderPartnerLeaveTable = function () {
    const tbody = document.getElementById("partnerLeaveTable");
    const recentTbody = document.getElementById("partnerRecentLeaveTable");

    setTableHeader("partnerLeaveTable", [
      "Date", "Student ID", "Applicant", "Branch", "Type", "Range 1", "Range 2", "Days",
      "Expected Join", "Manager Note", "Status", "Action"
    ]);

    setTableHeader("partnerRecentLeaveTable", [
      "Decision Date", "Student ID", "Applicant", "Type", "Range 1", "Range 2", "Days",
      "Expected Join", "Actual Join", "Join Status", "Status", "Partner Note"
    ]);

    if (tbody) {
      const pendingRows = leaveApplications.filter(r => r.status === "Manager Recommended");
      tbody.innerHTML = pendingRows.length
        ? pendingRows.map(r => {
            const expectedJoin = r.expected_join_date || getExpectedJoinDate(
              r.from_date,
              r.to_date,
              r.second_from_date,
              r.second_to_date
            );
            const action = `<button class="success" onclick="partnerReviewLeave('${escapeAttribute(r.id)}','approve')">Approve</button> <button class="danger" onclick="partnerReviewLeave('${escapeAttribute(r.id)}','reject')">Reject</button>`;

            return `<tr>
              <td>${escapeHtml(formatDate(r.created_at))}</td>
              <td>${escapeHtml(r.student_id)}</td>
              <td>${escapeHtml(r.applicant_name)}</td>
              <td>${escapeHtml(r.branch)}</td>
              <td>${escapeHtml(r.leave_type)}</td>
              <td>${escapeHtml(leaveRangeText(r.from_date, r.to_date))}</td>
              <td>${escapeHtml(leaveRangeText(r.second_from_date, r.second_to_date))}</td>
              <td>${escapeHtml(r.total_days)}</td>
              <td>${escapeHtml(expectedJoin || "")}</td>
              <td>${escapeHtml(r.manager_note || "")}</td>
              <td><span class="leave-status ${leaveStatusClass(r.status)}">${escapeHtml(r.status)}</span></td>
              <td>${action}</td>
            </tr>`;
          }).join("")
        : "<tr><td colspan='12'>No Manager-recommended leave application found.</td></tr>";
    }

    if (recentTbody) {
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const recentRows = leaveApplications
        .filter(r => ["Partner Approved", "Partner Rejected"].includes(r.status))
        .filter(r => {
          const actionDate = r.partner_decided_at ? new Date(r.partner_decided_at).getTime() : 0;
          return actionDate >= sevenDaysAgo;
        })
        .sort((a, b) => new Date(b.partner_decided_at || 0) - new Date(a.partner_decided_at || 0));

      recentTbody.innerHTML = recentRows.length
        ? recentRows.map(r => {
            const expectedJoin = r.expected_join_date || getExpectedJoinDate(
              r.from_date,
              r.to_date,
              r.second_from_date,
              r.second_to_date
            );
            const joinStatus = getJoinStatus(expectedJoin, r.actual_join_date);

            return `<tr>
              <td>${escapeHtml(formatDate(r.partner_decided_at))}</td>
              <td>${escapeHtml(r.student_id)}</td>
              <td>${escapeHtml(r.applicant_name)}</td>
              <td>${escapeHtml(r.leave_type)}</td>
              <td>${escapeHtml(leaveRangeText(r.from_date, r.to_date))}</td>
              <td>${escapeHtml(leaveRangeText(r.second_from_date, r.second_to_date))}</td>
              <td>${escapeHtml(r.total_days)}</td>
              <td>${escapeHtml(expectedJoin || "")}</td>
              <td>${escapeHtml(r.actual_join_date || "")}</td>
              <td><span class="leave-status ${joinStatusClass(joinStatus)}">${escapeHtml(joinStatus)}</span></td>
              <td><span class="leave-status ${leaveStatusClass(r.status)}">${escapeHtml(r.status)}</span></td>
              <td>${escapeHtml(r.partner_note || "")}</td>
            </tr>`;
          }).join("")
        : "<tr><td colspan='12'>No Partner action in the last 7 days.</td></tr>";
    }
  };


  // ============================================================
  // EXECUTIVE LEAVE PRESERVATION
  // ============================================================
  let executiveLeaveRows = [];
  let executiveLeaveRefreshTimer = null;
  let executiveLeaveLastLoad = 0;

  function getCurrentLeaveProfile() {
    try {
      if (typeof currentProfile !== "undefined" && currentProfile) return currentProfile;
    } catch (error) {}
    return window.currentProfile || null;
  }

  function getCurrentLeaveUser() {
    try {
      if (typeof currentUser !== "undefined" && currentUser) return currentUser;
    } catch (error) {}
    return window.currentUser || null;
  }

  function isExecutiveLeaveUser() {
    const profile = getCurrentLeaveProfile();
    const user = getCurrentLeaveUser();
    if (!profile && !user) return false;
    const role = String((profile && profile.role) || "").toLowerCase();
    const email = String((user && user.email) || (profile && profile.email) || "").toLowerCase();
    return role === "executive" || email === "ramjan.maf@gmail.com";
  }

  function findExecutiveLeaveHost() {
    const ids = [
      "executiveTab", "executiveSection", "executivePanel", "executiveView",
      "executiveContent", "tab-executive", "executivePage", "executiveDashboard"
    ];
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) return element;
    }

    const selectors = [
      '[data-tab-content="executive"]',
      '[data-role-panel="executive"]',
      '[data-page="executive"]',
      '.executive-panel',
      '.executive-section'
    ];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }

    return document.querySelector("main") || document.querySelector(".container") || document.body;
  }

  function ensureExecutiveLeavePanel() {
    if (!isExecutiveLeaveUser()) return null;

    let panel = document.getElementById("executiveLeavePreservationPanel");
    if (panel) return panel;

    const host = findExecutiveLeaveHost();
    if (!host) return null;

    panel = document.createElement("section");
    panel.id = "executiveLeavePreservationPanel";
    panel.className = "card";
    panel.style.marginTop = "18px";
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <div>
          <h2 style="margin:0 0 5px;">Approved Leave Applications</h2>
          <p class="muted" style="margin:0;">Partner Approved applications appear here automatically. Preserve keeps an Executive record without changing the leave approval status.</p>
        </div>
        <button type="button" onclick="loadExecutiveLeavePreservation(true)">Refresh</button>
      </div>

      <h3 style="margin-top:20px;">Waiting to Preserve</h3>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Approved</th><th>Student</th><th>Type</th><th>Range 1</th><th>Range 2</th>
              <th>Days</th><th>Expected Join</th><th>Actual Join</th><th>Join Status</th>
              <th>Manager Note</th><th>Partner Note</th><th>Action</th>
            </tr>
          </thead>
          <tbody id="executiveLeaveQueueTable">
            <tr><td colspan="12">Loading approved leave applications...</td></tr>
          </tbody>
        </table>
      </div>

      <h3 style="margin-top:24px;">Preserved Leave Applications</h3>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Preserved</th><th>Student</th><th>Type</th><th>Range 1</th><th>Range 2</th>
              <th>Days</th><th>Expected Join</th><th>Actual Join</th><th>Join Status</th>
              <th>Executive Note</th><th>Action</th>
            </tr>
          </thead>
          <tbody id="executiveLeavePreservedTable">
            <tr><td colspan="11">No preserved leave application loaded.</td></tr>
          </tbody>
        </table>
      </div>`;

    host.appendChild(panel);
    return panel;
  }

  function executiveLeaveRowById(leaveId) {
    return executiveLeaveRows.find(row => String(row.id) === String(leaveId)) || null;
  }

  function renderExecutiveLeavePreservation() {
    const queueBody = document.getElementById("executiveLeaveQueueTable");
    const preservedBody = document.getElementById("executiveLeavePreservedTable");
    if (!queueBody || !preservedBody) return;

    const queueRows = executiveLeaveRows.filter(row => !row.executive_preserved_at);
    const preservedRows = executiveLeaveRows.filter(row => row.executive_preserved_at);

    queueBody.innerHTML = queueRows.length
      ? queueRows.map(row => {
          const expectedJoin = row.expected_join_date || getExpectedJoinDate(
            row.from_date, row.to_date, row.second_from_date, row.second_to_date
          );
          const joinStatus = getJoinStatus(expectedJoin, row.actual_join_date);
          return `<tr>
            <td>${escapeHtml(row.partner_decided_at ? formatDate(row.partner_decided_at) : "")}</td>
            <td><strong>${escapeHtml(row.student_id || "")}</strong><br>${escapeHtml(row.applicant_name || "")}</td>
            <td>${escapeHtml(row.leave_type || "")}</td>
            <td>${escapeHtml(leaveRangeText(row.from_date, row.to_date))}</td>
            <td>${escapeHtml(leaveRangeText(row.second_from_date, row.second_to_date))}</td>
            <td>${escapeHtml(row.total_days || "")}</td>
            <td>${escapeHtml(expectedJoin || "")}</td>
            <td>${escapeHtml(row.actual_join_date || "")}</td>
            <td><span class="leave-status ${joinStatusClass(joinStatus)}">${escapeHtml(joinStatus)}</span></td>
            <td>${escapeHtml(row.manager_note || "")}</td>
            <td>${escapeHtml(row.partner_note || "")}</td>
            <td style="white-space:nowrap;">
              <button type="button" onclick="printExecutiveLeaveApplication('${escapeAttribute(row.id)}')">Print</button>
              <button type="button" class="success" onclick="executivePreserveLeave('${escapeAttribute(row.id)}')">Preserve</button>
            </td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="12">No Partner Approved leave application waiting to be preserved.</td></tr>';

    preservedBody.innerHTML = preservedRows.length
      ? preservedRows.map(row => {
          const expectedJoin = row.expected_join_date || getExpectedJoinDate(
            row.from_date, row.to_date, row.second_from_date, row.second_to_date
          );
          const joinStatus = getJoinStatus(expectedJoin, row.actual_join_date);
          return `<tr>
            <td>${escapeHtml(row.executive_preserved_at ? formatDate(row.executive_preserved_at) : "")}</td>
            <td><strong>${escapeHtml(row.student_id || "")}</strong><br>${escapeHtml(row.applicant_name || "")}</td>
            <td>${escapeHtml(row.leave_type || "")}</td>
            <td>${escapeHtml(leaveRangeText(row.from_date, row.to_date))}</td>
            <td>${escapeHtml(leaveRangeText(row.second_from_date, row.second_to_date))}</td>
            <td>${escapeHtml(row.total_days || "")}</td>
            <td>${escapeHtml(expectedJoin || "")}</td>
            <td>${escapeHtml(row.actual_join_date || "")}</td>
            <td><span class="leave-status ${joinStatusClass(joinStatus)}">${escapeHtml(joinStatus)}</span></td>
            <td>${escapeHtml(row.executive_note || "")}</td>
            <td><button type="button" onclick="printExecutiveLeaveApplication('${escapeAttribute(row.id)}')">Print</button></td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="11">No preserved leave application found.</td></tr>';
  }

  window.loadExecutiveLeavePreservation = async function (force) {
    if (!isExecutiveLeaveUser()) return;
    ensureExecutiveLeavePanel();

    const now = Date.now();
    if (!force && now - executiveLeaveLastLoad < 5000) return;
    executiveLeaveLastLoad = now;

    const result = await db
      .from("leave_applications")
      .select("*")
      .eq("status", "Partner Approved")
      .order("partner_decided_at", { ascending: false });

    if (result.error) {
      const queueBody = document.getElementById("executiveLeaveQueueTable");
      if (queueBody) {
        queueBody.innerHTML = `<tr><td colspan="12">Unable to load approved leave applications: ${escapeHtml(result.error.message)}</td></tr>`;
      }
      return;
    }

    executiveLeaveRows = result.data || [];
    renderExecutiveLeavePreservation();
  };

  window.executivePreserveLeave = async function (leaveId) {
    if (!isExecutiveLeaveUser()) {
      showMessage("Only the Executive account can preserve approved leave applications.", "error");
      return;
    }

    const row = executiveLeaveRowById(leaveId);
    if (!row) {
      showMessage("Leave application not found in the Executive queue.", "error");
      return;
    }

    const note = prompt("Executive preservation note (optional):", row.executive_note || "");
    if (note === null) return;

    const result = await db.rpc("executive_preserve_leave", {
      p_leave_id: String(leaveId),
      p_note: String(note || "").trim() || null
    });

    if (result.error) {
      showMessage("Preserve failed: " + result.error.message, "error");
      return;
    }

    await loadExecutiveLeavePreservation(true);
    showMessage("Leave application preserved in the Executive account.", "success");
  };

  window.printExecutiveLeaveApplication = function (leaveId) {
    const row = executiveLeaveRowById(leaveId);
    if (!row) {
      showMessage("Leave application not found.", "error");
      return;
    }

    const expectedJoin = row.expected_join_date || getExpectedJoinDate(
      row.from_date, row.to_date, row.second_from_date, row.second_to_date
    );
    const joinStatus = getJoinStatus(expectedJoin, row.actual_join_date);
    const popup = window.open("", "_blank", "width=1000,height=760");
    if (!popup) {
      showMessage("Please allow pop-ups to print the leave application.", "error");
      return;
    }

    const esc = value => escapeHtml(value == null ? "" : String(value));
    popup.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Leave Application - ${esc(row.student_id || "")}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#111;margin:35px} h1,h2{text-align:center;margin:4px 0}
        .meta{width:100%;border-collapse:collapse;margin:24px 0}.meta td{border:1px solid #bbb;padding:8px;vertical-align:top}
        .label{font-weight:bold;width:18%}.section{margin-top:22px}.sign{margin-top:40px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px}
        .sign div{border-top:1px solid #333;padding-top:6px;text-align:center}@media print{button{display:none}}
      </style></head><body>
      <h1>M A FAZAL &amp; CO.</h1><h2>Chartered Accountants</h2><h2>Approved Leave Application</h2>
      <table class="meta">
        <tr><td class="label">Student</td><td>${esc(row.student_id)} - ${esc(row.applicant_name)}</td><td class="label">Branch</td><td>${esc(row.branch)}</td></tr>
        <tr><td class="label">Leave Type</td><td>${esc(row.leave_type)}</td><td class="label">Total Days</td><td>${esc(row.total_days)}</td></tr>
        <tr><td class="label">Range 1</td><td>${esc(leaveRangeText(row.from_date,row.to_date))}</td><td class="label">Range 2</td><td>${esc(leaveRangeText(row.second_from_date,row.second_to_date))}</td></tr>
        <tr><td class="label">Expected Join</td><td>${esc(expectedJoin)}</td><td class="label">Actual Join</td><td>${esc(row.actual_join_date || "")}</td></tr>
        <tr><td class="label">Join Status</td><td>${esc(joinStatus)}</td><td class="label">Partner Decision</td><td>${esc(row.partner_decided_at ? formatDate(row.partner_decided_at) : "")}</td></tr>
        <tr><td class="label">Reason</td><td colspan="3">${esc(row.reason)}</td></tr>
        <tr><td class="label">Manager Note</td><td colspan="3">${esc(row.manager_note || "")}</td></tr>
        <tr><td class="label">Partner Note</td><td colspan="3">${esc(row.partner_note || "")}</td></tr>
        <tr><td class="label">Executive Status</td><td>${row.executive_preserved_at ? "Preserved" : "Waiting to Preserve"}</td><td class="label">Executive Note</td><td>${esc(row.executive_note || "")}</td></tr>
      </table>
      <div class="sign"><div>Applicant</div><div>Manager</div><div>Partner / Executive Record</div></div>
      <p style="margin-top:30px;text-align:center;"><button onclick="window.print()">Print</button></p>
      </body></html>`);
    popup.document.close();
    popup.focus();
  };

  function startExecutiveLeaveAutoRefresh() {
    if (!isExecutiveLeaveUser()) return;
    ensureExecutiveLeavePanel();
    loadExecutiveLeavePreservation(true);

    if (!executiveLeaveRefreshTimer) {
      executiveLeaveRefreshTimer = setInterval(function () {
        if (isExecutiveLeaveUser()) {
          ensureExecutiveLeavePanel();
          loadExecutiveLeavePreservation(false);
        }
      }, 30000);
    }
  }

  // Hook the normal role-data loader when available, without changing app.js.
  if (typeof window.loadRoleData === "function") {
    const originalLoadRoleData = window.loadRoleData;
    window.loadRoleData = async function () {
      const result = await originalLoadRoleData.apply(this, arguments);
      if (isExecutiveLeaveUser()) startExecutiveLeaveAutoRefresh();
      return result;
    };
  }

  // Also watch the UI because the Executive panel may be rendered after this patch loads.
  const executiveLeaveObserver = new MutationObserver(function () {
    if (isExecutiveLeaveUser()) {
      ensureExecutiveLeavePanel();
      loadExecutiveLeavePreservation(false);
    }
  });

  function initializeExecutiveLeaveUpgrade() {
    executiveLeaveObserver.observe(document.documentElement, { childList: true, subtree: true });
    if (isExecutiveLeaveUser()) startExecutiveLeaveAutoRefresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeExecutiveLeaveUpgrade, { once: true });
  } else {
    initializeExecutiveLeaveUpgrade();
  }

})();
