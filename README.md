# MAF Student Server — Modular GitHub Version

This folder is the same MAF Student Server code split into separate files for safer GitHub maintenance.

## File structure

- `index.html` — page structure / HTML.
- `css/styles.css` — all visual design, responsive layout, tables, profile styling, CAPTCHA layout, and My Loans styling.
- `js/config.js` — Supabase project URL, publishable key, and Supabase client initialization.
- `js/data.js` — front-end runtime state variables/arrays used by the application. This is **not** a backup of live Supabase records.
- `js/app.js` — login, profiles, roles, funds, loans, leave, approvals, conversions, printing, and other application functions.
- `backup/MAF_Student_Server_Full_Backup_2026-09-26.html` — exact monolithic source file used to create this modular version.

## Important: where the real data is stored

Student profiles, fund records, loans, leave applications, credentials/roles, approvals, and other live records are stored in Supabase. Replacing these GitHub files does not delete those Supabase records.

## GitHub deployment

Keep the folder structure exactly as shown. `index.html` expects `css/styles.css` and the three JavaScript files inside `js/`.

The external Supabase and hCaptcha libraries remain referenced from `index.html`, as in the original working file.

