import csv
import json
import re

content_file = r"C:\Users\CONFERENCE\.gemini\antigravity-ide\brain\ca629971-62af-4083-9385-59e44c8d8c6a\.system_generated\steps\152\content.md"

with open(content_file, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Find header line starting with "Timestamp" or containing "Date Logged"
start_idx = -1
for i, line in enumerate(lines):
    if "Timestamp,Date Logged" in line:
        start_idx = i
        break

if start_idx == -1:
    print("Could not find CSV header line")
    exit(1)

csv_text = "".join(lines[start_idx:])
reader = list(csv.reader(csv_text.splitlines()))

headers = reader[0]
rows = reader[1:]

memos = []
counter = 1

for r in rows:
    if len(r) < 6:
        continue
    timestamp = r[0].strip()
    date_logged = r[1].strip() if len(r) > 1 and r[1].strip() else "1/23/2026"
    time_str = r[2].strip() if len(r) > 2 and r[2].strip() else "8:00:00 AM"
    received_by = r[3].strip() if len(r) > 3 and r[3].strip() else "Pat Bornidor"
    originating = r[4].strip() if len(r) > 4 and r[4].strip() else "RCD"
    subject = r[5].strip() if len(r) > 5 and r[5].strip() else ""
    action_req = r[6].strip() if len(r) > 6 and r[6].strip() else "For Concur"
    remarks_status = r[7].strip() if len(r) > 7 and r[7].strip() else "Transmitted to"
    transmitted = r[8].strip() if len(r) > 8 and r[8].strip() else ""
    date_received = r[9].strip() if len(r) > 9 and r[9].strip() else ""
    drive_link = r[10].strip() if len(r) > 10 and r[10].strip() else "https://drive.google.com/drive/folders/1uUxq2TwM0UWKL06fIAAVMCJNjbGMg-sh?usp=sharing"

    if not subject:
        continue

    # Clean up multi-line values inside fields
    transmitted = re.sub(r'\s+', ' ', transmitted).strip()
    subject = re.sub(r'\s+', ' ', subject).strip()
    received_by = re.sub(r'\s+', ' ', received_by).strip()

    # Normalize drive link if missing or dummy
    if not drive_link or "drive.google.com" not in drive_link:
        drive_link = "https://drive.google.com/drive/folders/1uUxq2TwM0UWKL06fIAAVMCJNjbGMg-sh?usp=sharing"

    memo_id = f"MEMO-2026-{str(counter).zfill(3)}"
    counter += 1

    memos.append({
        "id": memo_id,
        "dateLogged": date_logged,
        "time": time_str,
        "receivedBy": received_by,
        "originatingOffice": originating,
        "subject": subject,
        "actionRequired": action_req,
        "remarksStatus": remarks_status,
        "transmittedOffice": transmitted,
        "dateReceived": date_received,
        "driveLink": drive_link,
        "pages": 1
    })

print(f"Total parsed memos: {len(memos)}")

output_js_path = r"c:\Users\CONFERENCE\.gemini\antigravity-ide\scratch\memo-monitoring-system\js\memos_data.js"
with open(output_js_path, "w", encoding="utf-8") as out:
    out.write("const INITIAL_MEMOS = " + json.dumps(memos, indent=2) + ";\n")

print("Saved JS data to memos_data.js")
