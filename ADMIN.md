# Admin window

`/app/admin` shows one card per member: name, 12-digit ID, e-mail, placement-test level (or "Test not taken"), goal
(with the exam date for the Goethe goal), interests and sign-up date. Search by name, ID or e-mail. **Delete user** removes
the member together with their test results, lesson progress, cards and review history (asks for confirmation first).

## Who is an admin

In Vercel open **Settings → Environment Variables** and add:

- **Key:** `ADMIN_IDS`
- **Value:** the 12-digit IDs of the admins, separated by commas, e.g. `1234 5678 9012, 2345 6789 0123`

Then **redeploy** (Deployments → ⋯ → Redeploy). The IDs are log-in credentials, so they are not stored in the repository.

Admins see **Admin** in the top menu, in the account menu (top right) and in the "More" menu on phones. Everybody else does
not see it, and the server answers 403 to every admin request. Admins cannot be deleted from the page, and nobody can delete
their own account there (use *Account* for that).

## Files

`lib/http.js` (`isAdmin`, `user.is_admin`) · `api/app.js` (`admin.users`, `admin.delete`) · `assets/app.js` (menu entries) ·
`assets/nav.js` · `assets/app-admin.js` + `assets/app.css` (page) · `tests/admin.test.js` (19 checks).
