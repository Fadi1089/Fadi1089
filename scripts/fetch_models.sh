#!/usr/bin/env bash
# Download the Poly Pizza models used by the portfolio site into site/models/
# and write site/models/manifest.json (the site reads it to load the models
# and to list credits). Run it from anywhere:
#
#   bash scripts/fetch_models.sh
#
# Models the site finds here replace its built-in procedural props. Any model
# that fails to download is skipped, and the site keeps the procedural one.

set -u
cd "$(dirname "$0")/.." || exit 1
OUT="site/models"
mkdir -p "$OUT"

# name | Poly Pizza id | download url | title | author | licence
MODELS='desk|6PbVkqPzEU|https://static.poly.pizza/0716218b-3aae-48e6-8ddd-185cf7f7b7d7.glb|Desk|Kenney|CC0 1.0
laptop|GnbwSUiVty|https://static.poly.pizza/8190e659-7079-442f-9ed9-083f67b1746b.glb|Laptop|Kenney|CC0 1.0
campfire|i6UFAevfcu|https://static.poly.pizza/bf4a5ed8-486b-4863-a654-fade1a9eaa39.glb|Campfire|Kenney|CC0 1.0
folder|emdPCRNhTX|https://static.poly.pizza/de17267e-5c4e-4299-b57c-d351b8c24ee8.glb|Folder|reyshapes|CC0 1.0
penguin|fBXvsC6pe_V|https://static.poly.pizza/f242d6d3-67cd-41b4-ae93-4cfd0acf8b5e.glb|Penguin|Poly by Google|CC-BY 3.0
tent|LrTs3hVGXv|https://static.poly.pizza/559b06c1-dd7f-46ef-ad2a-c7a6b845b4ef.glb|Tent|Kenney|CC0 1.0
flag|FuOkF3WBrx|https://static.poly.pizza/4cd7e950-9c30-4005-8a7d-81b4d555715e.glb|Flag|Quaternius|CC0 1.0
dish|IDRrztoAMB|https://static.poly.pizza/fe210307-ac7b-48b1-a891-c3f41f76fb2b.glb|Satellite Dish|Kenney|CC0 1.0
igloo|dJtgAOX15VZ|https://static.poly.pizza/0b1590c2-06aa-4876-a33b-5fbdc2ae5e74.glb|Igloo|Poly by Google|CC-BY 3.0
sled|5m_sB-SX53W|https://static.poly.pizza/4b760b06-363c-4734-b027-3e1807cef6d1.glb|Sled|Poly by Google|CC-BY 3.0
mailbox|2olZ0G8iur|https://static.poly.pizza/2077ee81-a657-45a1-9809-84890a3fdc34.glb|Mailbox|CreativeTrio|CC0 1.0
bottle|NxbygmpVwR|https://static.poly.pizza/2da3d98d-b72f-4934-8816-7000297115f6.glb|Old Bottle|MiniPoly|CC0 1.0
plane|75WQH5E29tF|https://static.poly.pizza/13ee3d74-48dd-475b-a6d0-1068b77f72f2.glb|Paper airplane|Poly by Google|CC-BY 3.0'

# Newer Poly Pizza uploads can't be fetched directly (only their page can load
# them). Download these by hand from each page's Download > GLB button and save
# them as site/models/<name>.glb; this script then lists them in the manifest.
MANUAL='chair|UfKvrZBK6C|Office Chair|Quaternius|CC0 1.0
cat|dYKICaHpK0c|Cat|Poly by Google|CC-BY 3.0
tree|2_fv3tn3NG_|Forest|Poly by Google|CC-BY 3.0
fish|BEcU9rjiAq|Fish|Quaternius|CC0 1.0
clownfish|769fHo3eEB|Clownfish|Quaternius|CC0 1.0'

ok=0; failed=""
entries=""
while IFS='|' read -r name id url title author licence; do
  [ -z "$name" ] && continue
  file="$OUT/$name.glb"
  printf '%-11s ' "$name"
  if curl -fsSL --retry 2 -o "$file.part" "$url" && [ "$(head -c 4 "$file.part")" = "glTF" ]; then
    mv "$file.part" "$file"
    echo "ok ($(wc -c < "$file" | tr -d ' ') bytes)"
    ok=$((ok + 1))
    entry=$(printf '    {"name": "%s", "id": "%s", "title": "%s", "author": "%s", "licence": "%s"}' "$name" "$id" "$title" "$author" "$licence")
    if [ -z "$entries" ]; then entries="$entry"; else entries="$entries,
$entry"; fi
  else
    rm -f "$file.part"
    echo "FAILED"
    failed="$failed $name"
  fi
done <<EOF
$MODELS
EOF

missing=""
while IFS='|' read -r name id title author licence; do
  [ -z "$name" ] && continue
  file="$OUT/$name.glb"
  printf '%-11s ' "$name"
  if [ -f "$file" ] && [ "$(head -c 4 "$file")" = "glTF" ]; then
    echo "ok (saved by hand)"
    entry=$(printf '    {"name": "%s", "id": "%s", "title": "%s", "author": "%s", "licence": "%s"}' "$name" "$id" "$title" "$author" "$licence")
    if [ -z "$entries" ]; then entries="$entry"; else entries="$entries,
$entry"; fi
  else
    echo "missing: download https://poly.pizza/m/$id as $file"
    missing="$missing $name"
  fi
done <<EOF
$MANUAL
EOF

printf '{\n  "source": "https://poly.pizza",\n  "models": [\n%s\n  ]\n}\n' "$entries" > "$OUT/manifest.json"

echo
echo "$ok models saved in $OUT, manifest written."
[ -n "$failed" ] && echo "Skipped (site keeps the built-in prop):$failed"
[ -n "$missing" ] && echo "Not downloaded yet (site keeps the built-in prop):$missing"
echo
echo "Publish them with:"
echo "  git add site/models && git commit -m 'Add Poly Pizza models' && git push"
