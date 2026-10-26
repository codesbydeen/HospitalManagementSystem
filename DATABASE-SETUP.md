# Local MySQL and VS Code setup

This guide configures a local MySQL server for CareFlow, loads its tables, and creates the first admin login. It does not define a shared/default admin password; choose and keep your own password locally.

## 1. Install and start MySQL with Homebrew

Install Homebrew if it is not already installed, then install MySQL:

```bash
brew install mysql
```

Start the Homebrew service:

```bash
brew services start mysql
```

Check its status and find the listening port:

```bash
brew services info mysql
lsof -nP -iTCP -sTCP:LISTEN | grep -i mysql
```

Use the port shown by the MySQL server process in the commands and connection settings below. A fresh Homebrew install commonly uses `3306`; this project machine's existing Homebrew server is configured for `3307`. Do not start a second MySQL installation from System Settings or another installer.

Check that the server accepts connections on the expected port:

```bash
mysqladmin --connect-timeout=3 -h 127.0.0.1 -P 3307 ping
```

`mysqld is alive` confirms the server is reachable. An `Access denied` response still confirms that a server answered, but means the credentials need attention. `Can't connect` means the server is stopped, or the host/port is wrong.

On a fresh Homebrew installation, follow the prompts from `mysql_secure_installation` if you want to set or secure the local MySQL administrator account:

```bash
mysql_secure_installation
```

Keep the administrator password private. If this is an existing MySQL data directory, do not initialize or erase it as part of setup.

## 2. Connect SQLTools to MySQL as an administrator

In VS Code, install **SQLTools** and **SQLTools MySQL/MariaDB/TiDB Driver** if they are not installed.

1. Open the SQLTools sidebar and choose **Add New Connection**.
2. Select the MySQL driver.
3. Enter your local server details: host `127.0.0.1`, the actual listening port (currently `3307` on this project machine), and your MySQL administrator username and password.
4. Leave the database/schema blank for this initial administrator connection if `careflow_db` has not been created yet.
5. Save the connection and connect. Use the administrator password configured for your own MySQL installation; it is not supplied by this project.

Do not put the MySQL administrator password in project files or use the administrator account in the CareFlow application.

## 3. Create the database and load all tables

With the administrator connection selected, open `schema.sql` and execute the entire file using SQLTools. It creates `careflow_db` and the project's current tables: patients, doctors, doctor accounts and sessions, appointments, patient sessions, consultations, pharmacy inventory, prescriptions, and invoices.

The schema already contains `doctor_accounts` and `doctor_sessions`. For a new database, **do not also execute** `migrations/002-add-doctor-accounts.sql`; that migration is for an older database that does not yet have those tables. Do not run migrations against an existing database until you have backed it up and checked which schema changes it still needs.

To verify the table list in SQLTools, run:

```sql
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'careflow_db'
ORDER BY TABLE_NAME;
```

## 4. Create a restricted application database account

While still using the administrator connection, create a separate MySQL account for the app. Replace the example password with a new, strong local password. Use a password without a single quote so it can be entered directly in this SQL string.

```sql
CREATE USER IF NOT EXISTS 'careflow_app'@'127.0.0.1'
  IDENTIFIED BY 'replace_with_a_new_local_password';
GRANT SELECT, INSERT, UPDATE, DELETE
  ON careflow_db.* TO 'careflow_app'@'127.0.0.1';
```

Set the matching values in the ignored, local `.env` file at the repository root:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3307
DB_NAME=careflow_db
DB_USER=careflow_app
DB_PASSWORD=your_new_local_password
```

`DB_PASSWORD` must exactly match the password used in `CREATE USER`. Keep `.env` private; do not commit or share it. The `.env.example` file is only a template—replace its example values rather than using them as real credentials.

## 5. Add the app connection in SQLTools

Create a second SQLTools connection for regular app/database work:

- Driver: MySQL
- Host: `127.0.0.1`
- Port: the actual MySQL listening port (currently `3307` on this project machine)
- Database: `careflow_db`
- Username: `careflow_app`
- Password: the same local password stored in `.env`

Save the password through SQLTools/VS Code's connection prompt rather than in a committed workspace settings file. Use the administrator connection only for schema setup and administrative SQL. If SQLTools reports unknown `authProtocol` or `enableSsl` options, remove those unsupported options from that connection's driver settings; they are not standard MySQL2 connection options.

## 6. Create your first admin login

1. Start the CareFlow server with `npm start`.
2. Open `http://localhost:3000/patient-register.html` and create an account using the email and password you want to use for the admin login. Choose a password you control; do not send it in chat or commit it.
3. In SQLTools, select the administrator or app connection and promote that account. Replace the email below with the exact email used during registration:

   ```sql
   UPDATE careflow_db.patients
   SET role = 'admin'
   WHERE email = 'your-admin-email@example.com';
   ```

4. Confirm the query updated exactly one row. Sign out and log in again at `http://localhost:3000/patient-login.html`; the account should open the admin portal.

There is no pre-created admin account or project-provided admin password. Public registration creates patient accounts, so the one-time SQL promotion is required. Do not promote an account unless you control its email and password.

## Troubleshooting

- **`ECONNREFUSED ...:3307`**: CareFlow or SQLTools is targeting port `3307`, but the local server is not listening there. Set both connections to the server's actual port (commonly `3306`).
- **`ECONNREFUSED ...:3306`**: Start the MySQL server and confirm the configured port with `lsof`.
- **`Access denied for user`**: MySQL is reachable, but the username, password, or allowed host does not match. Recheck the SQLTools connection and `.env`; if needed, use the MySQL administrator connection to create/reset `careflow_app`.
- **SQLTools warns about unknown driver options**: Remove its unsupported `authProtocol` and `enableSsl` options. The separate connection-refused error is resolved by correcting the server status/host/port.
- **`EADDRINUSE ...:3000`**: Another CareFlow process already uses the web port. Keep using that process or stop it from its original terminal before starting another.

After changing `.env`, restart CareFlow so it reloads the database settings.
