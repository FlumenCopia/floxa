import sqlite3
import os

db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend/db.sqlite3'))
print("Checking DB:", db_path)

if not os.path.exists(db_path):
    print("db.sqlite3 does not exist")
    exit(0)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

tables = [t[0] for t in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print(f"Total tables: {len(tables)}")

for t in ["consultants", "projects_client", "projects_project", "projects_projectdiscovery", "projects_branddna", "projects_moodboard", "projects_concept", "projects_deliverable", "projects_projectagreement", "projects_paymentmilestone"]:
    if t in tables:
        cnt = cur.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
        print(f"  {t}: {cnt} rows")

cur.execute("SELECT id, name, email FROM consultants")
for row in cur.fetchall():
    print("Consultant:", row)
