import psycopg2
import os

import json
import urllib.request
import socket

host = "ep-withered-queen-avivaax7-pooler.c-11.us-east-1.aws.neon.tech"
try:
    socket.gethostbyname(host)
except socket.gaierror:
    try:
        url = f"https://dns.google/resolve?name={host}&type=A"
        req = urllib.request.Request(url, headers={"User-Agent": "Floxa/1.0"})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
            if "Answer" in data and len(data["Answer"]) > 0:
                host = data["Answer"][0]["data"]
                print("Resolved host IP via Google DNS:", host)
    except Exception as dns_err:
        print("DNS fallback error:", dns_err)

try:
    conn = psycopg2.connect(
        dbname="neondb",
        user="neondb_owner",
        password="npg_5AUhnwW2fRiJ",
        host="18.233.142.186",
        port=5432,
        sslmode="require",
        options="endpoint=ep-withered-queen-avivaax7-pooler"
    )
    cur = conn.cursor()
    print("Successfully connected to Neon PostgreSQL!")

    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public';")
    tables = [r[0] for r in cur.fetchall()]
    print(f"Total tables: {len(tables)}")

    for t in ["consultants", "projects_client", "projects_project", "projects_projectdiscovery", "projects_branddna", "projects_moodboard", "projects_concept", "projects_deliverable", "projects_projectagreement", "projects_paymentmilestone"]:
        if t in tables:
            cur.execute(f"SELECT count(*) FROM {t};")
            cnt = cur.fetchone()[0]
            print(f"  {t}: {cnt} rows")

    cur.execute("SELECT id, name, email FROM consultants LIMIT 5;")
    for row in cur.fetchall():
        print("Consultant:", row)

    cur.execute("SELECT id, title, company_name, portal_token FROM projects_project LIMIT 5;")
    for row in cur.fetchall():
        print("Project:", row)

except Exception as e:
    print("Error connecting to Neon:", e)
