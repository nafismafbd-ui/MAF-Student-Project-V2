document.addEventListener("DOMContentLoaded", init);

    async function init() {
      setToday();
      setupDesignationFundRule();
      await loadPublicStudents();
      const result = await db.auth.getSession();
      const session = result.data.session;
      if (session) await handleLoggedInUser(session.user);
      else renderLoggedOut();
    }

    function setToday() {
      const today = new Date().toISOString().slice(0, 10);
      const month = new Date().toISOString().slice(0, 7);
      ["receivableDueDate", "paymentDate", "expenseDate", "voucherDate"].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = today;
      });
      const ms = document.getElementById("monthlySheetMonth"); if (ms) ms.value = month;
    }

    function isFundEligibleDesignation(designation) {
      return designation === "Article Student" || designation === "Manager";
    }

    function applyFundResponsibilityRules() {
      const designationEl = document.getElementById("designation");
      const responsibilityEl = document.getElementById("fundResponsibility");
      if (!designationEl || !responsibilityEl) return;

      const eligible = isFundEligibleDesignation(designationEl.value);
      Array.from(responsibilityEl.options).forEach(option => {
        option.disabled = !eligible && option.value !== "Student" && option.textContent !== "Student";
      });

      if (!eligible) {
        responsibilityEl.value = "Student";
        responsibilityEl.title = "Only Article Student and Manager can be selected as fund members.";
      } else {
        responsibilityEl.title = "";
      }
    }

    function setupDesignationFundRule() {
      const designationEl = document.getElementById("designation");
      if (designationEl) {
        designationEl.addEventListener("change", applyFundResponsibilityRules);
      }
      applyFundResponsibilityRules();
    }

    async function refreshAll() {
      await loadPublicStudents();
      if (currentUser) {
        await loadMyAdditionalRoles();
        renderLoggedIn();
        await loadRoleData();
      }
      showMessage("Data refreshed.", "success");
    }

    async function login() {
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value.trim();
      if (!email || !password) { showMessage("Login ID / Email and password are required.", "error"); return; }

      // TEMPORARY TEST: require the hCaptcha widget before login.
      // This is only a browser-side test; server-side verification is needed for real security.
      const captchaResponse = (window.hcaptcha && typeof window.hcaptcha.getResponse === "function")
        ? window.hcaptcha.getResponse()
        : "";
      if (!captchaResponse) {
        showMessage("Please complete the hCaptcha test before login.", "error");
        return;
      }

      const result = await db.auth.signInWithPassword({ email, password });
      if (result.error) { showMessage(result.error.message, "error"); return; }
      document.getElementById("loginEmail").value = "";
      document.getElementById("loginPassword").value = "";
      if (window.hcaptcha && typeof window.hcaptcha.reset === "function") window.hcaptcha.reset();
      await handleLoggedInUser(result.data.user);
      showMessage("Login successful.", "success");
    }

    async function logout() {
      await db.auth.signOut();
      if (window.hcaptcha && typeof window.hcaptcha.reset === "function") window.hcaptcha.reset();
      currentUser = null;
      currentProfile = null;
      currentAdditionalRoles = [];
      managerAccessAssignments = [];
      renderLoggedOut();
      showMessage("Logged out successfully.", "success");
    }

    async function handleLoggedInUser(user) {
      currentUser = user;
      const result = await db.from("profiles").select("*").eq("id", user.id).single();
      if (result.error || !result.data) {
        showMessage("Login user found, but no role profile found. Please add this user in profiles table.", "error");
        renderLoggedOut();
        return;
      }
      currentProfile = result.data;
      if (currentProfile.status && currentProfile.status !== "Active") {
        showMessage("This account is inactive.", "error");
        await logout();
        return;
      }
      await loadMyAdditionalRoles();
      renderLoggedIn();
      await loadRoleData();
    }

    async function loadMyAdditionalRoles() {
      currentAdditionalRoles = [];
      if (!currentUser) return;
      const result = await db
        .from("user_access_roles")
        .select("access_role,active")
        .eq("user_id", currentUser.id)
        .eq("active", true);
      if (!result.error) {
        currentAdditionalRoles = (result.data || []).map(r => r.access_role);
      }
    }

    function isMasterPower() {
      if (!currentProfile) return false;
      return currentProfile.role === "master" || currentAdditionalRoles.includes("top_senior");
    }

    function isActualMaster() {
      return !!currentProfile && currentProfile.role === "master";
    }

    function hasAccessRole(role) {
      if (!currentProfile) return false;
      if (isMasterPower()) {
        return ["master", "top_senior", "fund_manager", "data_manager"].includes(role);
      }
      return currentProfile.role === role || currentAdditionalRoles.includes(role);
    }

    function accessRoleLabel(role) {
      if (role === "fund_manager") return "Fund Manager";
      if (role === "data_manager") return "Data Manager";
      if (role === "top_senior") return "Top Senior";
      return role;
    }

    function renderLoggedOut() {
      document.getElementById("loginStatus").textContent = "Not logged in";
      document.getElementById("loginForm").classList.remove("hidden");
      document.getElementById("logoutBtn").classList.add("hidden");
      hideRoleTabs();
      applyMasterCredentialFieldVisibility();
      openTabById("publicTab");
    }

    function renderLoggedIn() {
      const roleText = currentProfile.role || "unknown";
      const extraText = currentAdditionalRoles.length
        ? " + " + currentAdditionalRoles.map(accessRoleLabel).join(" + ")
        : "";
      document.getElementById("loginStatus").textContent = roleText + extraText + " | " + currentUser.email;
      document.getElementById("loginForm").classList.add("hidden");
      document.getElementById("logoutBtn").classList.remove("hidden");
      hideRoleTabs();

      if (roleText === "student") {
        document.getElementById("studentTabBtn").classList.remove("hidden");
      }
      if (roleText === "manager") {
        document.getElementById("studentTabBtn").classList.remove("hidden");
        document.getElementById("managerLeaveTabBtn").classList.remove("hidden");
      }
      if (hasAccessRole("fund_manager")) document.getElementById("fundTabBtn").classList.remove("hidden");
      if (hasAccessRole("data_manager")) document.getElementById("dataTabBtn").classList.remove("hidden");
      if (roleText === "partner") document.getElementById("partnerTabBtn").classList.remove("hidden");
      if (isMasterPower()) document.getElementById("masterTabBtn").classList.remove("hidden");

      if (isMasterPower()) openTabById("masterTab");
      else if (roleText === "partner") openTabById("partnerTab");
      else if (roleText === "fund_manager") openTabById("fundTab");
      else if (roleText === "data_manager") openTabById("dataTab");
      else if (roleText === "manager") openTabById("managerLeaveTab");
      else if (roleText === "student") openTabById("studentTab");
    }

    function hideRoleTabs() {
      ["studentTabBtn", "fundTabBtn", "dataTabBtn", "masterTabBtn", "managerLeaveTabBtn", "partnerTabBtn"].forEach(id => document.getElementById(id).classList.add("hidden"));
    }

    async function loadPublicStudents() {
      const result = await db.from("students").select("*").order("full_name", { ascending: true });
      if (result.error) { showMessage("Public student load error: " + result.error.message, "error"); return; }
      students = result.data || [];
      document.getElementById("heroNumber").textContent = students.length;
      renderBirthdayNotice();
      renderServerOrganogramTable();
      renderPublicStudents();
    }

    function renderBirthdayNotice() {
      const box = document.getElementById("birthdayBox");
      const today = new Date();
      const month = today.getMonth() + 1;
      const day = today.getDate();
      const birthdayStudents = students.filter(s => Number(s.birth_month) === month && Number(s.birth_day) === day);
      if (birthdayStudents.length === 0) { box.style.display = "none"; box.innerHTML = ""; return; }
      const birthdayNames = birthdayStudents.map(s => escapeHtml(s.full_name)).join(", ");
      box.innerHTML = `
        <div class="birthday-confetti" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span>
        </div>
        <div class="birthday-content">
          <div class="birthday-title"><span class="party-badge">🎂</span> Birthday Celebration Today</div>
          <div class="birthday-names">🎉 ${birthdayNames} 🎈</div>
        </div>
      `;
      box.style.display = "block";
    }

    function getDesignationRank(designation) {
      const rank = {
        "Manager": 1,
        "Article Student": 2,
        "Intern": 3,
        "Under Provision": 4
      };
      return rank[designation] || 99;
    }

    function sortOrganogramRows(rows) {
      return rows.slice().sort((a, b) => {
        const rankDiff = getDesignationRank(a.designation) - getDesignationRank(b.designation);
        if (rankDiff !== 0) return rankDiff;
        const dateA = safe(a.joining_date) || "9999-12-31";
        const dateB = safe(b.joining_date) || "9999-12-31";
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return safe(a.full_name).localeCompare(safe(b.full_name));
      });
    }

    function renderServerOrganogram() {
      const box = document.getElementById("serverOrganogram");
      if (!box) return;

      const activeRows = sortOrganogramRows(students.filter(s => safe(s.status) === "Active"));
      if (activeRows.length === 0) {
        box.innerHTML = "<div class='notice'>No active profile found.</div>";
        return;
      }

      const groups = [
        { title: "Manager", rows: activeRows.filter(s => s.designation === "Manager") },
        { title: "Article Student", rows: activeRows.filter(s => s.designation === "Article Student") },
        { title: "Intern", rows: activeRows.filter(s => s.designation === "Intern") },
        { title: "Under Provision", rows: activeRows.filter(s => s.designation === "Under Provision") }
      ].filter(group => group.rows.length > 0);

      box.innerHTML = `<div class="organogram-wrap">${groups.map(group => `
        <div class="org-group">
          <h3>${escapeHtml(group.title)}</h3>
          <div class="org-grid">
            ${group.rows.map(s => `
              <div class="org-person">
                <div class="org-avatar">${s.photo_url ? `<img src="${escapeHtml(s.photo_url)}">` : escapeHtml(getInitials(s.full_name))}</div>
                <div>
                  <p class="org-name">${escapeHtml(s.full_name)}</p>
                  <div class="org-meta">${escapeHtml(s.student_id)}${s.joining_date ? ` | Joining: ${escapeHtml(s.joining_date)}` : ""}</div>
                </div>
              </div>`).join("")}
          </div>
        </div>`).join("")}</div>`;
    }

    function buildServerOrganogramGroups() {
      const activeRows = sortOrganogramRows(students.filter(s => safe(s.status) === "Active"));
      const branchNames = Array.from(new Set(activeRows.map(s => safe(s.branch) || "No Branch"))).sort((a, b) => a.localeCompare(b));
      return branchNames.map(branch => ({
        title: branch,
        rows: activeRows.filter(s => (safe(s.branch) || "No Branch") === branch)
      })).filter(group => group.rows.length > 0);
    }

    function renderServerOrganogramTable() {
      const box = document.getElementById("serverOrganogramTable");
      if (!box) return;
      const groups = buildServerOrganogramGroups();
      if (groups.length === 0) {
        box.innerHTML = "<tr><td colspan='9'>No active profile found.</td></tr>";
        return;
      }
      let sl = 1;
      box.innerHTML = groups.map(group => `
        <tr><th colspan="9" style="text-align:left;background:#fff3f3;color:#7f1d1d;">${escapeHtml(group.title)}</th></tr>
        ${group.rows.map(s => `
          <tr>
            <td>${sl++}</td>
            <td>${escapeHtml(s.student_id)}</td>
            <td>${escapeHtml(s.full_name)}</td>
            <td>${escapeHtml(s.designation)}</td>
            <td>${escapeHtml(s.joining_date || "")}</td>
            <td>${escapeHtml(s.branch || "")}</td>
            <td>${escapeHtml(s.ca_level || "")}</td>
            <td>${escapeHtml(s.ca_results || "")}</td>
            <td>${escapeHtml(s.status || "")}</td>
          </tr>`).join("")}
      `).join("");
    }

    function getPublicProfileDesignationRank(designation) {
      const rank = {
        "Manager": 1,
        "Article Student": 2,
        "Under Provision": 3,
        "Intern": 4
      };
      return rank[safe(designation)] || 99;
    }

    function sortPublicProfileRows(rows) {
      return rows.slice().sort((a, b) => {
        const rankDiff = getPublicProfileDesignationRank(a.designation) - getPublicProfileDesignationRank(b.designation);
        if (rankDiff !== 0) return rankDiff;

        const idCompare = safe(a.student_id).localeCompare(safe(b.student_id), undefined, { numeric: true, sensitivity: "base" });
        if (idCompare !== 0) return idCompare;

        return safe(a.full_name).localeCompare(safe(b.full_name), undefined, { sensitivity: "base" });
      });
    }

    function renderPublicStudents() {
      const box = document.getElementById("publicStudentList");
      const search = document.getElementById("publicSearch").value.toLowerCase();
      const rows = sortPublicProfileRows(students.filter(s => safe(s.full_name).toLowerCase().includes(search) || safe(s.student_id).toLowerCase().includes(search) || safe(s.designation).toLowerCase().includes(search) || safe(s.registration_no).toLowerCase().includes(search) || safe(s.branch).toLowerCase().includes(search) || safe(s.ca_results).toLowerCase().includes(search)));
      if (rows.length === 0) { box.innerHTML = "<div class='notice'>No student found.</div>"; return; }
      box.innerHTML = rows.map(s => `
        <div class="student-list-item">
          <div class="public-photo">${s.photo_url ? `<img src="${escapeHtml(s.photo_url)}">` : escapeHtml(getInitials(s.full_name))}</div>
          <div>
            <h3 class="student-name" onclick="openPublicProfile('${escapeAttribute(s.student_id)}')">${escapeHtml(s.full_name)}</h3>
            <div class="short-meta"><span>ID: ${escapeHtml(s.student_id)}</span><span>${escapeHtml(s.designation)}</span><span>${escapeHtml(s.branch)}</span><span>${escapeHtml(s.status)}</span></div>
          </div>
        </div>`).join("");
    }

    function openPublicProfile(studentId) {
      const box = document.getElementById("publicProfileModalContent");
      const modal = document.getElementById("publicProfileModal");
      const s = students.find(item => item.student_id === studentId);

      if (!s) {
        showMessage("Profile not found.", "error");
        return;
      }

      box.innerHTML = `
        <div class="full-profile-card">
          <div class="full-profile-header">
            <div class="full-profile-photo">${s.photo_url ? `<img src="${escapeHtml(s.photo_url)}">` : escapeHtml(getInitials(s.full_name))}</div>
            <div><h2 class="full-profile-name">${escapeHtml(s.full_name)}</h2><div class="full-profile-subtitle">CA Profile | M A Fazal & Co., Chartered Accountants</div></div>
          </div>
          <div class="full-profile-details">
            <div class="info"><span>Student ID</span><strong>${escapeHtml(s.student_id)}</strong></div>
            <div class="info"><span>Full Name</span><strong>${escapeHtml(s.full_name)}</strong></div>
            <div class="info"><span>Designation</span><strong>${escapeHtml(s.designation)}</strong></div>
            <div class="info"><span>Registration No.</span><strong>${escapeHtml(s.registration_no)}</strong></div>
            <div class="info"><span>Joining Date</span><strong>${escapeHtml(s.joining_date)}</strong></div>
            <div class="info"><span>CC Complete Date</span><strong>${escapeHtml(s.cc_complete_date)}</strong></div>
            <div class="info"><span>CA Level</span><strong>${escapeHtml(s.ca_level)}</strong></div>
            <div class="info"><span>CA Result</span><strong>${escapeHtml(s.ca_results)}</strong></div>
            <div class="info"><span>Branch</span><strong>${escapeHtml(s.branch)}</strong></div>
            <div class="info"><span>Status</span><strong class="${s.status === "Active" ? "active-status" : "inactive-status"}">${escapeHtml(s.status)}</strong></div>
          </div>
        </div>`;

      modal.classList.add("show");
      document.body.style.overflow = "hidden";
    }

    function closePublicProfileModal() {
      const modal = document.getElementById("publicProfileModal");
      if (modal) modal.classList.remove("show");
      document.body.style.overflow = "";
    }

    function openStudentAccountRequestModal() {
      const modal = document.getElementById("studentAccountRequestModal");
      if (modal) modal.classList.add("show");
      document.body.style.overflow = "hidden";
    }

    function closeStudentAccountRequestModal() {
      const modal = document.getElementById("studentAccountRequestModal");
      if (modal) modal.classList.remove("show");
      document.body.style.overflow = "";
    }

    function closeModalOnBackdrop(event, modalId) {
      if (event.target && event.target.id === modalId) {
        event.target.classList.remove("show");
        document.body.style.overflow = "";
      }
    }

    async function loadRoleData() {
      const role = currentProfile.role;
      if (role === "student" || role === "manager") {
        await loadStudentDashboard();
        await configureManagerLeaveAccess();
      }
      if (role === "manager") await loadManagerLeaveData();
      if (hasAccessRole("fund_manager")) await loadFundData();
      if (hasAccessRole("data_manager")) await loadStudentDataManager();
      if (role === "partner") await loadPartnerData();
      if (isMasterPower()) await loadMasterData();
    }

    async function loadFunds() {
      const result = await db.from("student_funds").select("*").order("fund_name", { ascending: true });
      if (result.error) { funds = [{ fund_name: "General Fund" }]; return; }
      funds = result.data && result.data.length ? result.data : [{ fund_name: "General Fund" }];
    }

    function fillFundSelect(id) {
      const el = document.getElementById(id); if (!el) return;
      el.innerHTML = funds.map(f => `<option value="${escapeAttribute(f.fund_name)}">${escapeHtml(f.fund_name)}</option>`).join("");
    }

    function fillAllFundSelects() {
      ["openingFund", "cashOpeningFund", "receivableFund", "paymentFund", "expenseFund", "voucherFund", "monthlySheetFund", "fundManageSelect"].forEach(fillFundSelect);
    }

    async function saveFundName() {
      if (!isMasterPower()) { showMessage("Only Master Account / Top Senior can create fund name.", "error"); return; }
      const fundName = document.getElementById("newFundName").value.trim();
      const description = document.getElementById("newFundDescription").value.trim();
      if (!fundName) { showMessage("Fund name is required.", "error"); return; }
      const result = await db.from("student_funds").upsert({ fund_name: fundName, description, status: "Active" }, { onConflict: "fund_name" });
      if (result.error) { showMessage(result.error.message, "error"); return; }
      clearFundNameForm();
      await loadFundData();
      showMessage("Fund name saved successfully.", "success");
    }

    function clearFundNameForm() {
      const nameEl = document.getElementById("newFundName");
      const descEl = document.getElementById("newFundDescription");
      if (nameEl) nameEl.value = "";
      if (descEl) descEl.value = "";
    }

    function renderFundManagementTable() {
      const tbody = document.getElementById("fundManagementTable");
      if (!tbody) return;

      if (!funds || funds.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4'>No fund found.</td></tr>";
        return;
      }

      tbody.innerHTML = funds.map(function (f) {
        return `
          <tr>
            <td>${escapeHtml(f.fund_name)}</td>
            <td>${escapeHtml(f.description)}</td>
            <td>${escapeHtml(f.status || "Active")}</td>
            <td>
              <button class="warning" onclick="selectFundForManage('${escapeAttribute(f.fund_name)}')">Select</button>
              <button class="warning" onclick="resetSelectedFundData('${escapeAttribute(f.fund_name)}')">Reset</button>
              <button class="danger" onclick="deleteSelectedFund('${escapeAttribute(f.fund_name)}')">Delete</button>
            </td>
          </tr>
        `;
      }).join("");
    }

    function selectFundForManage(fundName) {
      const el = document.getElementById("fundManageSelect");
      if (el) el.value = fundName;
      showMessage("Fund selected: " + fundName, "success");
    }

    async function deleteRows(tableName, columnName, value) {
      const result = await db.from(tableName).delete().eq(columnName, value);
      if (result.error) throw new Error(result.error.message);
    }

    async function resetFundDataByName(fundName) {
      const voucherResult = await db
        .from("student_fund_vouchers")
        .select("id")
        .eq("fund_name", fundName);

      if (voucherResult.error) throw new Error(voucherResult.error.message);

      const voucherIds = (voucherResult.data || []).map(function (v) { return v.id; });

      if (voucherIds.length > 0) {
        const itemDelete = await db
          .from("student_fund_voucher_items")
          .delete()
          .in("voucher_id", voucherIds);

        if (itemDelete.error) throw new Error(itemDelete.error.message);
      }

      await deleteRows("student_fund_vouchers", "fund_name", fundName);
      await deleteRows("fund_loan_repayments", "fund_name", fundName);
      await deleteRows("fund_loan_applications", "fund_name", fundName);
      await deleteRows("fund_payments", "fund_name", fundName);
      await deleteRows("payments", "fund_name", fundName);
      await deleteRows("receivables", "fund_name", fundName);
      await deleteRows("student_opening_balances", "fund_name", fundName);
      await deleteRows("fund_cash_in_hand_opening", "fund_name", fundName);
    }

    async function resetSelectedFundData(fundNameFromButton) {
      if (!isMasterPower()) {
        showMessage("Only Master Account / Top Senior can reset fund data.", "error");
        return;
      }

      const fundName = fundNameFromButton || document.getElementById("fundManageSelect").value;

      if (!fundName) {
        showMessage("Please select a fund.", "error");
        return;
      }

      const ok = confirm(
        "Reset this fund data?\n\n" +
        "Fund: " + fundName + "\n\n" +
        "This will delete opening balances, receivables, received fund, fund payments, loan applications, loan returns and vouchers for this fund. The fund name will remain."
      );

      if (!ok) return;

      try {
        await resetFundDataByName(fundName);
        await loadFundData();
        showMessage("Fund data reset successfully.", "success");
      } catch (err) {
        showMessage("Fund reset failed: " + err.message, "error");
      }
    }

    async function deleteSelectedFund(fundNameFromButton) {
      if (!isMasterPower()) {
        showMessage("Only Master Account / Top Senior can delete fund.", "error");
        return;
      }

      const fundName = fundNameFromButton || document.getElementById("fundManageSelect").value;

      if (!fundName) {
        showMessage("Please select a fund.", "error");
        return;
      }

      if (funds.length <= 1) {
        showMessage("At least one fund must remain. You can reset this fund data instead.", "error");
        return;
      }

      const ok = confirm(
        "Delete this fund permanently?\n\n" +
        "Fund: " + fundName + "\n\n" +
        "This will first delete all related fund data and then delete the fund name."
      );

      if (!ok) return;

      const finalOk = confirm("Final confirmation: Delete fund permanently? This cannot be undone.");
      if (!finalOk) return;

      try {
        await resetFundDataByName(fundName);

        const result = await db
          .from("student_funds")
          .delete()
          .eq("fund_name", fundName);

        if (result.error) throw new Error(result.error.message);

        await loadFundData();
        showMessage("Fund deleted successfully.", "success");
      } catch (err) {
        showMessage("Fund delete failed: " + err.message, "error");
      }
    }

    async function loadOpeningBalances() {
      const result = await db.from("student_opening_balances").select("*").order("student_name", { ascending: true });
      openingBalances = result.error ? [] : (result.data || []);
    }

    async function loadCashInHandOpeningBalances() {
      const result = await db
        .from("fund_cash_in_hand_opening")
        .select("*")
        .order("fund_name", { ascending: true });

      cashInHandOpeningBalances = result.error ? [] : (result.data || []);
    }

    function getOpeningBalance(studentId, fundName) {
      const row = openingBalances.find(o => o.student_id === studentId && o.fund_name === fundName && o.status === "Active");
      return row ? Number(row.opening_balance || 0) : 0;
    }

    function caLevelOptionsHtml(selected) {
      const levels = ["", "CL", "PL", "AL", "Complete"];
      return levels.map(level => `<option value="${escapeHtml(level)}" ${level === selected ? "selected" : ""}>${level || "Select CA Level"}</option>`).join("");
    }

    function caResultOptionsHtml(selected) {
      const results = ["", "0 Subjects Passed", "1 Subject Passed", "2 Subjects Passed", "3 Subjects Passed", "4 Subjects Passed", "5 Subjects Passed", "6 Subjects Passed", "7 Subjects Passed", "8 Subjects Passed", "9 Subjects Passed", "10 Subjects Passed", "11 Subjects Passed", "12 Subjects Passed", "13 Subjects Passed", "14 Subjects Passed", "15 Subjects Passed", "16 Subjects Passed", "17 Subjects Passed"];
      return results.map(result => `<option value="${escapeHtml(result)}" ${result === selected ? "selected" : ""}>${result || "Select Subject Pass Summary"}</option>`).join("");
    }

    async function buildStudentProfileDashboardHtml(studentId) {
      await loadOpeningBalances();
      await loadFunds();

      const publicResult = await db.from("students").select("*").eq("student_id", studentId).single();
      const privateResult = await db.from("student_details").select("*").eq("student_id", studentId).maybeSingle();
      const receivableResult = await db.from("receivables").select("*").eq("student_id", studentId).order("created_at", { ascending: false });
      const paymentResult = await db.from("payments").select("*").eq("student_id", studentId).order("created_at", { ascending: false });
      const loanResult = await db.from("fund_loan_applications").select("*").eq("student_id", studentId).order("created_at", { ascending: false });
      const loanRepaymentResult = await db.from("fund_loan_repayments").select("*").eq("student_id", studentId).order("payment_date", { ascending: false });
      const articleConversionResult = await db.from("student_article_conversion_requests").select("*").eq("student_id", studentId).order("created_at", { ascending: false });

      if (publicResult.error || !publicResult.data) {
        return "<div class='notice'>Profile not found.</div>";
      }

      const pub = publicResult.data || {};
      const priv = privateResult.data || {};
      const recs = receivableResult.data || [];
      const pays = paymentResult.data || [];
      const myLoans = loanResult.error ? [] : (loanResult.data || []);
      const myLoanRepayments = loanRepaymentResult.error ? [] : (loanRepaymentResult.data || []);
      const myArticleConversionRequests = articleConversionResult.error ? [] : (articleConversionResult.data || []);

      const studentFundOpening = openingBalances
        .filter(o => o.student_id === studentId && o.status === "Active")
        .reduce((sum, o) => sum + Number(o.opening_balance || 0), 0);

      const todayForStudentFund = new Date();
      const currentMonthStart = new Date(todayForStudentFund.getFullYear(), todayForStudentFund.getMonth(), 1);
      const nextMonthStart = new Date(todayForStudentFund.getFullYear(), todayForStudentFund.getMonth() + 1, 1);

      const parseLocalDate = (value) => {
        if (!value) return null;
        const parts = String(value).slice(0, 10).split("-").map(Number);
        if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null;
        return new Date(parts[0], parts[1] - 1, parts[2]);
      };

      const isBeforeThisMonth = (value) => {
        const d = parseLocalDate(value);
        return d && d < currentMonthStart;
      };

      const isInThisMonth = (value) => {
        const d = parseLocalDate(value);
        return d && d >= currentMonthStart && d < nextMonthStart;
      };

      const previousReceivable = recs
        .filter(r => isBeforeThisMonth(r.due_date))
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const previousPaid = pays
        .filter(p => isBeforeThisMonth(p.payment_date))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const previousMonthClosingDue = studentFundOpening + previousReceivable - previousPaid;

      const thisMonthPayable = recs
        .filter(r => isInThisMonth(r.due_date))
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const thisMonthPaid = pays
        .filter(p => isInThisMonth(p.payment_date))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const due = previousMonthClosingDue + thisMonthPayable - thisMonthPaid;

      const recRows = recs.length
        ? recs.map(r => `<tr><td>${escapeHtml(r.fund_name)}</td><td>${escapeHtml(r.description)}</td><td>${money(r.amount)}</td><td>${escapeHtml(r.due_date)}</td><td><span class="${r.status === "Paid" ? "paid" : "unpaid"}">${escapeHtml(r.status)}</span></td><td>${escapeHtml(r.paid_at)}</td></tr>`).join("")
        : "<tr><td colspan='6'>No payable found.</td></tr>";

      const payRows = pays.length
        ? pays.map(p => `<tr><td>${escapeHtml(p.fund_name)}</td><td>${escapeHtml(p.description)}</td><td>${money(p.amount)}</td><td>${escapeHtml(p.payment_date)}</td><td>${escapeHtml(p.method)}</td><td>${escapeHtml(p.note)}</td></tr>`).join("")
        : "<tr><td colspan='6'>No payment found.</td></tr>";

      let myCaUpdateRequests = [];
      if (currentProfile && currentProfile.role === "student" && currentProfile.student_id === studentId) {
        const caRequestResult = await db
          .from("student_ca_update_requests")
          .select("*")
          .eq("student_id", studentId)
          .order("created_at", { ascending: false });
        myCaUpdateRequests = caRequestResult.error ? [] : (caRequestResult.data || []);
      }

      const hasPendingCaUpdate = myCaUpdateRequests.some(r => r.status === "Pending");
      const myCaUpdateRows = myCaUpdateRequests.length
        ? myCaUpdateRequests.map(r => `<tr><td>${escapeHtml(formatDate(r.created_at))}</td><td>${escapeHtml(r.requested_ca_level)}</td><td>${escapeHtml(r.requested_ca_results)}</td><td><strong>${escapeHtml(r.status)}</strong></td><td>${escapeHtml(r.review_note)}</td></tr>`).join("")
        : "<tr><td colspan='5'>No CA update request found.</td></tr>";

      const studentCaEditBox = currentProfile && currentProfile.role === "student" && currentProfile.student_id === studentId
        ? `<div class="card">
            <h2>CA Results Update</h2>
            <h3>Request CA Status Update</h3>
            <div class="form-grid">
              <div><label>CA Level</label><select id="studentEditCaLevel">${caLevelOptionsHtml(pub.ca_level || "")}</select></div>
              <div><label>CA Result Summary</label><select id="studentEditCaResults">${caResultOptionsHtml(pub.ca_results || "")}</select></div>
            </div>
            <div class="btn-row">
              <button class="student-ca-submit-btn" onclick="updateMyCaStatus()" ${hasPendingCaUpdate ? "disabled" : ""}>Submit Approval Request</button>
            </div>
            <h3 class="student-ca-request-title">My CA Update Requests</h3>
            <table>
              <thead><tr><th>Date</th><th>Requested CA Level</th><th>Requested Result</th><th>Status</th><th>Review Note</th></tr></thead>
              <tbody>${myCaUpdateRows}</tbody>
            </table>
          </div>`
        : "";

      const studentLeaveBox = currentProfile
        && ["student", "manager"].includes(currentProfile.role)
        && currentProfile.student_id === studentId
        && pub.status === "Active"
        ? await buildStudentLeaveApplicationBox(studentId)
        : "";

      const articleConversionRows = myArticleConversionRequests.length
        ? myArticleConversionRequests.map(r => `
            <tr>
              <td>${escapeHtml(formatDate(r.created_at))}</td>
              <td>${escapeHtml(r.student_id)}</td>
              <td>${escapeHtml(r.proposed_student_id)}</td>
              <td>${escapeHtml(r.proposed_registration_no)}</td>
              <td>${escapeHtml(r.proposed_cc_complete_date)}</td>
              <td><strong>${escapeHtml(r.status)}</strong></td>
              <td class="article-note-cell">${escapeHtml(r.student_note)}</td>
              <td class="article-note-cell">${escapeHtml(r.data_manager_note)}</td>
              <td class="article-note-cell">${escapeHtml(r.master_note)}</td>
            </tr>
          `).join("")
        : "<tr><td colspan='9'>No Article Student conversion request found.</td></tr>";

      const hasOpenArticleConversion = myArticleConversionRequests.some(r =>
        ["Submitted", "Pending Master Approval"].includes(r.status)
      );

      const canStudentApplyArticleConversion =
        currentProfile
        && currentProfile.student_id === studentId
        && pub.status === "Active"
        && pub.designation === "Under Provision";

      const articleConversionApplyForm = canStudentApplyArticleConversion
        ? `<div class="card" style="margin-bottom:14px;">
            <h3>Apply for Article Student Conversion</h3>
            <div class="form-grid">
              <div>
                <label>ICAB Registration No.</label>
                <input id="studentArticleConversionRegistrationNo" value="${escapeAttribute(pub.registration_no || "")}" placeholder="Enter registration number">
              </div>
              <div>
                <label>CC Complete Date</label>
                <input type="date" id="studentArticleConversionCcCompleteDate" value="${escapeAttribute(pub.cc_complete_date || "")}">
              </div>
              <div style="grid-column:1/-1;">
                <label>Your Note</label>
                <input id="studentArticleConversionNote" placeholder="Optional note for Data Manager">
              </div>
            </div>
            <div class="btn-row">
              <button class="success" onclick="studentApplyArticleConversion()" ${hasOpenArticleConversion ? "disabled" : ""}>Apply for Conversion</button>
            </div>
            ${hasOpenArticleConversion ? `<div class="notice">Your conversion request is already under review/approval.</div>` : ""}
          </div>`
        : "";

      const articleConversionBox = currentProfile
        && currentProfile.student_id === studentId
        && (pub.designation === "Under Provision" || myArticleConversionRequests.length > 0)
        ? `<div class="card">
            <h2>Article Student Conversion</h2>
            ${articleConversionApplyForm}
            <div style="overflow-x:auto;">
              <table class="article-conversion-table">
                <thead><tr><th>Date</th><th>Current ID</th><th>New Article ID</th><th>Registration No.</th><th>CC Complete Date</th><th>Status</th><th>Student Note</th><th>Data Manager Note</th><th>Master Note</th></tr></thead>
                <tbody>${articleConversionRows}</tbody>
              </table>
            </div>
          </div>`
        : "";

      const isFundMember = isFundEligibleDesignation(pub.designation);
      const approvedLoanAmount = myLoans
        .filter(l => l.status === "Master Approved")
        .reduce((sum, l) => sum + Number(l.approved_amount || l.requested_amount || 0), 0);

      const totalLoanReturned = myLoanRepayments
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);

      const fundLoanPayable = Math.max(0, approvedLoanAmount - totalLoanReturned);

      const hasActiveLoanRequest = myLoans.some(l => ["Submitted", "Fund Manager Checked"].includes(l.status));

      const loanRows = myLoans.length
        ? myLoans.map(l => {
            const approved = l.status === "Master Approved" ? Number(l.approved_amount || l.requested_amount || 0) : 0;
            const returned = myLoanRepayments
              .filter(r => String(r.loan_id) === String(l.id))
              .reduce((sum, r) => sum + Number(r.amount || 0), 0);
            const outstanding = Math.max(0, approved - returned);
            const displayStatus = approved > 0 && outstanding <= 0.005 ? "Repaid" : l.status;
            return `<tr>
              <td class="loan-date-cell">${escapeHtml(formatDate(l.created_at))}</td>
              <td class="loan-fund-cell">${escapeHtml(l.fund_name)}</td>
              <td class="loan-amount-cell">${money(l.requested_amount)}</td>
              <td class="loan-amount-cell">${approved > 0 ? money(approved) : ""}</td>
              <td class="loan-amount-cell">${money(returned)}</td>
              <td class="loan-amount-cell">${approved > 0 ? money(outstanding) : ""}</td>
              <td class="loan-purpose-cell">${escapeHtml(l.purpose)}</td>
              <td class="loan-status-cell"><strong>${escapeHtml(displayStatus)}</strong></td>
              <td class="loan-note-cell">${escapeHtml(l.fund_manager_note)}</td>
              <td class="loan-note-cell">${escapeHtml(l.master_note)}</td>
            </tr>`;
          }).join("")
        : "<tr><td colspan='10'>No loan application found.</td></tr>";

      const loanApplicationHtml = currentProfile
        && currentProfile.role === "student"
        && currentProfile.student_id === studentId
        ? `<div class="card">
            <h2>Apply for Fund Loan</h2>
            <div class="form-grid">
              <div>
                <label>Fund</label>
                <select id="studentLoanFund">
                  ${funds.map(f => `<option value="${escapeAttribute(f.fund_name)}">${escapeHtml(f.fund_name)}</option>`).join("")}
                </select>
              </div>
              <div><label>Loan Amount</label><input type="number" id="studentLoanAmount" min="1" step="0.01" placeholder="Example: 5000"></div>
              <div style="grid-column:1/-1;"><label>Purpose</label><textarea id="studentLoanPurpose" placeholder="Reason / purpose for the loan"></textarea></div>
            </div>
            <div class="btn-row">
              <button onclick="submitFundLoanApplication()" ${hasActiveLoanRequest ? "disabled" : ""}>Apply for Loan</button>
            </div>
            ${hasActiveLoanRequest ? `<div class="notice">You already have a loan application waiting for review/approval.</div>` : ""}
          </div>`
        : "";

      const fundDashboardHtml = isFundMember
        ? `<div>
            <div class="cards">
              <div class="card stat"><h3>Previous Month Closing Due</h3><div class="value">${money(previousMonthClosingDue)}</div></div>
              <div class="card stat"><h3>This Month Fine/Donation Payable</h3><div class="value">${money(thisMonthPayable)}</div></div>
              <div class="card stat"><h3>This Month Paid</h3><div class="value">${money(thisMonthPaid)}</div></div>
              <div class="card stat"><h3>Due Balance</h3><div class="value">${money(due)}</div></div>
              <div class="card stat"><h3>Fund Loan Payable</h3><div class="value">${money(fundLoanPayable)}</div></div>
            </div>

            ${loanApplicationHtml}

            <div class="card">
              <h2>My Loans</h2>
              <div class="my-loans-table-wrap">
                <table class="my-loans-table">
                  <colgroup>
                    <col style="width:105px">
                    <col style="width:125px">
                    <col style="width:105px">
                    <col style="width:105px">
                    <col style="width:105px">
                    <col style="width:115px">
                    <col style="width:190px">
                    <col style="width:150px">
                    <col style="width:190px">
                    <col style="width:170px">
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Fund</th>
                      <th style="text-align:right;">Requested</th>
                      <th style="text-align:right;">Approved</th>
                      <th style="text-align:right;">Returned</th>
                      <th style="text-align:right;">Loan Payable</th>
                      <th>Purpose</th>
                      <th>Status</th>
                      <th>Fund Manager Note</th>
                      <th>Master Note</th>
                    </tr>
                  </thead>
                  <tbody>${loanRows}</tbody>
                </table>
              </div>
              <div class="my-loans-scroll-note">Swipe left or right to view all loan columns.</div>
            </div>

            <div class="card">
              <h2>My Payables</h2>
              <table>
                <thead><tr><th>Fund</th><th>Description</th><th>Amount</th><th>Due Date</th><th>Status</th><th>Paid At</th></tr></thead>
                <tbody>${recRows}</tbody>
              </table>
            </div>

            <div class="card">
              <h2>My Payments</h2>
              <table>
                <thead><tr><th>Fund</th><th>Description</th><th>Amount</th><th>Payment Date</th><th>Method</th><th>Note</th></tr></thead>
                <tbody>${payRows}</tbody>
              </table>
            </div>
          </div>`
        : "";

      const ownProfile = currentProfile && currentProfile.student_id === studentId;
      const canSeeCaUpdate = Boolean(studentCaEditBox);
      const canSeeLeave = Boolean(studentLeaveBox);
      const canSeeArticleConversion = Boolean(articleConversionBox);

      const profileSectionHeadItems = [
        isFundMember ? `<button class="student-profile-section-head" data-student-profile-head="fund" onclick="openStudentProfileDetail('fund', this)"><strong>Fund</strong><span>⌄</span></button>` : "",
        canSeeCaUpdate ? `<button class="student-profile-section-head" data-student-profile-head="ca" onclick="openStudentProfileDetail('ca', this)"><strong>CA Results Update</strong><span>⌄</span></button>` : "",
        canSeeArticleConversion ? `<button class="student-profile-section-head" data-student-profile-head="article" onclick="openStudentProfileDetail('article', this)"><strong>Article Conversion</strong><span>⌄</span></button>` : "",
        canSeeLeave ? `<button class="student-profile-section-head" data-student-profile-head="leave" onclick="openStudentProfileDetail('leave', this)"><strong>Leave Application</strong><span>⌄</span></button>` : ""
      ].filter(Boolean);
      const profileSectionHeads = profileSectionHeadItems.join("");
      const profileSectionHeadClass = profileSectionHeadItems.length === 1 ? "one-head" : (profileSectionHeadItems.length === 2 ? "two-heads" : "");

      return `
        <div class="student-profile-dashboard-layout">
          <div class="student-profile-left">
            <div class="card student-profile-main-card">
              <div class="avatar">${pub.photo_url ? `<img src="${escapeHtml(pub.photo_url)}">` : escapeHtml(getInitials(pub.full_name))}</div>
              <h2>${escapeHtml(pub.full_name)}</h2>
              <p class="subtitle">${escapeHtml(pub.student_id)} | ${escapeHtml(pub.designation)}</p>

              <div class="info"><span>Registration No.</span><strong>${escapeHtml(pub.registration_no)}</strong></div>
              <div class="info"><span>Joining Date</span><strong>${escapeHtml(pub.joining_date)}</strong></div>
              <div class="info"><span>CC Complete Date</span><strong>${escapeHtml(pub.cc_complete_date)}</strong></div>
              <div class="info"><span>CA Level</span><strong>${escapeHtml(pub.ca_level)}</strong></div>
              <div class="info"><span>CA Result</span><strong>${escapeHtml(pub.ca_results)}</strong></div>
              <div class="info"><span>Branch</span><strong>${escapeHtml(pub.branch)}</strong></div>
              <div class="info"><span>Fund Member Role</span><strong>${escapeHtml(pub.fund_responsibility && pub.fund_responsibility !== "Student" ? pub.fund_responsibility : "Fund Member")}</strong></div>
              <div class="info"><span>Status</span><strong class="${pub.status === "Active" ? "active-status" : "inactive-status"}">${escapeHtml(pub.status)}</strong></div>

              <h3>Private Details</h3>
              <div class="info"><span>Phone</span><strong>${escapeHtml(priv.phone)}</strong></div>
              <div class="info"><span>Email</span><strong>${escapeHtml(priv.email_private)}</strong></div>
              <div class="info"><span>Birth Date</span><strong>${escapeHtml(priv.birth_date)}</strong></div>
              <div class="info"><span>Address</span><strong>${escapeHtml(priv.address)}</strong></div>
              <div class="info"><span>Notes</span><strong>${escapeHtml(priv.notes)}</strong></div>
            </div>
          </div>

          <div class="student-profile-right">
            ${profileSectionHeads ? `<div class="student-profile-section-heads ${profileSectionHeadClass}">${profileSectionHeads}</div>` : ""}

            ${isFundMember ? `<div id="studentProfileFundPanel" class="student-profile-detail-panel hidden">${fundDashboardHtml}</div>` : ""}
            ${canSeeCaUpdate ? `<div id="studentProfileCaPanel" class="student-profile-detail-panel hidden">${studentCaEditBox}</div>` : ""}
            ${canSeeArticleConversion ? `<div id="studentProfileArticlePanel" class="student-profile-detail-panel hidden">${articleConversionBox}</div>` : ""}
            ${canSeeLeave ? `<div id="studentProfileLeavePanel" class="student-profile-detail-panel hidden">${studentLeaveBox}</div>` : ""}
          </div>
        </div>
      `;
    }



    function openStudentProfileDetail(section, button) {
      const panelMap = {
        fund: "studentProfileFundPanel",
        ca: "studentProfileCaPanel",
        article: "studentProfileArticlePanel",
        leave: "studentProfileLeavePanel"
      };

      const panelId = panelMap[section];
      const panel = panelId ? document.getElementById(panelId) : null;
      if (!panel) return;

      const wasOpen = !panel.classList.contains("hidden");

      document.querySelectorAll(".student-profile-detail-panel").forEach(item => item.classList.add("hidden"));
      document.querySelectorAll(".student-profile-section-head").forEach(head => head.classList.remove("active"));

      if (!wasOpen) {
        panel.classList.remove("hidden");
        if (button) button.classList.add("active");
      }
    }

    function leaveStatusClass(status) {
      return String(status || "").toLowerCase().replaceAll(" ", "-");
    }

    function calculateLeaveDays(fromDate, toDate) {
      if (!fromDate || !toDate) return 0;
      const from = new Date(fromDate + "T00:00:00");
      const to = new Date(toDate + "T00:00:00");
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return 0;
      return Math.floor((to - from) / 86400000) + 1;
    }

    async function buildStudentLeaveApplicationBox(studentId) {
      const result = await db.from("leave_applications").select("*").eq("student_id", studentId).order("created_at", { ascending: false });
      const rows = result.error ? [] : (result.data || []);
      const pending = rows.some(r => ["Submitted", "Manager Recommended"].includes(r.status));
      const tableRows = rows.length ? rows.map(r => `
        <tr>
          <td>${escapeHtml(formatDate(r.created_at))}</td>
          <td>${escapeHtml(r.leave_type)}</td>
          <td>${escapeHtml(r.from_date)}</td>
          <td>${escapeHtml(r.to_date)}</td>
          <td>${escapeHtml(r.total_days)}</td>
          <td>${escapeHtml(r.reason)}</td>
          <td><span class="leave-status ${leaveStatusClass(r.status)}">${escapeHtml(r.status)}</span></td>
          <td>${escapeHtml(r.manager_note)}</td>
          <td>${escapeHtml(r.partner_note)}</td>
        </tr>`).join("") : "<tr><td colspan='9'>No leave application found.</td></tr>";

      return `
        <div class="leave-form-card">
          <hr style="border:none; border-top:1px solid var(--border); margin:18px 0;">
          <h3>Apply for Leave</h3>
          <p class="leave-flow-note">Your application will first go to the Manager. After Manager recommendation, it will go to the Partner for final approval.</p>
          <div class="form-grid">
            <div><label>Leave Type</label><select id="leaveType"><option value="">Select Leave Type</option><option>Casual Leave</option><option>Sick Leave</option><option>Emergency Leave</option><option>Study Leave</option><option>Other</option></select></div>
            <div><label>Contact During Leave</label><input id="leaveContact" placeholder="Phone / contact (optional)"></div>
            <div><label>From Date</label><input type="date" id="leaveFromDate" onchange="updateLeaveDayPreview()"></div>
            <div><label>To Date</label><input type="date" id="leaveToDate" onchange="updateLeaveDayPreview()"></div>
            <div><label>Total Days</label><input id="leaveDayPreview" value="0" readonly></div>
            <div><label>Reason</label><input id="leaveReason" placeholder="Reason for leave"></div>
          </div>
          <div class="btn-row">
            <button onclick="submitLeaveApplication()" ${pending ? "disabled" : ""}>Submit Leave Application</button>
          </div>
          ${pending ? '<div class="notice">You already have a leave application under review. Submit a new one after the current application is decided.</div>' : ''}

          <h3>My Leave Applications</h3>
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th><th>Manager Note</th><th>Partner Note</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>`;
    }

    function updateLeaveDayPreview() {
      const from = document.getElementById("leaveFromDate");
      const to = document.getElementById("leaveToDate");
      const preview = document.getElementById("leaveDayPreview");
      if (preview) preview.value = calculateLeaveDays(from ? from.value : "", to ? to.value : "");
    }

    async function submitLeaveApplication() {
      if (!currentProfile || !["student", "manager"].includes(currentProfile.role) || !currentProfile.student_id) {
        showMessage("Only an active student can submit a leave application.", "error");
        return;
      }

      const leaveType = document.getElementById("leaveType").value;
      const fromDate = document.getElementById("leaveFromDate").value;
      const toDate = document.getElementById("leaveToDate").value;
      const reason = document.getElementById("leaveReason").value.trim();
      const contact = document.getElementById("leaveContact").value.trim();

      if (!leaveType || !fromDate || !toDate || !reason) {
        showMessage("Leave type, from date, to date and reason are required.", "error");
        return;
      }
      if (calculateLeaveDays(fromDate, toDate) < 1) {
        showMessage("Please provide a valid leave date range.", "error");
        return;
      }

      const result = await db.rpc("submit_leave_application", {
        p_leave_type: leaveType,
        p_from_date: fromDate,
        p_to_date: toDate,
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
    }

    function isCurrentUserManager() {
      if (!currentProfile) return false;
      if (currentProfile.role === "manager") return true;
      const row = students.find(s => s.student_id === currentProfile.student_id);
      return currentProfile.role === "student" && row && row.designation === "Manager" && row.status === "Active";
    }

    async function configureManagerLeaveAccess() {
      const btn = document.getElementById("managerLeaveTabBtn");
      if (!btn) return;
      if (isCurrentUserManager()) {
        btn.classList.remove("hidden");
        await loadManagerLeaveData();
      } else {
        btn.classList.add("hidden");
      }
    }

    async function loadManagerLeaveData() {
      if (!isCurrentUserManager() && !(currentProfile && currentProfile.role === "manager")) return;
      const result = await db.from("leave_applications").select("*").order("created_at", { ascending: false });
      leaveApplications = result.error ? [] : (result.data || []);
      renderManagerLeaveTable();
    }

    function renderManagerLeaveTable() {
      const tbody = document.getElementById("managerLeaveTable");
      const recentTbody = document.getElementById("managerRecentLeaveTable");

      if (tbody) {
        // Keep newly submitted applications visible for Manager action,
        // and keep Manager Recommended applications visible while they are waiting for Partner.
        const pendingRows = leaveApplications.filter(r => ["Submitted", "Manager Recommended"].includes(r.status));
        tbody.innerHTML = pendingRows.length ? pendingRows.map(r => {
          const canReview = !currentProfile.student_id || r.student_id !== currentProfile.student_id;
          let action = "";
          if (r.status === "Manager Recommended") {
            action = `<span class="leave-status manager-recommended">Sent to Partner</span>`;
          } else {
            action = canReview
              ? `<button class="success" onclick="managerReviewLeave('${escapeAttribute(r.id)}','recommend')">Recommend</button> <button class="danger" onclick="managerReviewLeave('${escapeAttribute(r.id)}','reject')">Reject</button>`
              : "Own application";
          }
          return `<tr><td>${escapeHtml(formatDate(r.created_at))}</td><td>${escapeHtml(r.student_id)}</td><td>${escapeHtml(r.applicant_name)}</td><td>${escapeHtml(r.branch)}</td><td>${escapeHtml(r.leave_type)}</td><td>${escapeHtml(r.from_date)}</td><td>${escapeHtml(r.to_date)}</td><td>${escapeHtml(r.total_days)}</td><td>${escapeHtml(r.reason)}</td><td><span class="leave-status ${leaveStatusClass(r.status)}">${escapeHtml(r.status)}</span></td><td>${action}</td></tr>`;
        }).join("") : "<tr><td colspan='11'>No leave application waiting for Manager action or Partner approval.</td></tr>";
      }

      if (recentTbody) {
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const recentRows = leaveApplications
          .filter(r => r.manager_confirmed_at)
          .filter(r => new Date(r.manager_confirmed_at).getTime() >= sevenDaysAgo)
          .sort((a, b) => new Date(b.manager_confirmed_at || 0) - new Date(a.manager_confirmed_at || 0));

        recentTbody.innerHTML = recentRows.length ? recentRows.map(r => {
          const managerAction = r.status === "Manager Rejected" ? "Manager Rejected" : "Manager Recommended";
          const actionClass = managerAction === "Manager Rejected" ? "manager-rejected" : "manager-recommended";
          return `<tr><td>${escapeHtml(formatDate(r.manager_confirmed_at))}</td><td>${escapeHtml(r.student_id)}</td><td>${escapeHtml(r.applicant_name)}</td><td>${escapeHtml(r.leave_type)}</td><td>${escapeHtml(r.from_date)}</td><td>${escapeHtml(r.to_date)}</td><td>${escapeHtml(r.total_days)}</td><td><span class="leave-status ${actionClass}">${escapeHtml(managerAction)}</span></td><td>${escapeHtml(r.manager_note || "")}</td><td><span class="leave-status ${leaveStatusClass(r.status)}">${escapeHtml(r.status)}</span></td></tr>`;
        }).join("") : "<tr><td colspan='10'>No Manager action in the last 7 days.</td></tr>";
      }
    }

    async function managerReviewLeave(leaveId, decision) {
      if (!isCurrentUserManager() && !(currentProfile && currentProfile.role === "manager")) {
        showMessage("Only the Manager can review leave applications.", "error");
        return;
      }
      const note = prompt(decision === "recommend" ? "Manager recommendation note (optional):" : "Reason for rejection (optional):", "") || "";
      const result = await db.rpc("manager_review_leave", {
        p_leave_id: leaveId,
        p_decision: decision,
        p_note: note || null
      });
      if (result.error) {
        showMessage("Manager review failed: " + result.error.message, "error");
        return;
      }
      await loadManagerLeaveData();
      await loadStudentDashboard();
      showMessage(decision === "recommend" ? "Leave recommended and sent to Partner." : "Leave application rejected by Manager.", "success");
    }

    async function loadPartnerData() {
      if (!currentProfile || currentProfile.role !== "partner") return;
      const profileResult = await db.from("partner_profiles").select("*").eq("user_id", currentUser.id).maybeSingle();
      partnerProfile = profileResult.error ? null : profileResult.data;
      const leaveResult = await db.from("leave_applications").select("*").order("created_at", { ascending: false });
      leaveApplications = leaveResult.error ? [] : (leaveResult.data || []);
      renderPartnerProfile();
      renderPartnerLeaveTable();
    }

    function renderPartnerProfile() {
      const box = document.getElementById("partnerProfileBox");
      if (!box) return;
      box.innerHTML = `
        <div class="partner-pro-shell">
          <div class="partner-pro-photo-wrap">
            <img class="partner-pro-photo" src="data:image/png;base64,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" alt="Md Shakhawat Hossain">
          </div>
          <div class="partner-pro-content">
            <div class="partner-pro-kicker"><span></span>PROFESSIONAL PROFILE</div>
            <h1>Md Shakhawat Hossain</h1>
            <div class="partner-pro-subtitle">Fellow Chartered Accountant · FCA, ICAB</div>

            <div class="partner-pro-tags">
              <span>FCA · ICAB</span>
              <span>Income Tax Practitioner</span>
              <span>Govt Approved VAT Consultant</span>
              <span>DAIBB · Banking Finance</span>
              <span>Tax · VAT · Audit Consultant</span>
              <span>Faculty Member · ICAB</span>
              <span>Dhaka, Bangladesh</span>
            </div>

            <div class="partner-pro-roles">
              <div class="partner-pro-role">
                <strong>Partner — M A Fazal &amp; Co.</strong>
                <span>Chartered Accountants · Since March 2026</span>
              </div>
              <div class="partner-pro-role">
                <strong>Financial Specialist — Grameen Bank</strong>
                <span>Transformation &amp; Financial Consultancy · Since Dec 2025</span>
              </div>
            </div>
          </div>
        </div>`;
    }

    function renderPartnerLeaveTable() {
      const tbody = document.getElementById("partnerLeaveTable");
      const recentTbody = document.getElementById("partnerRecentLeaveTable");

      if (tbody) {
        const pendingRows = leaveApplications.filter(r => r.status === "Manager Recommended");
        tbody.innerHTML = pendingRows.length ? pendingRows.map(r => {
          const action = `<button class="success" onclick="partnerReviewLeave('${escapeAttribute(r.id)}','approve')">Approve</button> <button class="danger" onclick="partnerReviewLeave('${escapeAttribute(r.id)}','reject')">Reject</button>`;
          return `<tr><td>${escapeHtml(formatDate(r.created_at))}</td><td>${escapeHtml(r.student_id)}</td><td>${escapeHtml(r.applicant_name)}</td><td>${escapeHtml(r.branch)}</td><td>${escapeHtml(r.leave_type)}</td><td>${escapeHtml(r.from_date)}</td><td>${escapeHtml(r.to_date)}</td><td>${escapeHtml(r.total_days)}</td><td>${escapeHtml(r.manager_note)}</td><td><span class="leave-status ${leaveStatusClass(r.status)}">${escapeHtml(r.status)}</span></td><td>${action}</td></tr>`;
        }).join("") : "<tr><td colspan='11'>No Manager-recommended leave application found.</td></tr>";
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

        recentTbody.innerHTML = recentRows.length ? recentRows.map(r => {
          return `<tr><td>${escapeHtml(formatDate(r.partner_decided_at))}</td><td>${escapeHtml(r.student_id)}</td><td>${escapeHtml(r.applicant_name)}</td><td>${escapeHtml(r.leave_type)}</td><td>${escapeHtml(r.from_date)}</td><td>${escapeHtml(r.to_date)}</td><td>${escapeHtml(r.total_days)}</td><td><span class="leave-status ${leaveStatusClass(r.status)}">${escapeHtml(r.status)}</span></td><td>${escapeHtml(r.partner_note || "")}</td></tr>`;
        }).join("") : "<tr><td colspan='9'>No Partner action in the last 7 days.</td></tr>";
      }
    }

    async function partnerReviewLeave(leaveId, decision) {
      if (!currentProfile || currentProfile.role !== "partner") {
        showMessage("Only Partner can approve or reject leave applications.", "error");
        return;
      }
      const note = prompt(decision === "approve" ? "Partner note (optional):" : "Reason for rejection (optional):", "") || "";
      const result = await db.rpc("partner_review_leave", {
        p_leave_id: leaveId,
        p_decision: decision,
        p_note: note || null
      });
      if (result.error) {
        showMessage("Partner decision failed: " + result.error.message, "error");
        return;
      }
      await loadPartnerData();
      showMessage(decision === "approve" ? "Leave approved successfully." : "Leave rejected by Partner.", "success");
    }

    function renderPartnerStudentList() {
      const tbody = document.getElementById("partnerStudentTable");
      if (!tbody) return;
      const searchEl = document.getElementById("partnerStudentSearch");
      const search = searchEl ? searchEl.value.toLowerCase() : "";
      const rows = students.filter(s =>
        s.status === "Active" && (
          safe(s.student_id).toLowerCase().includes(search) ||
          safe(s.full_name).toLowerCase().includes(search) ||
          safe(s.designation).toLowerCase().includes(search) ||
          safe(s.branch).toLowerCase().includes(search)
        )
      );
      tbody.innerHTML = rows.length ? rows.map(s => `<tr><td>${escapeHtml(s.student_id)}</td><td>${escapeHtml(s.full_name)}</td><td>${escapeHtml(s.designation)}</td><td>${escapeHtml(s.branch)}</td><td>${escapeHtml(s.ca_level)}</td><td><span class="active-status">${escapeHtml(s.status)}</span></td><td><button onclick="openPublicProfile('${escapeAttribute(s.student_id)}')">View Profile</button></td></tr>`).join("") : "<tr><td colspan='7'>No active profile found.</td></tr>";
    }

    async function loadStudentDashboard() {
      const sid = currentProfile.student_id;

      if (!sid) {
        document.getElementById("studentDashboard").innerHTML = "<div class='notice'>No student ID linked with this login account.</div>";
        return;
      }

      document.getElementById("studentDashboard").innerHTML = await buildStudentProfileDashboardHtml(sid);
    }

    async function updateMyCaStatus() {
      if (!currentProfile || currentProfile.role !== "student" || !currentProfile.student_id) {
        showMessage("Only logged-in students can request their own CA status update.", "error");
        return;
      }

      const caLevel = document.getElementById("studentEditCaLevel").value;
      const caResults = document.getElementById("studentEditCaResults").value;

      if (!caLevel || !caResults) {
        showMessage("Please select both CA Level and CA Result Summary.", "error");
        return;
      }

      const result = await db.rpc("submit_my_ca_status_request", {
        new_ca_level: caLevel,
        new_ca_results: caResults
      });

      if (result.error) {
        showMessage(result.error.message, "error");
        return;
      }

      showMessage("CA status update request submitted. Data Manager approval is required.", "success");
      await loadStudentDashboard();
    }

    async function openMasterStudentProfile(studentId) {
      if (!isMasterPower()) {
        showMessage("Only Master Account / Top Senior can view student login-style profile details.", "error");
        return;
      }

      const modal = document.getElementById("masterStudentProfileModal");
      const body = document.getElementById("masterStudentProfileBody");
      const title = document.getElementById("masterStudentProfileModalTitle");

      if (!modal || !body) return;

      const student = students.find(s => s.student_id === studentId);
      if (title) title.textContent = student ? `Profile Details - ${student.full_name}` : "Profile Details";

      body.innerHTML = "<div class='notice'>Loading student profile details...</div>";
      modal.classList.remove("hidden");
      modal.classList.add("show");
      document.body.classList.add("modal-open-body");
      document.body.style.overflow = "hidden";

      body.innerHTML = await buildStudentProfileDashboardHtml(studentId);
    }

    function closeMasterStudentProfileModal() {
      const modal = document.getElementById("masterStudentProfileModal");
      if (modal) {
        modal.classList.remove("show");
        modal.classList.add("hidden");
      }
      document.body.classList.remove("modal-open-body");
      document.body.style.overflow = "";
    }

    async function loadFundData() {
      await loadFunds();
      await loadOpeningBalances();
      await loadCashInHandOpeningBalances();
      const recResult = await db.from("receivables").select("*").order("created_at", { ascending: false });
      const payResult = await db.from("payments").select("*").order("created_at", { ascending: false });
      const expenseResult = await db.from("fund_payments").select("*").order("payment_date", { ascending: false });
      if (recResult.error) { showMessage(recResult.error.message, "error"); return; }
      if (payResult.error) { showMessage(payResult.error.message, "error"); return; }
      receivables = recResult.data || [];
      payments = payResult.data || [];
      fundPayments = expenseResult.error ? [] : (expenseResult.data || []);
      await loadFundLoanApplications();
      await loadFundLoanRepayments();
      document.getElementById("openingBalanceManager").classList.toggle("hidden", !isMasterPower());
      document.getElementById("cashInHandOpeningManager").classList.toggle("hidden", !isMasterPower());
      document.getElementById("fundNameManager").classList.toggle("hidden", !isMasterPower());
      fillAllFundSelects();
      renderFundManagementTable();
      renderStudentDropdowns();
      renderOpeningBalanceTable();
      renderCashInHandOpeningTable();
      renderFundCards();
      renderFundTables();
      renderFundLoanReviewTable();
      renderFundLoanSummary();
      renderLoanReturnOptions();
      renderMasterLoanApprovalTable();
    }

    async function loadFundLoanApplications() {
      fundLoanApplications = [];
      if (!currentProfile) return;
      const result = await db
        .from("fund_loan_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (!result.error) fundLoanApplications = result.data || [];
    }

    async function loadFundLoanRepayments() {
      fundLoanRepayments = [];
      if (!currentProfile) return;
      const result = await db
        .from("fund_loan_repayments")
        .select("*")
        .order("payment_date", { ascending: false });
      if (!result.error) fundLoanRepayments = result.data || [];
    }

    function loanReturnedAmount(loanId) {
      return fundLoanRepayments
        .filter(r => String(r.loan_id) === String(loanId))
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);
    }

    function loanOutstandingAmount(loan) {
      if (!loan || loan.status !== "Master Approved") return 0;
      const approved = Number(loan.approved_amount || loan.requested_amount || 0);
      return Math.max(0, approved - loanReturnedAmount(loan.id));
    }

    function renderFundLoanSummary() {
      const card = document.getElementById("fundLoanSummaryCard");
      const tbody = document.getElementById("fundLoanSummaryTable");
      if (!card || !tbody || !currentProfile) return;

      const canSee = isMasterPower()
        || currentProfile.role === "fund_manager"
        || hasAccessRole("fund_manager");
      card.classList.toggle("hidden", !canSee);
      if (!canSee) return;

      const approvedLoans = fundLoanApplications.filter(l => l.status === "Master Approved");
      const totalDisbursed = approvedLoans.reduce((sum, l) => sum + Number(l.approved_amount || l.requested_amount || 0), 0);
      const totalReturned = fundLoanRepayments.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const totalReceivable = Math.max(0, totalDisbursed - totalReturned);

      const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };

      setText("loanSummaryDisbursed", money(totalDisbursed));
      setText("loanSummaryReturned", money(totalReturned));
      setText("loanSummaryReceivable", money(totalReceivable));
      setText("loanSummaryPendingFund", String(fundLoanApplications.filter(l => l.status === "Submitted").length));
      setText("loanSummaryPendingMaster", String(fundLoanApplications.filter(l => l.status === "Fund Manager Checked").length));

      tbody.innerHTML = approvedLoans.length ? approvedLoans.map(l => {
        const approved = Number(l.approved_amount || l.requested_amount || 0);
        const returned = loanReturnedAmount(l.id);
        const outstanding = Math.max(0, approved - returned);
        const status = outstanding <= 0.005 ? "Repaid" : "Outstanding";
        return `<tr>
          <td>${escapeHtml(formatDate(l.master_approved_at || l.created_at))}</td>
          <td>${escapeHtml(l.student_id)}</td>
          <td>${escapeHtml(l.student_name)}</td>
          <td>${escapeHtml(l.fund_name)}</td>
          <td>${money(approved)}</td>
          <td>${money(returned)}</td>
          <td>${money(outstanding)}</td>
          <td><strong>${escapeHtml(status)}</strong></td>
          <td>${escapeHtml(l.purpose)}</td>
        </tr>`;
      }).join("") : "<tr><td colspan='9'>No approved loan found.</td></tr>";
    }

    function renderLoanReturnOptions() {
      const card = document.getElementById("loanReturnCard");
      const select = document.getElementById("loanReturnLoan");
      if (!card || !select || !currentProfile) return;

      const canReceive = currentProfile.role === "fund_manager"
        || (!isMasterPower() && hasAccessRole("fund_manager"));
      card.classList.toggle("hidden", !canReceive);
      if (!canReceive) return;

      const activeLoans = fundLoanApplications
        .filter(l => l.status === "Master Approved" && loanOutstandingAmount(l) > 0.005);

      select.innerHTML = activeLoans.length
        ? `<option value="">Select Loan Receivable</option>` + activeLoans.map(l => {
            const outstanding = loanOutstandingAmount(l);
            return `<option value="${escapeAttribute(l.id)}">${escapeHtml(l.student_id)} - ${escapeHtml(l.student_name)} | ${escapeHtml(l.fund_name)} | Receivable ${money(outstanding)}</option>`;
          }).join("")
        : `<option value="">No outstanding loan receivable</option>`;

      const dateEl = document.getElementById("loanReturnDate");
      if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
    }

    function syncLoanReturnAmount() {
      const loanId = document.getElementById("loanReturnLoan")?.value || "";
      const loan = fundLoanApplications.find(l => String(l.id) === String(loanId));
      const amountEl = document.getElementById("loanReturnAmount");
      if (!amountEl) return;
      amountEl.value = loan ? loanOutstandingAmount(loan).toFixed(2) : "";
    }

    async function receiveLoanReturn() {
      if (!currentProfile || !(currentProfile.role === "fund_manager" || (!isMasterPower() && hasAccessRole("fund_manager")))) {
        showMessage("Only the Fund Manager can receive loan returns.", "error");
        return;
      }

      const loanId = document.getElementById("loanReturnLoan")?.value || "";
      const loan = fundLoanApplications.find(l => String(l.id) === String(loanId));
      if (!loan || loan.status !== "Master Approved") {
        showMessage("Please select an outstanding approved loan.", "error");
        return;
      }

      const outstanding = loanOutstandingAmount(loan);
      const amount = Number(document.getElementById("loanReturnAmount")?.value || 0);
      const paymentDate = document.getElementById("loanReturnDate")?.value || "";
      const method = document.getElementById("loanReturnMethod")?.value || "Cash";
      const referenceNo = document.getElementById("loanReturnReference")?.value.trim() || "";
      const note = document.getElementById("loanReturnNote")?.value.trim() || "";

      if (!(amount > 0)) { showMessage("Please enter a valid loan return amount.", "error"); return; }
      if (!paymentDate) { showMessage("Please select the loan return date.", "error"); return; }
      if (amount - outstanding > 0.005) {
        showMessage("Loan return cannot be more than the outstanding loan receivable.", "error");
        return;
      }

      const result = await db.from("fund_loan_repayments").insert({
        loan_id: loan.id,
        fund_name: loan.fund_name,
        student_id: loan.student_id,
        student_name: loan.student_name,
        amount,
        payment_date: paymentDate,
        method,
        reference_no: referenceNo,
        note,
        received_by: currentUser.id
      });

      if (result.error) {
        showMessage("Loan return failed: " + result.error.message, "error");
        return;
      }

      document.getElementById("loanReturnAmount").value = "";
      document.getElementById("loanReturnReference").value = "";
      document.getElementById("loanReturnNote").value = "";
      await loadFundData();
      showMessage("Loan return received. Fund balance and loan receivable were updated.", "success");
    }

    function renderFundLoanReviewTable() {
      const tbody = document.getElementById("fundLoanReviewTable");
      const card = document.getElementById("fundLoanReviewCard");
      if (!tbody) return;

      const isFundManagerReviewer = currentProfile
        && !isMasterPower()
        && hasAccessRole("fund_manager");

      if (card) card.classList.toggle("hidden", !isFundManagerReviewer);
      if (!isFundManagerReviewer) return;

      const rows = fundLoanApplications.filter(l => l.status === "Submitted");
      tbody.innerHTML = rows.length ? rows.map(l => `
        <tr>
          <td>${escapeHtml(formatDate(l.created_at))}</td>
          <td>${escapeHtml(l.student_id)}</td>
          <td>${escapeHtml(l.student_name)}</td>
          <td>${escapeHtml(l.fund_name)}</td>
          <td>${money(l.requested_amount)}</td>
          <td>${escapeHtml(l.purpose)}</td>
          <td><strong>${escapeHtml(l.status)}</strong></td>
          <td>${escapeHtml(l.fund_manager_note)}</td>
          <td>
            <button class="success" onclick="fundManagerReviewLoan('${escapeAttribute(l.id)}','check')">Check</button>
            <button class="danger" onclick="fundManagerReviewLoan('${escapeAttribute(l.id)}','reject')">Reject</button>
          </td>
        </tr>`).join("") : "<tr><td colspan='9'>No loan application waiting for Fund Manager review.</td></tr>";
    }

    function renderMasterLoanApprovalTable() {
      const tbody = document.getElementById("masterLoanApprovalTable");
      if (!tbody || !isMasterPower()) return;

      const rows = fundLoanApplications.filter(l => l.status === "Fund Manager Checked");
      tbody.innerHTML = rows.length ? rows.map(l => `
        <tr>
          <td>${escapeHtml(formatDate(l.created_at))}</td>
          <td>${escapeHtml(l.student_id)}</td>
          <td>${escapeHtml(l.student_name)}</td>
          <td>${escapeHtml(l.fund_name)}</td>
          <td>${money(l.requested_amount)}</td>
          <td>${l.approved_amount == null ? "" : money(l.approved_amount)}</td>
          <td>${escapeHtml(l.purpose)}</td>
          <td>${escapeHtml(l.fund_manager_note)}</td>
          <td><strong>${escapeHtml(l.status)}</strong></td>
          <td>
            <button class="success" onclick="masterReviewLoan('${escapeAttribute(l.id)}','approve')">Approve</button>
            <button class="danger" onclick="masterReviewLoan('${escapeAttribute(l.id)}','reject')">Reject</button>
          </td>
        </tr>`).join("") : "<tr><td colspan='10'>No Fund Manager checked loan application waiting for approval.</td></tr>";
    }

    async function submitFundLoanApplication() {
      if (!currentProfile || currentProfile.role !== "student") {
        showMessage("Only a logged-in fund member can apply for a loan.", "error");
        return;
      }

      const student = students.find(s => s.student_id === currentProfile.student_id);
      if (!student || !isFundEligibleDesignation(student.designation)) {
        showMessage("Only Article Students and Managers who are fund members can apply for a loan.", "error");
        return;
      }

      const fundName = document.getElementById("studentLoanFund")?.value || "";
      const amount = Number(document.getElementById("studentLoanAmount")?.value || 0);
      const purpose = document.getElementById("studentLoanPurpose")?.value.trim() || "";

      if (!fundName) { showMessage("Please select a fund.", "error"); return; }
      if (!(amount > 0)) { showMessage("Please enter a valid loan amount.", "error"); return; }
      if (!purpose) { showMessage("Please enter the loan purpose.", "error"); return; }

      const pendingCheck = await db
        .from("fund_loan_applications")
        .select("id,status")
        .eq("student_id", currentProfile.student_id)
        .in("status", ["Submitted", "Fund Manager Checked"])
        .limit(1);

      if (!pendingCheck.error && (pendingCheck.data || []).length) {
        showMessage("You already have a loan application waiting for review/approval.", "error");
        return;
      }

      const result = await db.from("fund_loan_applications").insert({
        student_id: student.student_id,
        student_name: student.full_name,
        fund_name: fundName,
        requested_amount: amount,
        purpose,
        status: "Submitted",
        created_by: currentUser.id
      });

      if (result.error) {
        showMessage("Loan application failed: " + result.error.message, "error");
        return;
      }

      showMessage("Loan application submitted to the Fund Manager.", "success");
      await loadStudentDashboard();
    }

    async function fundManagerReviewLoan(loanId, action) {
      if (!currentProfile || isMasterPower() || !hasAccessRole("fund_manager")) {
        showMessage("Only the Fund Manager can check loan applications.", "error");
        return;
      }

      const loan = fundLoanApplications.find(l => String(l.id) === String(loanId));
      if (!loan || loan.status !== "Submitted") {
        showMessage("This loan application is no longer waiting for Fund Manager review.", "error");
        await loadFundData();
        return;
      }

      const isCheck = action === "check";
      const note = prompt(isCheck ? "Fund Manager note (optional)" : "Reason for rejection", "") || "";
      if (!isCheck && !note.trim()) {
        showMessage("Rejection reason is required.", "error");
        return;
      }

      const result = await db.from("fund_loan_applications").update({
        status: isCheck ? "Fund Manager Checked" : "Fund Manager Rejected",
        fund_manager_note: note.trim(),
        fund_manager_checked_by: currentUser.id,
        fund_manager_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq("id", loanId).eq("status", "Submitted");

      if (result.error) {
        showMessage("Loan review failed: " + result.error.message, "error");
        return;
      }

      await loadFundData();
      showMessage(isCheck ? "Loan checked and sent to Master for approval." : "Loan application rejected by Fund Manager.", "success");
    }

    async function getLiveFundAvailableBalance(fundName) {
      const [cashRes, receiptRes, expenseRes, loanRes, returnRes] = await Promise.all([
        db.from("fund_cash_in_hand_opening").select("opening_cash,status").eq("fund_name", fundName),
        db.from("payments").select("amount").eq("fund_name", fundName),
        db.from("fund_payments").select("amount,status").eq("fund_name", fundName),
        db.from("fund_loan_applications").select("approved_amount,requested_amount,status").eq("fund_name", fundName).eq("status", "Master Approved"),
        db.from("fund_loan_repayments").select("amount").eq("fund_name", fundName)
      ]);

      const failed = [cashRes, receiptRes, expenseRes, loanRes, returnRes].find(r => r.error);
      if (failed) throw new Error(failed.error.message);

      const cashOpening = (cashRes.data || [])
        .filter(r => r.status === "Active")
        .reduce((sum, r) => sum + Number(r.opening_cash || 0), 0);
      const receipts = (receiptRes.data || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const expenses = (expenseRes.data || [])
        .filter(r => r.status === "Active")
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const loans = (loanRes.data || []).reduce((sum, r) => sum + Number(r.approved_amount || r.requested_amount || 0), 0);
      const returns = (returnRes.data || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);

      return cashOpening + receipts + returns - expenses - loans;
    }

    async function masterReviewLoan(loanId, action) {
      if (!isMasterPower()) {
        showMessage("Only Master Account / Top Senior can approve or reject a checked loan.", "error");
        return;
      }

      const loan = fundLoanApplications.find(l => String(l.id) === String(loanId));
      if (!loan || loan.status !== "Fund Manager Checked") {
        showMessage("This loan application is no longer waiting for Master approval.", "error");
        await loadFundData();
        return;
      }

      if (action === "approve") {
        const amountInput = prompt("Approved loan amount", String(Number(loan.requested_amount || 0)));
        if (amountInput === null) return;
        const approvedAmount = Number(amountInput);
        if (!(approvedAmount > 0)) {
          showMessage("Approved amount must be greater than zero.", "error");
          return;
        }
        const note = prompt("Master approval note (optional)", "") || "";

        let availableBalance = 0;
        try {
          availableBalance = await getLiveFundAvailableBalance(loan.fund_name);
        } catch (err) {
          showMessage("Could not verify fund balance: " + err.message, "error");
          return;
        }

        if (approvedAmount - availableBalance > 0.005) {
          showMessage("Loan cannot be approved. Available fund balance is " + money(availableBalance) + ".", "error");
          return;
        }

        const result = await db.from("fund_loan_applications").update({
          status: "Master Approved",
          approved_amount: approvedAmount,
          master_note: note.trim(),
          master_approved_by: currentUser.id,
          master_approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", loanId).eq("status", "Fund Manager Checked");

        if (result.error) {
          showMessage("Loan approval failed: " + result.error.message, "error");
          return;
        }
        await loadFundData();
        showMessage("Loan approved and treated as disbursed. Fund balance is reduced and the amount is now a fund loan receivable / member loan payable.", "success");
        return;
      }

      const note = prompt("Reason for rejection", "") || "";
      if (!note.trim()) {
        showMessage("Rejection reason is required.", "error");
        return;
      }

      const result = await db.from("fund_loan_applications").update({
        status: "Master Rejected",
        master_note: note.trim(),
        master_approved_by: currentUser.id,
        master_approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq("id", loanId).eq("status", "Fund Manager Checked");

      if (result.error) {
        showMessage("Loan rejection failed: " + result.error.message, "error");
        return;
      }

      await loadFundData();
      showMessage("Loan application rejected by Master.", "success");
    }

    function renderStudentDropdowns() {
      const active = students.filter(s => s.status === "Active");
      const fundEligibleStudents = active.filter(s => isFundEligibleDesignation(s.designation));
      const recSelect = document.getElementById("receivableStudent");
      const paySelect = document.getElementById("paymentStudent");
      const recLinkSelect = document.getElementById("paymentReceivable");
      const openingSelect = document.getElementById("openingStudent");
      const cashHolderSelect = document.getElementById("cashOpeningHolder");
      recSelect.innerHTML = `<option value="ALL">All Active Fund Members</option>`;
      paySelect.innerHTML = "";
      openingSelect.innerHTML = "";
      if (cashHolderSelect) cashHolderSelect.innerHTML = "";
      recLinkSelect.innerHTML = `<option value="">No linked receivable</option>`;
      fundEligibleStudents.forEach(s => {
        const responsibility = s.fund_responsibility && s.fund_responsibility !== "Student" ? ` | ${s.fund_responsibility}` : "";
        const text = `${s.student_id} - ${s.full_name}${responsibility}`;
        recSelect.innerHTML += `<option value="${escapeAttribute(s.student_id)}">${escapeHtml(text)}</option>`;
        paySelect.innerHTML += `<option value="${escapeAttribute(s.student_id)}">${escapeHtml(text)}</option>`;
        openingSelect.innerHTML += `<option value="${escapeAttribute(s.student_id)}">${escapeHtml(text)}</option>`;
      });

      const fundManagers = fundEligibleStudents.filter(function (s) {
        return s.fund_responsibility === "Fund Manager" || s.fund_responsibility === "Assistant Fund Manager";
      });

      if (cashHolderSelect) {
        if (fundManagers.length === 0) {
          cashHolderSelect.innerHTML = `<option value="">No Fund Manager found. First select Fund Responsibility in Student Data.</option>`;
        } else {
          fundManagers.forEach(function (s) {
            const text = `${s.student_id} - ${s.full_name} | ${s.fund_responsibility}`;
            cashHolderSelect.innerHTML += `<option value="${escapeAttribute(s.student_id)}">${escapeHtml(text)}</option>`;
          });
        }
      }
      renderPaymentReceivableOptions();
    }

    function renderPaymentReceivableOptions() {
      const recLinkSelect = document.getElementById("paymentReceivable");
      if (!recLinkSelect) return;
      const selectedStudentId = document.getElementById("paymentStudent")?.value || "";
      const selectedFundName = document.getElementById("paymentFund")?.value || "";
      recLinkSelect.innerHTML = `<option value="">No linked receivable</option>`;

      if (!selectedStudentId) return;

      receivables
        .filter(r => r.status !== "Paid")
        .filter(r => String(r.student_id) === String(selectedStudentId))
        .filter(r => !selectedFundName || String(r.fund_name) === String(selectedFundName))
        .forEach(r => {
          recLinkSelect.innerHTML += `<option value="${escapeAttribute(r.id)}">${escapeHtml(r.fund_name)} | ${escapeHtml(r.student_id)} - ${escapeHtml(r.description)} - ${money(r.amount)}</option>`;
        });
    }

    function syncPaymentFromLinkedReceivable() {
      const linkedReceivableId = document.getElementById("paymentReceivable")?.value || "";
      if (!linkedReceivableId) return;
      const rec = receivables.find(r => String(r.id) === String(linkedReceivableId));
      if (!rec) return;
      const amountInput = document.getElementById("paymentAmount");
      if (amountInput) amountInput.value = Number(rec.amount || 0);
      const fundSelect = document.getElementById("paymentFund");
      if (fundSelect) fundSelect.value = rec.fund_name || fundSelect.value;
      const studentSelect = document.getElementById("paymentStudent");
      if (studentSelect) studentSelect.value = rec.student_id || studentSelect.value;
    }

    function renderOpeningBalanceTable() {
      const tbody = document.getElementById("openingBalanceTable");
      if (openingBalances.length === 0) { tbody.innerHTML = "<tr><td colspan='6'>No opening balance found.</td></tr>"; return; }
      tbody.innerHTML = openingBalances.map(o => {
        const action = isMasterPower() ? `<button class="warning" onclick="editOpeningBalance('${escapeAttribute(o.student_id)}','${escapeAttribute(o.fund_name)}')">Edit</button>` : "View only";
        return `<tr><td>${escapeHtml(o.fund_name)}</td><td>${escapeHtml(o.student_id)} - ${escapeHtml(o.student_name)}</td><td>${money(o.opening_balance)}</td><td>${escapeHtml(o.remarks)}</td><td>${escapeHtml(o.status)}</td><td>${action}</td></tr>`;
      }).join("");
    }

    function editOpeningBalance(studentId, fundName) {
      const row = openingBalances.find(o => o.student_id === studentId && o.fund_name === fundName);
      if (!row) return;
      document.getElementById("openingFund").value = row.fund_name;
      document.getElementById("openingStudent").value = row.student_id;
      document.getElementById("openingAmount").value = row.opening_balance || 0;
      document.getElementById("openingRemarks").value = row.remarks || "";
      document.getElementById("openingStatus").value = row.status || "Active";
      showMessage("Opening balance loaded for editing.", "success");
    }

    async function saveOpeningBalance() {
      if (!isMasterPower()) { showMessage("Only Master Account / Top Senior can save opening balance.", "error"); return; }
      const fundName = document.getElementById("openingFund").value;
      const studentId = document.getElementById("openingStudent").value;
      const amount = Number(document.getElementById("openingAmount").value || 0);
      const remarks = document.getElementById("openingRemarks").value.trim();
      const status = document.getElementById("openingStatus").value;
      const student = students.find(s => s.student_id === studentId);
      if (!student) { showMessage("Please select student.", "error"); return; }
      const row = { student_id: student.student_id, student_name: student.full_name, fund_name: fundName, opening_balance: amount, remarks, status, updated_by: currentUser.id, updated_at: new Date().toISOString() };
      const result = await db.from("student_opening_balances").upsert(row, { onConflict: "student_id,fund_name" });
      if (result.error) { showMessage(result.error.message, "error"); return; }
      clearOpeningBalanceForm();
      await loadFundData();
      showMessage("Opening balance saved successfully.", "success");
    }

    function clearOpeningBalanceForm() {
      document.getElementById("openingAmount").value = "";
      document.getElementById("openingRemarks").value = "";
      document.getElementById("openingStatus").value = "Active";
    }

    function renderCashInHandOpeningTable() {
      const tbody = document.getElementById("cashInHandOpeningTable");
      if (!tbody) return;

      if (cashInHandOpeningBalances.length === 0) {
        tbody.innerHTML = "<tr><td colspan='7'>No cash in hand opening balance found.</td></tr>";
        return;
      }

      tbody.innerHTML = cashInHandOpeningBalances.map(function (o) {
        const action = isMasterPower()
          ? `<button class="warning" onclick="editCashInHandOpening('${escapeAttribute(o.cash_holder_student_id)}','${escapeAttribute(o.fund_name)}')">Edit</button>`
          : "View only";

        return `
          <tr>
            <td>${escapeHtml(o.fund_name)}</td>
            <td>${escapeHtml(o.cash_holder_student_id)} - ${escapeHtml(o.cash_holder_name)}</td>
            <td>${escapeHtml(o.opening_date)}</td>
            <td>${money(o.opening_cash)}</td>
            <td>${escapeHtml(o.remarks)}</td>
            <td>${escapeHtml(o.status)}</td>
            <td>${action}</td>
          </tr>
        `;
      }).join("");
    }

    function editCashInHandOpening(holderStudentId, fundName) {
      const row = cashInHandOpeningBalances.find(function (o) {
        return o.cash_holder_student_id === holderStudentId && o.fund_name === fundName;
      });

      if (!row) return;

      document.getElementById("cashOpeningFund").value = row.fund_name;
      document.getElementById("cashOpeningHolder").value = row.cash_holder_student_id;
      document.getElementById("cashOpeningAmount").value = row.opening_cash || 0;
      document.getElementById("cashOpeningDate").value = row.opening_date || "";
      document.getElementById("cashOpeningRemarks").value = row.remarks || "";
      document.getElementById("cashOpeningStatus").value = row.status || "Active";

      showMessage("Cash in hand opening balance loaded for editing.", "success");
    }

    async function saveCashInHandOpening() {
      if (!isMasterPower()) {
        showMessage("Only Master Account / Top Senior can save cash in hand opening balance.", "error");
        return;
      }

      const fundName = document.getElementById("cashOpeningFund").value;
      const holderStudentId = document.getElementById("cashOpeningHolder").value;
      const amount = Number(document.getElementById("cashOpeningAmount").value || 0);
      const openingDate = document.getElementById("cashOpeningDate").value || new Date().toISOString().slice(0, 10);
      const remarks = document.getElementById("cashOpeningRemarks").value.trim();
      const status = document.getElementById("cashOpeningStatus").value;

      const holder = students.find(function (s) { return s.student_id === holderStudentId; });

      if (!fundName) {
        showMessage("Please select fund name.", "error");
        return;
      }

      if (!holder) {
        showMessage("Please select Fund Manager / Cash Holder.", "error");
        return;
      }

      const row = {
        fund_name: fundName,
        cash_holder_student_id: holder.student_id,
        cash_holder_name: holder.full_name,
        opening_cash: amount,
        opening_date: openingDate,
        remarks: remarks,
        status: status,
        updated_by: currentUser.id,
        updated_at: new Date().toISOString()
      };

      const result = await db
        .from("fund_cash_in_hand_opening")
        .upsert(row, { onConflict: "fund_name,cash_holder_student_id" });

      if (result.error) {
        showMessage(result.error.message, "error");
        return;
      }

      clearCashInHandOpeningForm();
      await loadFundData();
      showMessage("Cash in hand opening balance saved successfully.", "success");
    }

    function clearCashInHandOpeningForm() {
      document.getElementById("cashOpeningAmount").value = "";
      document.getElementById("cashOpeningRemarks").value = "";
      document.getElementById("cashOpeningStatus").value = "Active";
      const dateInput = document.getElementById("cashOpeningDate");
      if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
    }

    function renderFundCards() {
      const totalOpening = openingBalances.filter(o => o.status === "Active").reduce((sum, o) => sum + Number(o.opening_balance || 0), 0);
      const totalCashInHandOpening = cashInHandOpeningBalances.filter(o => o.status === "Active").reduce((sum, o) => sum + Number(o.opening_cash || 0), 0);
      const unpaidReceivable = receivables.filter(r => r.status !== "Paid").reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const totalReceived = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const totalExpense = fundPayments.filter(e => e.status === "Active").reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const totalLoanDisbursed = fundLoanApplications
        .filter(l => l.status === "Master Approved")
        .reduce((sum, l) => sum + Number(l.approved_amount || l.requested_amount || 0), 0);
      const totalLoanReturned = fundLoanRepayments.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const totalLoanReceivable = Math.max(0, totalLoanDisbursed - totalLoanReturned);
      const fundRemaining = totalCashInHandOpening + totalReceived + totalLoanReturned - totalExpense - totalLoanDisbursed;
      document.getElementById("totalOpeningBalance").textContent = money(totalOpening);
      const cashOpeningEl = document.getElementById("totalCashInHandOpening");
      if (cashOpeningEl) cashOpeningEl.textContent = money(totalCashInHandOpening);
      document.getElementById("totalDueBalance").textContent = money(totalOpening + unpaidReceivable);
      document.getElementById("totalReceivedBalance").textContent = money(totalReceived);
      document.getElementById("totalPaymentBalance").textContent = money(totalExpense);
      const loanDisbursedEl = document.getElementById("totalLoanDisbursed");
      if (loanDisbursedEl) loanDisbursedEl.textContent = money(totalLoanDisbursed);
      const loanReturnedEl = document.getElementById("totalLoanReturned");
      if (loanReturnedEl) loanReturnedEl.textContent = money(totalLoanReturned);
      const loanReceivableEl = document.getElementById("totalLoanReceivable");
      if (loanReceivableEl) loanReceivableEl.textContent = money(totalLoanReceivable);
      const remainingEl = document.getElementById("fundRemainingBalance");
      if (remainingEl) remainingEl.textContent = money(fundRemaining);
    }

    function renderFundTables() {
      const recSearch = document.getElementById("receivableSearch").value.toLowerCase();
      const paySearch = document.getElementById("paymentSearch").value.toLowerCase();
      const expenseSearch = document.getElementById("expenseSearch").value.toLowerCase();
      const recRows = receivables.filter(r => safe(r.fund_name).toLowerCase().includes(recSearch) || safe(r.student_id).toLowerCase().includes(recSearch) || safe(r.student_name).toLowerCase().includes(recSearch) || safe(r.description).toLowerCase().includes(recSearch) || safe(r.status).toLowerCase().includes(recSearch));
      document.getElementById("receivableTable").innerHTML = recRows.length ? recRows.map(r => `<tr><td>${escapeHtml(r.fund_name)}</td><td>${escapeHtml(r.student_id)} - ${escapeHtml(r.student_name)}</td><td>${escapeHtml(r.description)}</td><td>${money(r.amount)}</td><td>${escapeHtml(r.due_date)}</td><td><span class="${r.status === "Paid" ? "paid" : "unpaid"}">${escapeHtml(r.status)}</span></td><td>${escapeHtml(r.paid_at)}</td></tr>`).join("") : "<tr><td colspan='7'>No receivable found.</td></tr>";
      const payRows = payments.filter(p => safe(p.fund_name).toLowerCase().includes(paySearch) || safe(p.student_id).toLowerCase().includes(paySearch) || safe(p.student_name).toLowerCase().includes(paySearch) || safe(p.description).toLowerCase().includes(paySearch) || safe(p.method).toLowerCase().includes(paySearch));
      document.getElementById("paymentTable").innerHTML = payRows.length ? payRows.map(p => `<tr><td>${escapeHtml(p.fund_name)}</td><td>${escapeHtml(p.student_id)} - ${escapeHtml(p.student_name)}</td><td>${escapeHtml(p.description)}</td><td>${money(p.amount)}</td><td>${escapeHtml(p.payment_date)}</td><td>${escapeHtml(p.method)}</td><td>${escapeHtml(p.reference_no)}</td><td>${escapeHtml(p.note)}</td></tr>`).join("") : "<tr><td colspan='8'>No received fund found.</td></tr>";
      const expRows = fundPayments.filter(e => safe(e.fund_name).toLowerCase().includes(expenseSearch) || safe(e.payee_name).toLowerCase().includes(expenseSearch) || safe(e.description).toLowerCase().includes(expenseSearch) || safe(e.method).toLowerCase().includes(expenseSearch));
      document.getElementById("expenseTable").innerHTML = expRows.length ? expRows.map(e => `<tr><td>${escapeHtml(e.fund_name)}</td><td>${escapeHtml(e.payment_date)}</td><td>${escapeHtml(e.payee_name)}</td><td>${escapeHtml(e.description)}</td><td>${money(e.amount)}</td><td>${escapeHtml(e.method)}</td><td>${escapeHtml(e.reference_no)}</td><td>${escapeHtml(e.note)}</td></tr>`).join("") : "<tr><td colspan='8'>No fund payment found.</td></tr>";
    }

    async function addReceivable() {
      const fundName = document.getElementById("receivableFund").value;
      const sid = document.getElementById("receivableStudent").value;
      const amount = Number(document.getElementById("receivableAmount").value || 0);
      const description = document.getElementById("receivableDescription").value.trim();
      const dueDate = document.getElementById("receivableDueDate").value;
      if (!sid || amount <= 0 || !description) { showMessage("Fund, student, amount and description are required.", "error"); return; }
      let rows = [];
      if (sid === "ALL") {
        rows = students.filter(s => s.status === "Active" && isFundEligibleDesignation(s.designation)).map(s => ({ fund_name: fundName, student_id: s.student_id, student_name: s.full_name, description, amount, due_date: dueDate, status: "Unpaid" }));
      } else {
        const student = students.find(s => s.student_id === sid);
        rows = [{ fund_name: fundName, student_id: student.student_id, student_name: student.full_name, description, amount, due_date: dueDate, status: "Unpaid" }];
      }
      const result = await db.from("receivables").insert(rows);
      if (result.error) { showMessage(result.error.message, "error"); return; }
      document.getElementById("receivableAmount").value = "";
      document.getElementById("receivableDescription").value = "";
      await loadFundData();
      showMessage("Receivable added successfully.", "success");
    }

    async function addPayment() {
      const fundName = document.getElementById("paymentFund").value;
      const sid = document.getElementById("paymentStudent").value;
      const linkedReceivableId = document.getElementById("paymentReceivable").value;
      let amount = Number(document.getElementById("paymentAmount").value || 0);
      const paymentDate = document.getElementById("paymentDate").value;
      const method = document.getElementById("paymentMethod").value;
      const referenceNo = document.getElementById("paymentReference").value.trim();
      const note = document.getElementById("paymentNote").value.trim();
      let description = "Direct Payment";
      const student = students.find(s => s.student_id === sid);
      if (!student) { showMessage("Please select a student.", "error"); return; }
      if (linkedReceivableId) {
        const rec = receivables.find(r => String(r.id) === String(linkedReceivableId));
        if (rec) { description = rec.description; if (amount <= 0) amount = Number(rec.amount || 0); }
      }
      if (amount <= 0) { showMessage("Payment amount is required.", "error"); return; }
      const payResult = await db.from("payments").insert([{ fund_name: fundName, student_id: student.student_id, student_name: student.full_name, receivable_id: linkedReceivableId || null, description, amount, payment_date: paymentDate, method, reference_no: referenceNo, note }]);
      if (payResult.error) { showMessage(payResult.error.message, "error"); return; }
      if (linkedReceivableId) {
        const updateResult = await db.from("receivables").update({ status: "Paid", paid_at: paymentDate }).eq("id", linkedReceivableId);
        if (updateResult.error) { showMessage(updateResult.error.message, "error"); return; }
      }
      document.getElementById("paymentAmount").value = "";
      document.getElementById("paymentReference").value = "";
      document.getElementById("paymentNote").value = "";
      await loadFundData();
      showMessage("Fund received successfully.", "success");
    }

    async function addFundPayment() {
      const row = {
        fund_name: document.getElementById("expenseFund").value,
        payment_date: document.getElementById("expenseDate").value,
        payee_name: document.getElementById("expensePayee").value.trim(),
        description: document.getElementById("expenseDescription").value.trim(),
        amount: Number(document.getElementById("expenseAmount").value || 0),
        method: document.getElementById("expenseMethod").value,
        reference_no: document.getElementById("expenseReference").value.trim(),
        note: document.getElementById("expenseNote").value.trim(),
        status: "Active"
      };
      if (!row.payee_name || !row.description || row.amount <= 0) { showMessage("Payee, description and amount are required.", "error"); return; }
      const result = await db.from("fund_payments").insert([row]);
      if (result.error) { showMessage(result.error.message, "error"); return; }
      ["expensePayee", "expenseDescription", "expenseAmount", "expenseReference", "expenseNote"].forEach(id => document.getElementById(id).value = "");
      await loadFundData();
      showMessage("Fund payment added successfully.", "success");
    }

    function printServerOrganogram() {
      const groups = buildServerOrganogramGroups();
      if (groups.length === 0) { showMessage("No active profile found for branch wise list.", "error"); return; }
      let sl = 1;
      const rows = groups.map(group => `
        <tr><th colspan="9" style="text-align:left;background:#f2f2f2;">${escapeHtml(group.title)}</th></tr>
        ${group.rows.map(s => `
          <tr>
            <td>${sl++}</td>
            <td>${escapeHtml(s.student_id)}</td>
            <td>${escapeHtml(s.full_name)}</td>
            <td>${escapeHtml(s.designation)}</td>
            <td>${escapeHtml(s.joining_date || "")}</td>
            <td>${escapeHtml(s.branch || "")}</td>
            <td>${escapeHtml(s.ca_level || "")}</td>
            <td>${escapeHtml(s.ca_results || "")}</td>
            <td>${escapeHtml(s.status || "")}</td>
          </tr>`).join("")}
      `).join("");
      const html = printHeader("Branch Wise List") + `
        <table>
          <colgroup>
            <col style="width:5%;">
            <col style="width:10%;">
            <col style="width:22%;">
            <col style="width:13%;">
            <col style="width:12%;">
            <col style="width:14%;">
            <col style="width:8%;">
            <col style="width:10%;">
            <col style="width:6%;">
          </colgroup>
          <thead><tr><th>SL</th><th>ID</th><th>Name</th><th>Designation</th><th>Joining Date</th><th>Branch</th><th>CA Level</th><th>CA Result</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
        `;
      printHtml(html);
    }

    function printDailyVoucher() {
      const date = document.getElementById("voucherDate").value;
      const fundName = document.getElementById("voucherFund").value;
      const type = document.getElementById("voucherType").value;
      const receivedRows = (type === "Payment") ? [] : payments.filter(p => p.payment_date === date && p.fund_name === fundName);
      const paymentRows = (type === "Received") ? [] : fundPayments.filter(e => e.payment_date === date && e.fund_name === fundName && e.status === "Active");
      const loanReturnRows = (type === "Payment") ? [] : fundLoanRepayments.filter(r => r.payment_date === date && r.fund_name === fundName);
      const loanDisbursementRows = (type === "Received") ? [] : fundLoanApplications.filter(l => l.status === "Master Approved" && l.fund_name === fundName && safe(l.master_approved_at).slice(0, 10) === date);
      if (receivedRows.length === 0 && paymentRows.length === 0 && loanReturnRows.length === 0 && loanDisbursementRows.length === 0) { showMessage("No transaction found for selected voucher.", "error"); return; }
      const totalReceived = receivedRows.reduce((sum, p) => sum + Number(p.amount || 0), 0)
        + loanReturnRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const totalPayment = paymentRows.reduce((sum, e) => sum + Number(e.amount || 0), 0)
        + loanDisbursementRows.reduce((sum, l) => sum + Number(l.approved_amount || l.requested_amount || 0), 0);
      const voucherNo = "SFV-" + compactDate(date) + "-" + shortFund(fundName) + "-" + type.substring(0, 1).toUpperCase();
      let serial = 1;
      const receiptHtml = receivedRows.map(p => `<tr><td>${serial++}</td><td>Received</td><td>${escapeHtml(p.student_id)} - ${escapeHtml(p.student_name)}</td><td>${escapeHtml(p.description)}</td><td>${escapeHtml(p.method)}</td><td>${escapeHtml(p.reference_no)}</td><td class="amount-cell">${money(p.amount)}</td><td class="amount-cell">-</td></tr>`).join("");
      const loanReturnHtml = loanReturnRows.map(r => `<tr><td>${serial++}</td><td>Loan Return</td><td>${escapeHtml(r.student_id)} - ${escapeHtml(r.student_name)}</td><td>Return against Loan Receivable</td><td>${escapeHtml(r.method)}</td><td>${escapeHtml(r.reference_no)}</td><td class="amount-cell">${money(r.amount)}</td><td class="amount-cell">-</td></tr>`).join("");
      const paymentHtml = paymentRows.map(e => `<tr><td>${serial++}</td><td>Payment</td><td>${escapeHtml(e.payee_name)}</td><td>${escapeHtml(e.description)}</td><td>${escapeHtml(e.method)}</td><td>${escapeHtml(e.reference_no)}</td><td class="amount-cell">-</td><td class="amount-cell">${money(e.amount)}</td></tr>`).join("");
      const loanDisbursementHtml = loanDisbursementRows.map(l => `<tr><td>${serial++}</td><td>Loan Disbursement</td><td>${escapeHtml(l.student_id)} - ${escapeHtml(l.student_name)}</td><td>${escapeHtml(l.purpose)}</td><td>Loan</td><td></td><td class="amount-cell">-</td><td class="amount-cell">${money(l.approved_amount || l.requested_amount)}</td></tr>`).join("");
      const html = printHeader("Fund Voucher") + `
        <div class="print-meta">
          <div><strong>Voucher No:</strong> ${escapeHtml(voucherNo)}</div><div><strong>Date:</strong> ${escapeHtml(date)}</div>
          <div><strong>Fund Name:</strong> ${escapeHtml(fundName)}</div><div><strong>Voucher Type:</strong> ${escapeHtml(type)}</div>
        </div>
        <table>
          <colgroup>
            <col style="width:5%;">
            <col style="width:9%;">
            <col style="width:21%;">
            <col style="width:20%;">
            <col style="width:9%;">
            <col style="width:16%;">
            <col style="width:10%;">
            <col style="width:10%;">
          </colgroup>
          <thead><tr><th>SL</th><th>Type</th><th>Name</th><th>Description</th><th>Method</th><th>Reference</th><th class="amount-cell">Received</th><th class="amount-cell">Payment</th></tr></thead>
          <tbody>${receiptHtml}${loanReturnHtml}${paymentHtml}${loanDisbursementHtml}</tbody>
          <tfoot><tr><th colspan="6" class="amount-cell">Total</th><th class="amount-cell">${money(totalReceived)}</th><th class="amount-cell">${money(totalPayment)}</th></tr></tfoot>
        </table>
        ${signatureBlock()}
        `;
      printHtml(html);
    }

    function printMonthlySheet() {
      const monthValue = document.getElementById("monthlySheetMonth").value;
      const fundName = document.getElementById("monthlySheetFund").value;
      if (!monthValue) { showMessage("Please select month.", "error"); return; }
      const start = monthValue + "-01";
      const end = monthEnd(monthValue);
      let sl = 1;
      const rows = sortPublicProfileRows(students.filter(s => s.status === "Active" && isFundEligibleDesignation(s.designation))).map(s => {
        const originalOpening = getOpeningBalance(s.student_id, fundName);
        const previousReceivable = receivables
          .filter(r => r.student_id === s.student_id && r.fund_name === fundName && safe(r.due_date) && safe(r.due_date) < start)
          .reduce((sum, r) => sum + Number(r.amount || 0), 0);
        const previousPaid = payments
          .filter(p => p.student_id === s.student_id && p.fund_name === fundName && safe(p.payment_date) && safe(p.payment_date) < start)
          .reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const opening = originalOpening + previousReceivable - previousPaid;
        const monthlyReceivable = receivables
          .filter(r => r.student_id === s.student_id && r.fund_name === fundName && r.due_date >= start && r.due_date <= end)
          .reduce((sum, r) => sum + Number(r.amount || 0), 0);
        const monthlyPaid = payments
          .filter(p => p.student_id === s.student_id && p.fund_name === fundName && p.payment_date >= start && p.payment_date <= end)
          .reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const due = opening + monthlyReceivable - monthlyPaid;
        return `<tr><td>${sl++}</td><td>${escapeHtml(s.student_id)}</td><td>${escapeHtml(s.full_name)}</td><td>${escapeHtml(s.designation)}</td><td class="amount-cell">${money(opening)}</td><td class="amount-cell">${money(monthlyReceivable)}</td><td class="amount-cell">${money(monthlyPaid)}</td><td class="amount-cell">${money(due)}</td><td style="height:30px;"></td></tr>`;
      }).join("");
      const html = printHeader("Monthly Fund Payment Sheet") + `
        <div class="print-meta">
          <div><strong>Month:</strong> ${escapeHtml(monthValue)}</div><div><strong>Fund Name:</strong> ${escapeHtml(fundName)}</div>
        </div>
        <table>
          <colgroup>
            <col style="width:5%;">
            <col style="width:10%;">
            <col style="width:22%;">
            <col style="width:13%;">
            <col style="width:10%;">
            <col style="width:10%;">
            <col style="width:10%;">
            <col style="width:10%;">
            <col style="width:10%;">
          </colgroup>
          <thead><tr><th>SL</th><th>ID</th><th>Name</th><th>Designation</th><th class="amount-cell">Opening</th><th class="amount-cell">Monthly Due</th><th class="amount-cell">Paid</th><th class="amount-cell">Balance</th><th>Signature</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${signatureBlock()}
        `;
      printHtml(html);
    }

    function printHeader(title) {
      return `<div class="print-page">
        <div style="text-align:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px;">
          <h2 style="margin:0;font-size:20px;line-height:1.2;">M A Fazal & Co., Chartered Accountants</h2>
          <h3 style="margin:5px 0 0;font-size:16px;line-height:1.2;">${escapeHtml(title)}</h3>
        </div>`;
    }

    function signatureBlock() {
      return `<div class="print-signature">
        <div style="border-top:1px solid #111;padding-top:6px;">Prepared By</div>
        <div style="border-top:1px solid #111;padding-top:6px;">Checked By</div>
        <div style="border-top:1px solid #111;padding-top:6px;">Approved By</div>
      </div></div>`;
    }

    function printHtml(html) {
      const printArea = document.getElementById("printArea");
      printArea.innerHTML = html;
      printArea.classList.remove("hidden");

      const cleanPrintArea = function () {
        printArea.classList.add("hidden");
      };

      window.onafterprint = cleanPrintArea;

      setTimeout(function () {
        window.print();
        setTimeout(cleanPrintArea, 800);
      }, 200);
    }

    function toggleStudentAccountRequestPanel() {
      const modal = document.getElementById("studentAccountRequestModal");
      if (!modal) return;
      if (modal.classList.contains("show")) {
        closeStudentAccountRequestModal();
      } else {
        openStudentAccountRequestModal();
      }
    }

    function clearStudentAccountRequestForm() {
      ["reqFullName", "reqPersonalEmail", "reqPassword", "reqPhotoUrl", "reqDesignation", "reqRegistrationNo", "reqJoiningDate", "reqCcCompleteDate", "reqCaLevel", "reqCaResults", "reqBranch", "reqPhone", "reqBirthDate", "reqAddress", "reqNotes"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
    }

    async function submitStudentAccountRequest() {
      const fullName = document.getElementById("reqFullName").value.trim();
      const loginEmail = document.getElementById("reqPersonalEmail").value.trim();
      const requestedPassword = document.getElementById("reqPassword").value.trim();

      if (!fullName) {
        showMessage("Full name is required.", "error");
        return;
      }

      if (!loginEmail) {
        showMessage("Student personal email / login email is required.", "error");
        return;
      }

      if (!requestedPassword) {
        showMessage("Requested login password is required.", "error");
        return;
      }

      if (requestedPassword.length < 8) {
        showMessage("Login password must contain at least 8 characters.", "error");
        return;
      }

      const row = {
        full_name: fullName,
        login_email: loginEmail,
        requested_password: requestedPassword,
        photo_url: document.getElementById("reqPhotoUrl").value.trim(),
        designation: document.getElementById("reqDesignation").value.trim(),
        registration_no: document.getElementById("reqRegistrationNo").value.trim(),
        joining_date: document.getElementById("reqJoiningDate").value || null,
        cc_complete_date: document.getElementById("reqCcCompleteDate").value || null,
        ca_level: document.getElementById("reqCaLevel").value.trim(),
        ca_results: document.getElementById("reqCaResults").value.trim(),
        branch: document.getElementById("reqBranch").value.trim(),
        phone: document.getElementById("reqPhone").value.trim(),
        birth_date: document.getElementById("reqBirthDate").value || null,
        address: document.getElementById("reqAddress").value.trim(),
        notes: document.getElementById("reqNotes").value.trim(),
        status: "Submitted"
      };

      const result = await db
        .from("student_account_requests")
        .insert([row]);

      if (result.error) {
        showMessage("Request submit failed: " + result.error.message, "error");
        return;
      }

      clearStudentAccountRequestForm();
      closeStudentAccountRequestModal();
      showMessage("Account request submitted successfully. Data Manager will review it.", "success");
    }

    async function loadStudentAccountRequests() {
      const result = await db
        .from("student_account_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (result.error) {
        studentAccountRequests = [];
        return;
      }

      studentAccountRequests = result.data || [];
    }

    async function loadStudentCaUpdateRequests() {
      const result = await db
        .from("student_ca_update_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (result.error) {
        studentCaUpdateRequests = [];
        return;
      }

      studentCaUpdateRequests = result.data || [];
    }

    function renderCaUpdateRequestTable() {
      const tbody = document.getElementById("caUpdateRequestTable");
      if (!tbody) return;

      const rows = studentCaUpdateRequests.filter(r => r.status === "Pending");

      tbody.innerHTML = rows.length ? rows.map(r => `
        <tr>
          <td>${escapeHtml(formatDate(r.created_at))}</td>
          <td>${escapeHtml(r.student_id)} - ${escapeHtml(r.student_name)}</td>
          <td>${escapeHtml(r.current_ca_level)}</td>
          <td><strong>${escapeHtml(r.requested_ca_level)}</strong></td>
          <td>${escapeHtml(r.current_ca_results)}</td>
          <td><strong>${escapeHtml(r.requested_ca_results)}</strong></td>
          <td><strong>${escapeHtml(r.status)}</strong></td>
          <td><button class="success" onclick="approveStudentCaUpdateRequest('${escapeAttribute(r.id)}')">Approve</button> <button class="danger" onclick="rejectStudentCaUpdateRequest('${escapeAttribute(r.id)}')">Reject</button></td>
        </tr>
      `).join("") : "<tr><td colspan='8'>No pending CA status update request found.</td></tr>";
    }

    async function approveStudentCaUpdateRequest(requestId) {
      if (!hasAccessRole("data_manager")) {
        showMessage("Only Data Manager can approve CA status update requests.", "error");
        return;
      }

      const req = studentCaUpdateRequests.find(r => String(r.id) === String(requestId));
      if (!req) {
        showMessage("CA update request not found.", "error");
        return;
      }

      if (!confirm("Approve this CA status update request?")) return;
      const note = prompt("Approval note", "Approved by Data Manager") || "Approved by Data Manager";

      const result = await db.rpc("review_student_ca_status_request", {
        p_request_id: requestId,
        p_decision: "approve",
        p_review_note: note
      });

      if (result.error) {
        showMessage("Approval failed: " + result.error.message, "error");
        return;
      }

      await loadPublicStudents();
      await loadStudentCaUpdateRequests();
      renderCaUpdateRequestTable();
      renderDataManagerList();
      showMessage("CA status update approved successfully.", "success");
    }

    async function rejectStudentCaUpdateRequest(requestId) {
      if (!hasAccessRole("data_manager")) {
        showMessage("Only Data Manager can reject CA status update requests.", "error");
        return;
      }

      const req = studentCaUpdateRequests.find(r => String(r.id) === String(requestId));
      if (!req) {
        showMessage("CA update request not found.", "error");
        return;
      }

      const note = prompt("Rejection note", "Rejected by Data Manager") || "Rejected by Data Manager";

      const result = await db.rpc("review_student_ca_status_request", {
        p_request_id: requestId,
        p_decision: "reject",
        p_review_note: note
      });

      if (result.error) {
        showMessage("Reject failed: " + result.error.message, "error");
        return;
      }

      await loadStudentCaUpdateRequests();
      renderCaUpdateRequestTable();
      showMessage("CA status update request rejected.", "success");
    }

    function renderReviewRequestTable() {
      const tbody = document.getElementById("reviewRequestTable");
      if (!tbody) return;

      const rows = studentAccountRequests.filter(r => r.status === "Submitted");

      tbody.innerHTML = rows.length ? rows.map(r => `
        <tr>
          <td>${escapeHtml(formatDate(r.created_at))}</td>
          <td>${escapeHtml(r.full_name)}</td>
          <td>${escapeHtml(r.login_email)}</td>
          <td>${escapeHtml(r.branch)}</td>
          <td><strong>${escapeHtml(r.status)}</strong></td>
          <td>${escapeHtml(r.assigned_student_id)}</td>
          <td><button class="warning" onclick="loadRequestForReview('${escapeAttribute(r.id)}')">Load Review</button></td>
        </tr>
      `).join("") : "<tr><td colspan='7'>No submitted account request found.</td></tr>";
    }

    function loadRequestForReview(requestId) {
      const req = studentAccountRequests.find(r => String(r.id) === String(requestId));
      if (!req) {
        showMessage("Request not found.", "error");
        return;
      }

      document.getElementById("reviewRequestId").value = req.id;
      document.getElementById("reviewAssignedStudentId").value = req.assigned_student_id || "";
      document.getElementById("reviewNote").value = req.review_note || "Checked and recommended for approval.";
      showReviewRequestDetails(req);
      openReviewRequestModal();
      showMessage("Request loaded for Data Manager review.", "success");
    }

    function showReviewRequestDetails(req) {
      const box = document.getElementById("reviewRequestDetailsBox");
      const details = document.getElementById("reviewRequestDetails");

      if (!box || !details || !req) return;

      box.style.display = "block";
      details.innerHTML = `
        <div class="request-detail-grid">
          <div class="request-detail-item"><span>Submitted Date</span><strong>${escapeHtml(formatDate(req.created_at))}</strong></div>
          <div class="request-detail-item"><span>Status</span><strong>${escapeHtml(req.status)}</strong></div>
          <div class="request-detail-item"><span>Full Name</span><strong>${escapeHtml(req.full_name)}</strong></div>
          <div class="request-detail-item"><span>Login Email</span><strong>${escapeHtml(req.login_email)}</strong></div>
          <div class="request-detail-item"><span>Requested Password</span><strong>${escapeHtml(req.requested_password)}</strong></div>
          <div class="request-detail-item"><span>Photo URL</span><strong>${escapeHtml(req.photo_url)}</strong></div>
          <div class="request-detail-item"><span>Designation</span><strong>${escapeHtml(req.designation)}</strong></div>
          <div class="request-detail-item"><span>Registration No.</span><strong>${escapeHtml(req.registration_no)}</strong></div>
          <div class="request-detail-item"><span>Joining Date</span><strong>${escapeHtml(req.joining_date)}</strong></div>
          <div class="request-detail-item"><span>CC Complete Date</span><strong>${escapeHtml(req.cc_complete_date)}</strong></div>
          <div class="request-detail-item"><span>CA Level</span><strong>${escapeHtml(req.ca_level)}</strong></div>
          <div class="request-detail-item"><span>CA Result Summary</span><strong>${escapeHtml(req.ca_results)}</strong></div>
          <div class="request-detail-item"><span>Branch</span><strong>${escapeHtml(req.branch)}</strong></div>
          <div class="request-detail-item"><span>Phone</span><strong>${escapeHtml(req.phone)}</strong></div>
          <div class="request-detail-item"><span>Birth Date</span><strong>${escapeHtml(req.birth_date)}</strong></div>
          <div class="request-detail-item"><span>Address</span><strong>${escapeHtml(req.address)}</strong></div>
          <div class="request-detail-item"><span>Notes</span><strong>${escapeHtml(req.notes)}</strong></div>
        </div>
      `;
    }

    async function markRequestReviewed() {
      if (!hasAccessRole("data_manager")) {
        showMessage("Only Data Manager or Master can review student account requests.", "error");
        return;
      }

      const requestId = document.getElementById("reviewRequestId").value.trim();
      const assignedStudentId = document.getElementById("reviewAssignedStudentId").value.trim();
      const reviewNote = document.getElementById("reviewNote").value.trim();

      if (!requestId) {
        showMessage("Please load a request first.", "error");
        return;
      }

      if (!assignedStudentId) {
        showMessage("Assigned Student ID is required before review.", "error");
        return;
      }

      const result = await db.rpc("data_manager_decide_account_request", {
        p_request_id: requestId,
        p_action: "Reviewed",
        p_assigned_student_id: assignedStudentId,
        p_review_note: reviewNote || "Checked and recommended for approval."
      });

      if (result.error) {
        showMessage("Review failed: " + result.error.message, "error");
        return;
      }

      clearReviewForm();
      closeReviewRequestModal(false);
      await loadStudentAccountRequests();
      renderReviewRequestTable();
      if (isMasterPower()) renderMasterRequestTable();
      showMessage("Request marked as reviewed. Master Account can now approve it.", "success");
    }

    async function rejectRequestByDataManager() {
      if (!hasAccessRole("data_manager")) {
        showMessage("Only Data Manager or Master can reject student account requests.", "error");
        return;
      }

      const requestId = document.getElementById("reviewRequestId").value.trim();
      const currentNote = document.getElementById("reviewNote").value.trim();

      if (!requestId) {
        showMessage("Please load a request first.", "error");
        return;
      }

      const reason = prompt(
        "Reason for rejection",
        currentNote && currentNote !== "Checked and recommended for approval." ? currentNote : ""
      );

      if (reason === null) return;

      if (!reason.trim()) {
        showMessage("Rejection reason is required.", "error");
        return;
      }

      if (!confirm("Reject this account request? The request will not go to Master approval.")) {
        return;
      }

      const result = await db.rpc("data_manager_decide_account_request", {
        p_request_id: requestId,
        p_action: "Rejected",
        p_assigned_student_id: null,
        p_review_note: reason.trim()
      });

      if (result.error) {
        showMessage("Reject failed: " + result.error.message, "error");
        return;
      }

      clearReviewForm();
      closeReviewRequestModal(false);
      await loadStudentAccountRequests();
      renderReviewRequestTable();
      if (isMasterPower()) renderMasterRequestTable();
      showMessage("Account request rejected by Data Manager.", "success");
    }

    function clearReviewForm() {
      ["reviewRequestId", "reviewAssignedStudentId", "reviewNote"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });

      const box = document.getElementById("reviewRequestDetailsBox");
      const details = document.getElementById("reviewRequestDetails");
      if (box) box.style.display = "none";
      if (details) details.innerHTML = "";
    }

    function renderMasterRequestTable() {
      const tbody = document.getElementById("masterRequestTable");
      if (!tbody) return;

      const existingStudentIds = new Set(students.map(s => safe(s.student_id)));
      const existingCredentialIds = new Set(studentCredentials.map(c => safe(c.student_id)));

      const rows = studentAccountRequests.filter(function (r) {
        const sid = safe(r.assigned_student_id);
        return r.status === "Reviewed" && sid && !existingStudentIds.has(sid) && !existingCredentialIds.has(sid);
      });

      tbody.innerHTML = rows.length ? rows.map(r => {
        const canApprove = r.status === "Reviewed" && r.assigned_student_id;
        const action = canApprove
          ? `<button class="success" onclick="approveStudentAccountRequest('${escapeAttribute(r.id)}')">Approve</button> <button class="danger" onclick="rejectStudentAccountRequest('${escapeAttribute(r.id)}')">Reject</button>`
          : "No action";

        return `
          <tr>
            <td>${escapeHtml(formatDate(r.created_at))}</td>
            <td>${escapeHtml(r.full_name)}</td>
            <td>${escapeHtml(r.login_email)}</td>
            <td><strong>${escapeHtml(r.requested_password)}</strong></td>
            <td>${escapeHtml(r.cc_complete_date)}</td>
            <td>${escapeHtml(r.assigned_student_id)}</td>
            <td>${escapeHtml(r.review_note)}</td>
            <td><strong>${escapeHtml(r.status)}</strong></td>
            <td>${action}</td>
          </tr>
        `;
      }).join("") : "<tr><td colspan='9'>No reviewed account request waiting for approval.</td></tr>";
    }

    async function approveStudentAccountRequest(requestId) {
      if (!isMasterPower()) {
        showMessage("Only Master Account / Top Senior can approve student account requests.", "error");
        return;
      }

      const req = studentAccountRequests.find(r => String(r.id) === String(requestId));
      if (!req) {
        showMessage("Request not found.", "error");
        return;
      }

      if (req.status !== "Reviewed") {
        showMessage("Request must be reviewed by Data Manager before approval.", "error");
        return;
      }

      if (!req.assigned_student_id) {
        showMessage("Assigned Student ID is required before approval.", "error");
        return;
      }

      if (!confirm("Approve this request and automatically create the student's login account?")) return;

      showMessage("Creating student login account...", "success");

      const { data, error } = await db.functions.invoke("approve-student-account", {
        body: { request_id: requestId }
      });

      if (error) {
        let message = error.message || "Automatic account creation failed.";
        try {
          if (error.context && typeof error.context.json === "function") {
            const detail = await error.context.json();
            message = detail?.error || detail?.message || message;
          }
        } catch (_) {}
        await loadStudentAccountRequests();
        renderMasterRequestTable();
        showMessage("Approval failed: " + message, "error");
        return;
      }

      if (!data || data.ok !== true) {
        showMessage("Approval failed: " + (data?.error || "Unknown server response"), "error");
        return;
      }

      await loadPublicStudents();
      await loadStudentCredentials();
      await loadStudentAccountRequests();
      await loadManagerAccessAssignments();
      renderCredentialTable();
      renderMasterRequestTable();
      renderPublicStudents(document.getElementById("publicSearch")?.value || "");

      const sid = data.student_id || req.assigned_student_id;
      showMessage(
        `Account approved and activated successfully. ${sid} can now log in immediately with ${req.login_email}.`,
        "success"
      );
    }

    async function rejectStudentAccountRequest(requestId) {
      if (!isMasterPower()) {
        showMessage("Only Master Account / Top Senior can reject requests.", "error");
        return;
      }

      if (!confirm("Reject this student account request?")) return;

      const note = prompt("Rejection note", "Rejected by Master Account") || "Rejected by Master Account";
      const result = await db.from("student_account_requests").update({
        status: "Rejected",
        approval_note: note,
        approved_by: currentUser.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq("id", requestId);

      if (result.error) {
        showMessage("Reject failed: " + result.error.message, "error");
        return;
      }

      await loadStudentAccountRequests();
      renderMasterRequestTable();
      renderReviewRequestTable();
      showMessage("Request rejected.", "success");
    }

    async function loadStudentDataManager() {
      const detailsResult = await db.from("student_details").select("*");
      studentDetails = detailsResult.data || [];
      await loadStudentAccountRequests();
      await loadStudentCaUpdateRequests();
      await loadArticleConversionRequests();
      if (isMasterPower()) await loadStudentCredentials();
      renderDataManagerList();
      renderReviewRequestTable();
      renderCaUpdateRequestTable();
      renderArticleConversionDataManagerTable();
      setDataManagerVisibility();
    }

    function setDataManagerVisibility() {
      const listCard = document.getElementById("studentDataListCard");
      const reviewCard = document.getElementById("accountReviewListCard");
      const caUpdateCard = document.getElementById("caUpdateApprovalCard");
      const articleConversionCard = document.getElementById("articleConversionRequestCard");

      if (listCard) listCard.classList.remove("hidden");
      if (reviewCard) reviewCard.classList.remove("hidden");
      if (caUpdateCard) caUpdateCard.classList.remove("hidden");
      if (articleConversionCard) articleConversionCard.classList.remove("hidden");
    }

    async function loadArticleConversionRequests() {
      articleConversionRequests = [];

      if (!currentProfile) return;

      const result = await db
        .from("student_article_conversion_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (result.error) {
        console.warn("Article conversion request load failed:", result.error.message);
        return;
      }

      articleConversionRequests = result.data || [];
    }

    function suggestNextArticleStudentId() {
      const used = students
        .map(s => String(s.student_id || "").trim())
        .filter(id => /^ST-\d+$/i.test(id))
        .map(id => Number(id.split("-")[1]))
        .filter(n => Number.isFinite(n));

      const next = used.length ? Math.max(...used) + 1 : 1;
      return "ST-" + String(next).padStart(3, "0");
    }

    async function studentApplyArticleConversion() {
      if (!currentProfile || currentProfile.student_id == null) {
        showMessage("Please log in to your student account.", "error");
        return;
      }

      const student = students.find(s => String(s.student_id) === String(currentProfile.student_id));

      if (!student || student.status !== "Active" || student.designation !== "Under Provision") {
        showMessage("Only an active Under Provision student can apply for Article Student conversion.", "error");
        return;
      }

      const registrationNo =
        document.getElementById("studentArticleConversionRegistrationNo")?.value.trim() || "";
      const ccCompleteDate =
        document.getElementById("studentArticleConversionCcCompleteDate")?.value || "";
      const studentNote =
        document.getElementById("studentArticleConversionNote")?.value.trim() || "";

      if (!registrationNo) {
        showMessage("ICAB Registration No. is required.", "error");
        return;
      }

      if (!ccCompleteDate) {
        showMessage("CC Complete Date is required.", "error");
        return;
      }

      if (!confirm("Submit your request to convert from Under Provision to Article Student?")) return;

      const result = await db.rpc("student_submit_article_conversion_request", {
        p_registration_no: registrationNo,
        p_cc_complete_date: ccCompleteDate,
        p_student_note: studentNote
      });

      if (result.error) {
        showMessage("Application failed: " + result.error.message, "error");
        return;
      }

      showMessage("Your Article Student conversion application has been submitted to the Data Manager.", "success");
      await loadStudentDashboard();
    }

    function renderArticleConversionDataManagerTable() {
      const tbody = document.getElementById("articleConversionDataManagerTable");
      if (!tbody) return;

      tbody.innerHTML = articleConversionRequests.length
        ? articleConversionRequests.map(r => {
            let action = "";

            if (r.status === "Submitted") {
              action = `
                <button class="success" onclick="openArticleConversionModal('${escapeAttribute(r.student_id)}','${escapeAttribute(r.id)}')">Review</button>
                <button class="danger" onclick="rejectArticleConversionByDataManager('${escapeAttribute(r.id)}')">Reject</button>
              `;
            } else if (r.status === "Pending Master Approval") {
              action = "Waiting for Master";
            } else {
              action = "Completed";
            }

            return `
              <tr>
                <td>${escapeHtml(formatDate(r.created_at))}</td>
                <td>${escapeHtml(r.student_id)}</td>
                <td>${escapeHtml(r.proposed_student_id)}</td>
                <td>${escapeHtml(r.student_name)}</td>
                <td>${escapeHtml(r.proposed_registration_no)}</td>
                <td>${escapeHtml(r.proposed_cc_complete_date)}</td>
                <td class="article-note-cell">${escapeHtml(r.student_note)}</td>
                <td class="article-note-cell">${escapeHtml(r.data_manager_note)}</td>
                <td><strong>${escapeHtml(r.status)}</strong></td>
                <td class="article-note-cell">${escapeHtml(r.master_note)}</td>
                <td>${action}</td>
              </tr>
            `;
          }).join("")
        : "<tr><td colspan='11'>No Article Student conversion request found.</td></tr>";
    }

    function openArticleConversionModal(studentId, requestId = "") {
      if (!hasAccessRole("data_manager")) {
        showMessage("Only Data Manager / Master can prepare an Article Student conversion.", "error");
        return;
      }

      const student = students.find(s => String(s.student_id) === String(studentId));

      if (!student) {
        showMessage("Student not found.", "error");
        return;
      }

      if (student.status !== "Active" || student.designation !== "Under Provision") {
        showMessage("Only an active Under Provision student can be converted to Article Student.", "error");
        return;
      }

      let request = null;

      if (requestId) {
        request = articleConversionRequests.find(r => String(r.id) === String(requestId));

        if (!request || request.status !== "Submitted") {
          showMessage("This application is no longer waiting for Data Manager review.", "error");
          return;
        }
      }

      const openRequest = articleConversionRequests.find(r =>
        String(r.student_id) === String(studentId)
        && ["Submitted", "Pending Master Approval"].includes(r.status)
      );

      if (!requestId && openRequest && openRequest.status === "Pending Master Approval") {
        showMessage("This student already has a conversion request waiting for Master approval.", "error");
        return;
      }

      if (!requestId && openRequest && openRequest.status === "Submitted") {
        request = openRequest;
        requestId = openRequest.id;
      }

      document.getElementById("articleConversionStudentId").value = student.student_id;
      document.getElementById("articleConversionRequestId").value = requestId || "";
      document.getElementById("articleConversionStudentIdText").textContent = student.student_id;
      document.getElementById("articleConversionStudentName").textContent = student.full_name;
      document.getElementById("articleConversionNewStudentId").value =
        request?.proposed_student_id || suggestNextArticleStudentId();
      document.getElementById("articleConversionRegistrationNo").value =
        request?.proposed_registration_no || student.registration_no || "";
      document.getElementById("articleConversionCcCompleteDate").value =
        request?.proposed_cc_complete_date || student.cc_complete_date || "";
      document.getElementById("articleConversionDataManagerNote").value =
        request?.data_manager_note || "Checked and recommended for Article Student conversion.";

      document.getElementById("articleConversionModal").classList.remove("hidden");
      document.body.classList.add("modal-open");
    }

    function closeArticleConversionModal() {
      const modal = document.getElementById("articleConversionModal");
      if (modal) modal.classList.add("hidden");
      document.body.classList.remove("modal-open");
    }

    async function submitArticleConversionRequest() {
      if (!hasAccessRole("data_manager")) {
        showMessage("Only Data Manager / Master can submit Article Student conversion requests.", "error");
        return;
      }

      const studentId =
        document.getElementById("articleConversionStudentId")?.value.trim() || "";
      const requestId =
        document.getElementById("articleConversionRequestId")?.value.trim() || "";
      const newStudentId =
        document.getElementById("articleConversionNewStudentId")?.value.trim().toUpperCase() || "";
      const registrationNo =
        document.getElementById("articleConversionRegistrationNo")?.value.trim() || "";
      const ccCompleteDate =
        document.getElementById("articleConversionCcCompleteDate")?.value || "";
      const note =
        document.getElementById("articleConversionDataManagerNote")?.value.trim() || "";

      if (!studentId) {
        showMessage("Current Student ID is missing.", "error");
        return;
      }

      if (!/^ST-\d{3,}$/i.test(newStudentId)) {
        showMessage("New Article Student ID must be in ST-001 format.", "error");
        return;
      }

      if (!registrationNo) {
        showMessage("ICAB Registration No. is required for Article Student conversion.", "error");
        return;
      }

      if (!ccCompleteDate) {
        showMessage("CC Complete Date is required for Article Student conversion.", "error");
        return;
      }

      if (!confirm(
        `Send this conversion to Master approval?\n\nCurrent ID: ${studentId}\nNew Article ID: ${newStudentId}`
      )) return;

      const result = await db.rpc("data_manager_prepare_article_conversion", {
        p_student_id: studentId,
        p_request_id: requestId || null,
        p_new_student_id: newStudentId,
        p_registration_no: registrationNo,
        p_cc_complete_date: ccCompleteDate,
        p_data_manager_note: note || "Checked and recommended for Article Student conversion."
      });

      if (result.error) {
        showMessage("Conversion request failed: " + result.error.message, "error");
        return;
      }

      closeArticleConversionModal();
      await loadArticleConversionRequests();
      renderArticleConversionDataManagerTable();
      renderDataManagerList();
      if (isMasterPower()) renderMasterArticleConversionTable();

      showMessage("Conversion checked and sent to Master approval.", "success");
    }

    async function rejectArticleConversionByDataManager(requestId) {
      if (!hasAccessRole("data_manager")) {
        showMessage("Only Data Manager / Master can reject this application.", "error");
        return;
      }

      const req = articleConversionRequests.find(r => String(r.id) === String(requestId));

      if (!req || req.status !== "Submitted") {
        showMessage("This application is no longer waiting for Data Manager review.", "error");
        return;
      }

      const reason = prompt("Reason for Data Manager rejection", "");
      if (reason === null) return;

      if (!reason.trim()) {
        showMessage("Rejection reason is required.", "error");
        return;
      }

      if (!confirm(`Reject the Article Student conversion application for ${req.student_name}?`)) return;

      const result = await db.rpc("data_manager_reject_article_conversion", {
        p_request_id: requestId,
        p_data_manager_note: reason.trim()
      });

      if (result.error) {
        showMessage("Reject failed: " + result.error.message, "error");
        return;
      }

      await loadArticleConversionRequests();
      renderArticleConversionDataManagerTable();
      renderDataManagerList();

      showMessage("Article Student conversion application rejected by Data Manager.", "success");
    }

    function renderMasterArticleConversionTable() {
      const tbody = document.getElementById("masterArticleConversionTable");
      if (!tbody) return;

      const rows = articleConversionRequests.filter(r => r.status === "Pending Master Approval");

      tbody.innerHTML = rows.length
        ? rows.map(r => `
            <tr>
              <td>${escapeHtml(formatDate(r.created_at))}</td>
              <td>${escapeHtml(r.student_id)}</td>
              <td><strong>${escapeHtml(r.proposed_student_id)}</strong></td>
              <td>${escapeHtml(r.student_name)}</td>
              <td><strong>${escapeHtml(r.proposed_registration_no)}</strong></td>
              <td>${escapeHtml(r.proposed_cc_complete_date)}</td>
              <td class="article-note-cell">${escapeHtml(r.student_note)}</td>
              <td class="article-note-cell">${escapeHtml(r.data_manager_note)}</td>
              <td><strong>${escapeHtml(r.status)}</strong></td>
              <td>
                <button class="success" onclick="masterDecideArticleConversion('${escapeAttribute(r.id)}','approve')">Approve</button>
                <button class="danger" onclick="masterDecideArticleConversion('${escapeAttribute(r.id)}','reject')">Reject</button>
              </td>
            </tr>
          `).join("")
        : "<tr><td colspan='10'>No Article Student conversion request waiting for approval.</td></tr>";
    }

    async function masterDecideArticleConversion(requestId, decision) {
      if (!isMasterPower()) {
        showMessage("Only Master Account / Top Senior can make the final Article Student conversion decision.", "error");
        return;
      }

      const req = articleConversionRequests.find(r => String(r.id) === String(requestId));

      if (!req || req.status !== "Pending Master Approval") {
        showMessage("This conversion request is no longer waiting for approval.", "error");
        await loadArticleConversionRequests();
        renderMasterArticleConversionTable();
        return;
      }

      const approving = decision === "approve";

      const confirmation = approving
        ? `Approve ${req.student_name} as an Article Student?\n\nCurrent ID: ${req.student_id}\nNew Article ID: ${req.proposed_student_id}\n\nAll linked student records will move to the new ID.`
        : `Reject the Article Student conversion for ${req.student_name}?`;

      if (!confirm(confirmation)) return;

      const note = prompt(
        approving ? "Master approval note (optional)" : "Reason for rejection",
        approving ? "Approved for Article Student conversion and ID change." : ""
      );

      if (note === null) return;

      if (!approving && !note.trim()) {
        showMessage("Rejection reason is required.", "error");
        return;
      }

      const result = await db.rpc("master_decide_article_conversion", {
        p_request_id: requestId,
        p_decision: approving ? "approve" : "reject",
        p_master_note: note.trim()
      });

      if (result.error) {
        showMessage((approving ? "Approval" : "Rejection") + " failed: " + result.error.message, "error");
        return;
      }

      await loadPublicStudents();
      await loadArticleConversionRequests();
      renderMasterArticleConversionTable();

      if (document.getElementById("dataManagerTable")) {
        renderDataManagerList();
        renderArticleConversionDataManagerTable();
      }

      showMessage(
        approving
          ? `Conversion approved. Student ID changed from ${req.student_id} to ${req.proposed_student_id}.`
          : "Article Student conversion request rejected.",
        "success"
      );
    }

    async function loadStudentCredentials() {
      const result = await db.from("student_login_credentials").select("*").order("created_at", { ascending: false });
      studentCredentials = result.error ? [] : (result.data || []);
    }

    function renderDataManagerList() {
      const tbody = document.getElementById("dataManagerTable");
      const search = document.getElementById("dataSearch").value.toLowerCase();
      const rows = students.filter(s => safe(s.student_id).toLowerCase().includes(search) || safe(s.full_name).toLowerCase().includes(search) || safe(s.designation).toLowerCase().includes(search) || safe(s.registration_no).toLowerCase().includes(search) || safe(s.ca_results).toLowerCase().includes(search) || safe(s.cc_complete_date).toLowerCase().includes(search) || safe(s.branch).toLowerCase().includes(search) || safe(s.fund_responsibility).toLowerCase().includes(search));
      tbody.innerHTML = rows.length ? rows.map(s => {
        const viewProfileButton = isMasterPower()
          ? `<button class="success" onclick="openMasterStudentProfile('${escapeAttribute(s.student_id)}')">View Profile</button>`
          : "";

        const deleteButton = isMasterPower()
          ? `<button class="dark" onclick="deleteStudent('${escapeAttribute(s.student_id)}')">Delete</button>`
          : "";

        const submittedArticleConversion = articleConversionRequests.find(r =>
          String(r.student_id) === String(s.student_id) &&
          r.status === "Submitted"
        );

        const hasPendingArticleConversion = articleConversionRequests.some(r =>
          String(r.student_id) === String(s.student_id) &&
          r.status === "Pending Master Approval"
        );

        const convertButton = s.status === "Active" && s.designation === "Under Provision"
          ? submittedArticleConversion
            ? `<button class="success" onclick="openArticleConversionModal('${escapeAttribute(s.student_id)}','${escapeAttribute(submittedArticleConversion.id)}')">Review Application</button>`
            : `<button class="success" onclick="openArticleConversionModal('${escapeAttribute(s.student_id)}')" ${hasPendingArticleConversion ? "disabled" : ""}>${hasPendingArticleConversion ? "Conversion Pending" : "Convert to Article"}</button>`
          : "";

        return `<tr><td>${escapeHtml(s.student_id)}</td><td>${escapeHtml(s.full_name)}</td><td>${escapeHtml(s.designation)}</td><td>${escapeHtml(s.registration_no)}</td><td>${escapeHtml(s.ca_results)}</td><td>${escapeHtml(s.cc_complete_date)}</td><td>${escapeHtml(s.branch)}</td><td>${escapeHtml(s.fund_responsibility && s.fund_responsibility !== "Student" ? s.fund_responsibility : "Fund Member")}</td><td><span class="${s.status === "Active" ? "active-status" : "inactive-status"}">${escapeHtml(s.status)}</span></td><td>${viewProfileButton}${convertButton}<button class="warning" onclick="editStudent('${escapeAttribute(s.student_id)}')">Edit</button><button class="danger" onclick="deactivateStudent('${escapeAttribute(s.student_id)}')">Deactivate</button>${deleteButton}</td></tr>`;
      }).join("") : "<tr><td colspan='10'>No student found.</td></tr>";
    }

    function editStudent(studentId) {
      const pub = students.find(s => s.student_id === studentId) || {};
      const priv = studentDetails.find(d => d.student_id === studentId) || {};
      const cred = studentCredentials.find(c => c.student_id === studentId) || {};
      document.getElementById("editingStudentId").value = studentId;
      document.getElementById("studentId").value = pub.student_id || "";
      document.getElementById("studentId").readOnly = true;
      document.getElementById("fullName").value = pub.full_name || "";
      document.getElementById("photoUrl").value = pub.photo_url || "";
      document.getElementById("designation").value = pub.designation || "";
      document.getElementById("registrationNo").value = pub.registration_no || "";
      document.getElementById("joiningDate").value = pub.joining_date || "";
      document.getElementById("ccCompleteDate").value = pub.cc_complete_date || "";
      document.getElementById("caLevel").value = pub.ca_level || "";
      document.getElementById("caResults").value = pub.ca_results || "";
      document.getElementById("branch").value = pub.branch || "";
      document.getElementById("fundResponsibility").value = pub.fund_responsibility || "Student";
      applyFundResponsibilityRules();
      document.getElementById("studentStatus").value = pub.status || "Active";
      document.getElementById("studentLoginEmail").value = cred.login_email || "";
      document.getElementById("studentTempPassword").value = cred.temporary_password || "";
      document.getElementById("privatePhone").value = priv.phone || "";
      document.getElementById("privateEmail").value = priv.email_private || "";
      document.getElementById("birthDate").value = priv.birth_date || "";
      document.getElementById("privateAddress").value = priv.address || "";
      document.getElementById("privateNotes").value = priv.notes || "";
      openTabById("dataTab");
      openStudentFormModal("Edit Data");
      showMessage("Profile loaded for editing.", "success");
    }

    async function saveStudent() {
      const sid = document.getElementById("studentId").value.trim();
      if (!sid) { showMessage("Student ID is required.", "error"); return; }
      const birthDateValue = document.getElementById("birthDate").value || null;
      let birthMonth = null, birthDay = null;
      if (birthDateValue) { const parts = birthDateValue.split("-"); birthMonth = Number(parts[1]); birthDay = Number(parts[2]); }
      const designationValue = document.getElementById("designation").value.trim();
      let fundResponsibilityValue = document.getElementById("fundResponsibility").value;
      if (!isFundEligibleDesignation(designationValue)) {
        fundResponsibilityValue = "Student";
        document.getElementById("fundResponsibility").value = "Student";
      }
      const publicRow = { student_id: sid, full_name: document.getElementById("fullName").value.trim(), photo_url: document.getElementById("photoUrl").value.trim(), designation: designationValue, registration_no: document.getElementById("registrationNo").value.trim(), joining_date: document.getElementById("joiningDate").value || null, cc_complete_date: document.getElementById("ccCompleteDate").value || null, ca_level: document.getElementById("caLevel").value.trim(), ca_results: document.getElementById("caResults").value.trim(), branch: document.getElementById("branch").value.trim(), fund_responsibility: fundResponsibilityValue, status: document.getElementById("studentStatus").value, birth_month: birthMonth, birth_day: birthDay };
      const privateRow = { student_id: sid, phone: document.getElementById("privatePhone").value.trim(), email_private: document.getElementById("privateEmail").value.trim(), birth_date: birthDateValue, address: document.getElementById("privateAddress").value.trim(), notes: document.getElementById("privateNotes").value.trim() };
      const loginEmail = document.getElementById("studentLoginEmail").value.trim();
      const tempPassword = document.getElementById("studentTempPassword").value.trim();
      if (!publicRow.full_name) { showMessage("Full name is required.", "error"); return; }
      if ((loginEmail && !tempPassword) || (!loginEmail && tempPassword)) { showMessage("Both student login email and temporary password are required.", "error"); return; }
      const publicResult = await db.from("students").upsert(publicRow, { onConflict: "student_id" });
      if (publicResult.error) { showMessage(publicResult.error.message, "error"); return; }
      const privateResult = await db.from("student_details").upsert(privateRow, { onConflict: "student_id" });
      if (privateResult.error) { showMessage(privateResult.error.message, "error"); return; }
      if (loginEmail && tempPassword) {
        const credentialResult = await db.from("student_login_credentials").upsert({ student_id: sid, student_name: publicRow.full_name, login_email: loginEmail, temporary_password: tempPassword, role: "student", status: publicRow.status }, { onConflict: "student_id" });
        if (credentialResult.error) { showMessage("Student saved, but credential save failed: " + credentialResult.error.message, "error"); return; }
      }
      clearStudentForm();
      closeStudentFormModal();
      await loadPublicStudents();
      await loadStudentDataManager();
      if (isMasterPower()) await loadMasterData();
      showMessage("Profile saved successfully.", "success");
    }

    async function deactivateStudent(studentId) {
      if (!confirm("Deactivate this student?")) return;
      const result = await db.from("students").update({ status: "Inactive" }).eq("student_id", studentId);
      if (result.error) { showMessage(result.error.message, "error"); return; }
      await db.from("student_login_credentials").update({ status: "Inactive" }).eq("student_id", studentId);
      await db.from("student_opening_balances").update({ status: "Inactive" }).eq("student_id", studentId);
      await loadPublicStudents();
      await loadStudentDataManager();
      if (isMasterPower()) await loadMasterData();
      showMessage("Profile deactivated.", "success");
    }

    function clearStudentForm() {
      ["editingStudentId", "studentId", "fullName", "photoUrl", "designation", "registrationNo", "joiningDate", "ccCompleteDate", "caLevel", "caResults", "branch", "studentLoginEmail", "studentTempPassword", "privatePhone", "privateEmail", "birthDate", "privateAddress", "privateNotes"].forEach(id => document.getElementById(id).value = "");
      document.getElementById("fundResponsibility").value = "Student";
      applyFundResponsibilityRules();
      document.getElementById("studentId").readOnly = false;
      document.getElementById("studentStatus").value = "Active";
    }

    async function loadMasterData() {
      const assignmentCard = document.getElementById("masterAccessAssignmentCard");
      if (assignmentCard) assignmentCard.classList.toggle("hidden", !isActualMaster());

      const profileResult = await db.from("profiles").select("*").order("full_name", { ascending: true });
      if (profileResult.error) { showMessage(profileResult.error.message, "error"); return; }
      userProfiles = profileResult.data || [];
      await loadManagerAccessAssignments();
      await loadStudentCredentials();
      await loadStudentAccountRequests();
      await loadArticleConversionRequests();
      await loadFundLoanApplications();
      await loadFundLoanRepayments();
      renderMasterProfiles();
      renderManagerAccessAssignment();
      renderCredentialTable();
      renderMasterRequestTable();
      renderMasterArticleConversionTable();
      renderMasterLoanApprovalTable();
    }

    async function loadManagerAccessAssignments() {
      managerAccessAssignments = [];
      if (!currentProfile || currentProfile.role !== "master") return;
      const result = await db
        .from("user_access_roles")
        .select("*")
        .order("student_id", { ascending: true });
      if (!result.error) managerAccessAssignments = result.data || [];
    }

    function renderManagerAccessAssignment() {
      const select = document.getElementById("accessAssignmentStudent");
      const tbody = document.getElementById("managerAccessAssignmentTable");
      if (!select || !tbody) return;

      const activeStudents = [...students]
        .filter(s => s.status === "Active")
        .sort((a, b) => {
          const idCompare = safe(a.student_id).localeCompare(safe(b.student_id), undefined, { numeric: true, sensitivity: "base" });
          return idCompare || safe(a.full_name).localeCompare(safe(b.full_name), undefined, { sensitivity: "base" });
        });

      select.innerHTML = `<option value="">Select student</option>` + activeStudents.map(s =>
        `<option value="${escapeAttribute(s.student_id)}">${escapeHtml(s.student_id)} - ${escapeHtml(s.full_name)}</option>`
      ).join("");

      const rows = activeStudents.map(student => {
        const profile = userProfiles.find(p => String(p.student_id) === String(student.student_id));
        if (!profile) return null;
        const roles = managerAccessAssignments
          .filter(a => a.user_id === profile.id && a.active !== false)
          .map(a => a.access_role);
        if (!roles.length) return null;
        return { student, profile, roles };
      }).filter(Boolean);

      tbody.innerHTML = rows.length ? rows.map(row => `
        <tr>
          <td>${escapeHtml(row.student.student_id)}</td>
          <td>${escapeHtml(row.student.full_name)}</td>
          <td>${escapeHtml(row.profile.email || "")}</td>
          <td>${row.roles.includes("fund_manager") ? "Yes" : "No"}</td>
          <td>${row.roles.includes("data_manager") ? "Yes" : "No"}</td>
          <td>${row.roles.includes("top_senior") ? "Yes" : "No"}</td>
          <td><button class="warning" onclick="editStudentManagerAccess('${escapeAttribute(row.student.student_id)}')">Edit</button> <button class="danger" onclick="removeStudentManagerAccess('${escapeAttribute(row.student.student_id)}')">Remove</button></td>
        </tr>
      `).join("") : `<tr><td colspan="7">No delegated system access assigned.</td></tr>`;
    }

    function getSelectedAccessProfile(studentId) {
      return userProfiles.find(p => String(p.student_id) === String(studentId));
    }

    function loadSelectedStudentAccess() {
      const studentId = document.getElementById("accessAssignmentStudent")?.value || "";
      const fundBox = document.getElementById("assignFundManagerAccess");
      const dataBox = document.getElementById("assignDataManagerAccess");
      const topSeniorBox = document.getElementById("assignTopSeniorAccess");
      if (!fundBox || !dataBox || !topSeniorBox) return;
      fundBox.checked = false;
      dataBox.checked = false;
      topSeniorBox.checked = false;
      if (!studentId) return;
      const profile = getSelectedAccessProfile(studentId);
      if (!profile) return;
      const roles = managerAccessAssignments
        .filter(a => a.user_id === profile.id && a.active !== false)
        .map(a => a.access_role);
      fundBox.checked = roles.includes("fund_manager");
      dataBox.checked = roles.includes("data_manager");
      topSeniorBox.checked = roles.includes("top_senior");
    }

    function editStudentManagerAccess(studentId) {
      const select = document.getElementById("accessAssignmentStudent");
      if (!select) return;
      select.value = studentId;
      loadSelectedStudentAccess();
      select.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    async function saveStudentManagerAccess() {
      if (!currentProfile || currentProfile.role !== "master") {
        showMessage("Only the actual Master Account can assign delegated system access.", "error");
        return;
      }
      const studentId = document.getElementById("accessAssignmentStudent")?.value || "";
      if (!studentId) {
        showMessage("Please select a student.", "error");
        return;
      }
      const profile = getSelectedAccessProfile(studentId);
      if (!profile) {
        showMessage("This student has no linked login account in profiles. Link the student's Auth account first.", "error");
        return;
      }
      if (profile.role !== "student" && profile.role !== "manager") {
        showMessage("Select a student login account, not a system account.", "error");
        return;
      }

      const roles = [];
      if (document.getElementById("assignFundManagerAccess")?.checked) roles.push("fund_manager");
      if (document.getElementById("assignDataManagerAccess")?.checked) roles.push("data_manager");
      if (document.getElementById("assignTopSeniorAccess")?.checked) roles.push("top_senior");

      // Only one Top Senior can be active at a time.
      if (roles.includes("top_senior")) {
        const clearOtherTopSenior = await db
          .from("user_access_roles")
          .delete()
          .eq("access_role", "top_senior")
          .neq("user_id", profile.id);
        if (clearOtherTopSenior.error) {
          showMessage("Top Senior update failed: " + clearOtherTopSenior.error.message, "error");
          return;
        }
      }

      const removeResult = await db.from("user_access_roles").delete().eq("user_id", profile.id);
      if (removeResult.error) {
        showMessage("Access update failed: " + removeResult.error.message, "error");
        return;
      }

      if (roles.length) {
        const rows = roles.map(role => ({
          user_id: profile.id,
          student_id: studentId,
          access_role: role,
          active: true,
          assigned_by: currentUser.id
        }));
        const insertResult = await db.from("user_access_roles").insert(rows);
        if (insertResult.error) {
          showMessage("Access save failed: " + insertResult.error.message, "error");
          return;
        }
      }

      await loadManagerAccessAssignments();
      renderManagerAccessAssignment();
      loadSelectedStudentAccess();
      showMessage(roles.length ? "Delegated system access saved." : "Delegated system access removed.", "success");
    }

    async function removeStudentManagerAccess(studentIdArg = "") {
      if (!currentProfile || currentProfile.role !== "master") {
        showMessage("Only the actual Master Account can remove delegated system access.", "error");
        return;
      }
      const studentId = studentIdArg || document.getElementById("accessAssignmentStudent")?.value || "";
      if (!studentId) {
        showMessage("Please select a student.", "error");
        return;
      }
      const profile = getSelectedAccessProfile(studentId);
      if (!profile) {
        showMessage("No linked login account found for this student.", "error");
        return;
      }
      if (!confirm("Remove Fund Manager, Data Manager and Top Senior access from this student?")) return;
      const result = await db.from("user_access_roles").delete().eq("user_id", profile.id);
      if (result.error) {
        showMessage("Access removal failed: " + result.error.message, "error");
        return;
      }
      await loadManagerAccessAssignments();
      renderManagerAccessAssignment();
      const select = document.getElementById("accessAssignmentStudent");
      if (select) select.value = studentId;
      loadSelectedStudentAccess();
      showMessage("Delegated system access removed.", "success");
    }

    function renderCredentialTable() {
      const tbody = document.getElementById("credentialTable");
      if (!tbody) return;

      if (!studentCredentials.length) {
        tbody.innerHTML = "<tr><td colspan='8'>No student login credential found.</td></tr>";
        return;
      }

      tbody.innerHTML = studentCredentials.map(function (c) {
        return `
          <tr>
            <td>${escapeHtml(c.student_id)}</td>
            <td>${escapeHtml(c.student_name)}</td>
            <td><span class="credential-email-cell">${escapeHtml(c.login_email)}</span></td>
            <td><span class="credential-password-cell">${escapeHtml(c.temporary_password)}</span></td>
            <td>${escapeHtml(c.role)}</td>
            <td>${escapeHtml(c.status)}</td>
            <td>${escapeHtml(formatDate(c.created_at))}</td>
            <td><button class="warning" onclick="openCredentialEditModal('${escapeAttribute(c.id)}')">Check / Change</button></td>
          </tr>
        `;
      }).join("");
    }


    function applyMasterCredentialFieldVisibility() {
      const isMaster = isMasterPower();
      document.querySelectorAll(".master-credential-field").forEach(function (field) {
        if (isMaster) {
          field.classList.remove("hidden");
        } else {
          field.classList.add("hidden");
        }
      });
    }

    function openCredentialEditModal(credentialId) {
      if (!isMasterPower()) {
        showMessage("Only Master Account / Top Senior can check or change student login credentials.", "error");
        return;
      }

      const c = studentCredentials.find(function (item) {
        return String(item.id) === String(credentialId);
      });

      if (!c) {
        showMessage("Credential record not found.", "error");
        return;
      }

      document.getElementById("credentialEditId").value = c.id || "";
      document.getElementById("credentialStudentId").value = c.student_id || "";
      document.getElementById("credentialStudentName").value = c.student_name || "";
      document.getElementById("credentialLoginEmail").value = c.login_email || "";
      document.getElementById("credentialTempPassword").value = c.temporary_password || "";
      document.getElementById("credentialStatus").value = c.status || "Active";

      const modal = document.getElementById("credentialEditModal");
      modal.classList.remove("hidden");
      modal.classList.add("show");
      document.body.classList.add("modal-open-body");
      document.body.style.overflow = "hidden";
    }

    function closeCredentialEditModal() {
      const modal = document.getElementById("credentialEditModal");
      if (modal) {
        modal.classList.remove("show");
        modal.classList.add("hidden");
      }
      document.body.classList.remove("modal-open-body");
      document.body.style.overflow = "";
    }

    async function saveCredentialUpdate() {
      if (!isMasterPower()) {
        showMessage("Only Master Account / Top Senior can change student login credentials.", "error");
        return;
      }

      const id = document.getElementById("credentialEditId").value;
      const studentId = document.getElementById("credentialStudentId").value.trim();
      const studentName = document.getElementById("credentialStudentName").value.trim();
      const loginEmail = document.getElementById("credentialLoginEmail").value.trim();
      const tempPassword = document.getElementById("credentialTempPassword").value.trim();
      const status = document.getElementById("credentialStatus").value;

      if (!id || !studentId || !studentName || !loginEmail || !tempPassword) {
        showMessage("Student ID, name, login email and temporary password are required.", "error");
        return;
      }

      const result = await db
        .from("student_login_credentials")
        .update({
          student_name: studentName,
          login_email: loginEmail,
          temporary_password: tempPassword,
          status: status,
          updated_at: new Date().toISOString()
        })
        .eq("id", id);

      if (result.error) {
        showMessage("Credential update failed: " + result.error.message, "error");
        return;
      }

      await loadStudentCredentials();
      renderCredentialTable();
      closeCredentialEditModal();
      showMessage("Student login credential updated successfully.", "success");
    }

    function renderMasterProfiles() {
      const tbody = document.getElementById("profileUserTable");
      tbody.innerHTML = userProfiles.length ? userProfiles.map(p => `<tr><td>${escapeHtml(p.email)}</td><td>${escapeHtml(p.full_name)}</td><td>${escapeHtml(p.student_id)}</td><td>${escapeHtml(p.role)}</td><td>${escapeHtml(p.status)}</td></tr>`).join("") : "<tr><td colspan='5'>No user profile found.</td></tr>";
    }

    function openStudentFormModal(title) {
      const modal = document.getElementById("studentFormModal");
      const titleBox = document.getElementById("studentFormModalTitle");

      if (!modal) return;
      if (titleBox) titleBox.textContent = title || "Add / Edit Data";
      applyMasterCredentialFieldVisibility();
      applyFundResponsibilityRules();

      modal.classList.remove("hidden");
      modal.classList.add("show");
      document.body.classList.add("modal-open-body");
      document.body.style.overflow = "hidden";
    }

    function closeStudentFormModal() {
      const modal = document.getElementById("studentFormModal");
      if (modal) {
        modal.classList.remove("show");
        modal.classList.add("hidden");
      }
      document.body.classList.remove("modal-open-body");
      document.body.style.overflow = "";
    }

    function openAddStudentModal() {
      clearStudentForm();
      openStudentFormModal("Add Data");
    }

    function openReviewRequestModal() {
      const modal = document.getElementById("reviewRequestModal");
      if (!modal) return;
      modal.classList.remove("hidden");
      modal.classList.add("show");
      document.body.classList.add("modal-open-body");
      document.body.style.overflow = "hidden";
    }

    function closeReviewRequestModal(clearForm = true) {
      const modal = document.getElementById("reviewRequestModal");
      if (clearForm) clearReviewForm();
      if (modal) {
        modal.classList.remove("show");
        modal.classList.add("hidden");
      }
      document.body.classList.remove("modal-open-body");
      document.body.style.overflow = "";
    }

    function scrollToDataManagerRequests() {
      const box = document.getElementById("accountReviewListCard");
      if (box) box.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function scrollToStudentDataList() {
      const box = document.getElementById("studentDataListCard");
      if (box) box.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function scrollToOrganogramList() {
      const box = document.getElementById("organogramListCard");
      if (box) box.scrollIntoView({ behavior: "smooth", block: "start" });
      renderServerOrganogramTable();
    }

    function openTab(tabId, btn) {
      document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
      document.querySelectorAll(".tab-btn").forEach(button => button.classList.remove("active"));
      document.getElementById(tabId).classList.add("active");
      if (btn) btn.classList.add("active");
    }

    function openTabById(tabId) {
      const btn = document.querySelector('.tab-btn[data-tab="' + tabId + '"]');
      if (btn) openTab(tabId, btn);
    }

    function showMessage(text, type) {
      const box = document.getElementById("messageBox");
      if (!text) { box.style.display = "none"; return; }
      box.textContent = text;
      box.className = "message " + type;
      box.style.display = "block";
      setTimeout(() => { box.style.display = "none"; }, 4500);
    }

    function money(value) {
      return Number(value || 0).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function safe(value) { return value === null || value === undefined ? "" : String(value); }

    function getInitials(name) {
      if (!name) return "ST";
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function formatDate(value) { if (!value) return ""; return new Date(value).toLocaleString("en-BD"); }
    function compactDate(value) { return String(value || "").replaceAll("-", ""); }
    function shortFund(value) { return String(value || "GF").split(/\s+/).map(w => w[0] || "").join("").toUpperCase().substring(0, 6); }
    function monthEnd(monthValue) { const parts = monthValue.split("-"); const d = new Date(Number(parts[0]), Number(parts[1]), 0); return d.toISOString().slice(0, 10); }

    function escapeHtml(value) {
      if (value === null || value === undefined) return "";
      return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    function escapeAttribute(value) { return String(value || "").replaceAll("\\", "\\\\").replaceAll("'", "\\'"); }

    async function deleteStudent(studentId) {
      if (!isMasterPower()) {
        showMessage("Only Master Account / Top Senior can delete a student.", "error");
        return;
      }

      const student = students.find(function (s) {
        return s.student_id === studentId;
      });

      const studentName = student ? student.full_name : studentId;

      const firstConfirm = confirm(
        "Are you sure you want to permanently delete this student?\n\n" +
        "Student: " + studentName + "\n" +
        "Student ID: " + studentId + "\n\n" +
        "This will remove the student profile, private details, login credential record and opening balance."
      );

      if (!firstConfirm) return;

      const secondConfirm = confirm(
        "Final confirmation: Delete permanently?\n\nThis action cannot be undone."
      );

      if (!secondConfirm) return;

      await db.from("student_login_credentials").delete().eq("student_id", studentId);
      await db.from("student_opening_balances").delete().eq("student_id", studentId);
      await db.from("student_details").delete().eq("student_id", studentId);

      const result = await db
        .from("students")
        .delete()
        .eq("student_id", studentId);

      if (result.error) {
        showMessage("Delete failed: " + result.error.message, "error");
        return;
      }

      clearStudentForm();
      await loadPublicStudents();
      await loadStudentDataManager();

      if (isMasterPower()) {
        await loadMasterData();
      }

      showMessage("Profile deleted successfully.", "success");
    }

