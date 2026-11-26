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
cat|qKICY6xla2|https://static.poly.pizza/67f5e3fe-37ee-4c86-95c8-d269d8c9f8ba.glb|Cat|Quaternius|CC0 1.0
campfire|i6UFAevfcu|https://static.poly.pizza/bf4a5ed8-486b-4863-a654-fade1a9eaa39.glb|Campfire|Kenney|CC0 1.0
windmill|WUbU1Nct2W|https://static.poly.pizza/6bf79810-ea32-4451-84e9-221e69020a40.glb|Windmill|Quaternius|CC0 1.0
printer|77K2TCL5Lz|https://static.poly.pizza/d113dfe6-cda8-4153-b95e-e33bb54e6171.glb|Printer|CreativeTrio|CC0 1.0
folder|emdPCRNhTX|https://static.poly.pizza/de17267e-5c4e-4299-b57c-d351b8c24ee8.glb|Folder|reyshapes|CC0 1.0
paper|4qDtAbPYnT|https://static.poly.pizza/c5af67bc-34d4-46fa-8d29-e7c02b80ba68.glb|Paper|Quaternius|CC0 1.0
radio|TPqvwkyWdV|https://static.poly.pizza/7ed34c76-5ef7-4b70-b7d8-ce06e8128b07.glb|Radio|Quaternius|CC0 1.0
speaker|YaVrUj51TV|https://static.poly.pizza/3ec01982-44db-44d0-b041-4e7ea8cecac3.glb|Speaker Small|Kenney|CC0 1.0
mic|yqbacXdPsg|https://static.poly.pizza/b6976679-945a-4914-8857-093a0c6ecb18.glb|Mic|iPoly3D|CC0 1.0
headphones|PSsWSIAYIL|https://static.poly.pizza/b72a848f-b4c6-40fb-ada7-69c4c524bd27.glb|Headphones|CreativeTrio|CC0 1.0
penguin|fBXvsC6pe_V|https://static.poly.pizza/f242d6d3-67cd-41b4-ae93-4cfd0acf8b5e.glb|Penguin|Poly by Google|CC-BY 3.0
tent|LrTs3hVGXv|https://static.poly.pizza/559b06c1-dd7f-46ef-ad2a-c7a6b845b4ef.glb|Tent|Kenney|CC0 1.0
flag|FuOkF3WBrx|https://static.poly.pizza/4cd7e950-9c30-4005-8a7d-81b4d555715e.glb|Flag|Quaternius|CC0 1.0
dish|IDRrztoAMB|https://static.poly.pizza/fe210307-ac7b-48b1-a891-c3f41f76fb2b.glb|Satellite Dish|Kenney|CC0 1.0
igloo|dJtgAOX15VZ|https://static.poly.pizza/0b1590c2-06aa-4876-a33b-5fbdc2ae5e74.glb|Igloo|Poly by Google|CC-BY 3.0
sled|5m_sB-SX53W|https://static.poly.pizza/4b760b06-363c-4734-b027-3e1807cef6d1.glb|Sled|Poly by Google|CC-BY 3.0
toolbox|3ImQcIK0Gp|https://static.poly.pizza/7c2b3946-0ee2-4626-b582-c280f1704dfc.glb|Toolbox|CreativeTrio|CC0 1.0
wrench|POJHQLnLvB|https://static.poly.pizza/cfa77cff-e66e-40d4-8ad9-aecafe283475.glb|Wrench|CreativeTrio|CC0 1.0
screen|V5Qo141OcB|https://static.poly.pizza/2af0158d-c560-4b1a-92e3-b50a51149b16.glb|Computer Screen|Kenney|CC0 1.0
server|6ijQclm8jxw|https://static.poly.pizza/a9b585dc-68f4-4a3b-a6b2-ec729cb92aa3.glb|server rack|Jeremy Eyring|CC-BY 3.0
scaffold|AYQd5RQ8w4|https://static.poly.pizza/79ea8731-ae53-44df-a52d-bba8a1f8d441.glb|Scaffolding|lakescorp|CC0 1.0
mailbox|2olZ0G8iur|https://static.poly.pizza/2077ee81-a657-45a1-9809-84890a3fdc34.glb|Mailbox|CreativeTrio|CC0 1.0
bottle|NxbygmpVwR|https://static.poly.pizza/2da3d98d-b72f-4934-8816-7000297115f6.glb|Old Bottle|MiniPoly|CC0 1.0
plane|75WQH5E29tF|https://static.poly.pizza/13ee3d74-48dd-475b-a6d0-1068b77f72f2.glb|Paper airplane|Poly by Google|CC-BY 3.0'

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

printf '{\n  "source": "https://poly.pizza",\n  "models": [\n%s\n  ]\n}\n' "$entries" > "$OUT/manifest.json"

echo
echo "$ok models saved in $OUT, manifest written."
[ -n "$failed" ] && echo "Skipped (site keeps the built-in prop):$failed"
echo
echo "Publish them with:"
echo "  git add site/models && git commit -m 'Add Poly Pizza models' && git push"
