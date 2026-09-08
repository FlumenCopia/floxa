import psycopg2
import json
import datetime
import decimal
import uuid
import os

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, (datetime.datetime, datetime.date, datetime.time)):
            return o.isoformat()
        if isinstance(o, decimal.Decimal):
            return float(o)
        if isinstance(o, uuid.UUID):
            return str(o)
        if isinstance(o, bytes):
            return o.decode("utf-8", errors="replace")
        return super().default(o)

import psycopg2.extras

def export_all():
    print("Connecting to Neon PostgreSQL...")
    conn = psycopg2.connect(
        dbname="neondb",
        user="neondb_owner",
        password="npg_5AUhnwW2fRiJ",
        host="18.233.142.186",
        port=5432,
        sslmode="require",
        options="endpoint=ep-withered-queen-avivaax7-pooler"
    )
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    tables = [
        "consultants",
        "projects_client",
        "projects_project",
        "projects_clientprofile",
        "projects_projectdiscovery",
        "projects_discoverysliderresponse",
        "projects_discoveryemotion",
        "projects_discoverycompetitor",
        "projects_discoveryvisualstyle",
        "projects_branddna",
        "projects_moodboard",
        "projects_concept",
        "projects_deliverable",
        "projects_projectagreement",
        "projects_projectagreementappendix",
        "projects_generatedagreementsnapshot",
        "projects_paymentmilestone",
        "projects_paymenttransaction",
        "projects_razorpaywebhookevent",
        "projects_projectactivity"
    ]

    export_data = {}

    for table in tables:
        try:
            cur.execute(f"SELECT * FROM {table};")
            rows = cur.fetchall()
            export_data[table] = [dict(r) for r in rows]
            print(f"Exported {len(rows)} rows from {table}")
        except Exception as e:
            print(f"Error exporting table {table}: {e}")
            conn.rollback()

    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../data"))
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "neon_export.json")

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(export_data, f, indent=2, cls=CustomJSONEncoder)

    print(f"Successfully saved export to {out_file}")

if __name__ == "__main__":
    export_all()
