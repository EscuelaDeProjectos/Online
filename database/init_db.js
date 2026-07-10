const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbDir = path.join(__dirname);
const dbFile = path.join(dbDir, 'app.db');
const schemaFile = path.join(dbDir, 'schema.sql');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const schema = fs.existsSync(schemaFile) ? fs.readFileSync(schemaFile, 'utf8') : '';

const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    process.exit(1);
  }

  db.serialize(() => {
    if (schema) {
      db.exec(schema, (err) => {
        if (err) {
          console.error('Failed to run schema:', err);
          db.close();
          return;
        }
        console.log('Schema executed successfully.');

        db.all("PRAGMA table_info(players)", (err, cols) => {
          if (err) {
            console.error('Failed to inspect players table:', err);
            db.close();
            return;
          }

          const hasPassword = cols && cols.some((col) => col.name === 'password');
          if (!hasPassword) {
            db.run("ALTER TABLE players ADD COLUMN password TEXT", (alterErr) => {
              if (alterErr) {
                console.error('Failed to add password column:', alterErr);
              } else {
                console.log('Added password column to players table.');
              }
              db.close();
            });
          } else {
            db.close();
          }
        });
      });
    } else {
      db.close();
    }
  });
});
