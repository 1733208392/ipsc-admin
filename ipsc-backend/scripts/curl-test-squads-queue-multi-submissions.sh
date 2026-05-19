#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001/api/v1}"
MATCH_ID="${MATCH_ID:-1}"
STAGE_ID="${STAGE_ID:-}"
SHOOTER_ID="${SHOOTER_ID:-}"
SHOOTER_BIB="${SHOOTER_BIB:-}"

post_json() {
  local url="$1"
  local json="$2"
  curl --noproxy '*' -sS -X POST "$url" \
    -H 'Content-Type: application/json' \
    -d "$json"
}

get_json() {
  local url="$1"
  curl --noproxy '*' -sS "$url"
}

echo "== 1) Validate existing match =="
MATCH_CHECK=$(get_json "$BASE_URL/matches/$MATCH_ID")
JSON_INPUT="$MATCH_CHECK" node -e "const r=JSON.parse(process.env.JSON_INPUT||'{}'); if(!r.success){console.error(r.error||'Match check failed'); process.exit(1);}"

echo "== 2) Resolve stage in this match =="
if [[ -z "$STAGE_ID" ]]; then
  STAGES_RESP=$(get_json "$BASE_URL/matches/$MATCH_ID/stages")
  STAGE_ID=$(JSON_INPUT="$STAGES_RESP" node -e "const r=JSON.parse(process.env.JSON_INPUT||'{}'); const rows=r.data||[]; const id=(rows[0]||{}).id; if(!id) process.exit(1); process.stdout.write(String(id));")
fi

echo "== 3) Resolve shooter in this match =="
SHOOTERS_RESP=$(get_json "$BASE_URL/matches/$MATCH_ID/shooters")
if [[ -z "$SHOOTER_BIB" ]]; then
  if [[ -n "$SHOOTER_ID" ]]; then
    SHOOTER_BIB=$(JSON_INPUT="$SHOOTERS_RESP" SHOOTER_ID="$SHOOTER_ID" node -e "const r=JSON.parse(process.env.JSON_INPUT||'{}'); const rows=r.data||[]; const s=rows.find((x)=>String(x.id)===String(process.env.SHOOTER_ID)); if(!s||!s.bib_number) process.exit(1); process.stdout.write(String(s.bib_number));")
  else
    SHOOTER_ID=$(JSON_INPUT="$SHOOTERS_RESP" node -e "const r=JSON.parse(process.env.JSON_INPUT||'{}'); const rows=r.data||[]; const s=rows[0]||null; if(!s||!s.id) process.exit(1); process.stdout.write(String(s.id));")
    SHOOTER_BIB=$(JSON_INPUT="$SHOOTERS_RESP" node -e "const r=JSON.parse(process.env.JSON_INPUT||'{}'); const rows=r.data||[]; const s=rows[0]||null; if(!s||!s.bib_number) process.exit(1); process.stdout.write(String(s.bib_number));")
  fi
fi
if [[ -z "$SHOOTER_ID" ]]; then
  SHOOTER_ID=$(JSON_INPUT="$SHOOTERS_RESP" SHOOTER_BIB="$SHOOTER_BIB" node -e "const r=JSON.parse(process.env.JSON_INPUT||'{}'); const rows=r.data||[]; const s=rows.find((x)=>String(x.bib_number)===String(process.env.SHOOTER_BIB)); if(!s||!s.id) process.exit(1); process.stdout.write(String(s.id));")
fi

echo "Using match_id=$MATCH_ID stage_id=$STAGE_ID shooter_id=$SHOOTER_ID bib=$SHOOTER_BIB"

echo "== 4) First score submission =="
SUBMIT1=$(post_json "$BASE_URL/matches/$MATCH_ID/scores/flextarget" "{\"shooter_bib\":\"$SHOOTER_BIB\",\"stage_id\":\"$STAGE_ID\",\"total_time\":12.50,\"hits\":{\"A\":8,\"C\":2,\"D\":0,\"M\":0,\"N\":0},\"penalties\":{\"PE\":0},\"first_shot\":1.10,\"fastest_split\":0.22}")
echo "$SUBMIT1" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const latest=((d.data||{}).scores||[])[0]||{}; console.log(JSON.stringify({first_submission_latest: {id: latest.id, total_time: latest.total_time, hit_factor: latest.hit_factor, submitted_at: latest.submitted_at}}, null, 2));"

echo "== 5) Wait 1 second for different timestamp =="
sleep 1

echo "== 6) Second score submission (different result) =="
SUBMIT2=$(post_json "$BASE_URL/matches/$MATCH_ID/scores/flextarget" "{\"shooter_bib\":\"$SHOOTER_BIB\",\"stage_id\":\"$STAGE_ID\",\"total_time\":10.20,\"hits\":{\"A\":10,\"C\":2,\"D\":0,\"M\":0,\"N\":0},\"penalties\":{\"PE\":0},\"first_shot\":0.95,\"fastest_split\":0.18}")
echo "$SUBMIT2" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); if (!d.success) { console.log(JSON.stringify({second_submit_error: d.error || 'unknown'}, null, 2)); process.exit(1); } const scores=(d.data||{}).scores||[]; console.log(JSON.stringify({submission_count: scores.length, latest_two: scores.slice(0,2).map((s)=>({id:s.id,total_time:s.total_time,hit_factor:s.hit_factor,submitted_at:s.submitted_at}))}, null, 2));"

echo "== 7) Test queue API endpoint =="
QUEUE=$(get_json "$BASE_URL/matches/$MATCH_ID/squads/queue")
SHOOTER_BIB="$SHOOTER_BIB" node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const squads=d.data||[]; const allShooters=squads.flatMap((sq)=>sq.shooters||[]); const shooter=allShooters.find((s)=>String(s.bib_number)===String(process.env.SHOOTER_BIB))||null; console.log(JSON.stringify({queue_endpoint:'/api/v1/matches/{matchId}/squads/queue', squads_count:squads.length, shooter_in_queue: shooter}, null, 2));" <<< "$QUEUE"

echo "== 8) Verify timestamps/results directly from shooter scores =="
SCORES=$(get_json "$BASE_URL/shooters/$SHOOTER_ID/scores")
STAGE_ID="$STAGE_ID" node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const rows=(d.data||[]).filter((r)=>r.stage_id); const stageRows=rows.filter((r)=>r.stage_id===Number(process.env.STAGE_ID)); console.log(JSON.stringify({score_rows_for_stage: stageRows.map((r)=>({id:r.id,total_time:r.total_time,hit_factor:r.hit_factor,submitted_at:r.submitted_at})).slice(0,5)}, null, 2));" <<< "$SCORES"

echo ""
echo "Done."
echo "Used match_id=$MATCH_ID, stage_id=$STAGE_ID, shooter_id=$SHOOTER_ID, shooter_bib=$SHOOTER_BIB"
echo "You can re-check queue: $BASE_URL/matches/$MATCH_ID/squads/queue"
