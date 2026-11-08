#!/bin/zsh
# Arena kit + hero pieces (Tripo P2 text-to-model) and extra Hound animations (retarget).
export TRIPO_CLIENT_APP=claude
cd "$(dirname "$0")/../art/tripo/props"
STYLE="dark gothic fantasy, weathered, realistic PBR-style texture, game asset, single object, centered"
gen() { # name face_limit prompt
  tripo generate text-to-model "$3, $STYLE" -p face_limit=$2 -o $1 --name prop-$1 --yes --no-open --quiet --json > $1.json 2> $1.log; echo "$1 exit $?"
}
gen pillar 9000 "tall gothic cathedral stone column with clustered shafts and a carved foliage capital, the top broken off and jagged, cracked dark grey stone with moss" &
gen brazier 8000 "carved gothic stone pedestal with a wrought iron fire brazier bowl on top filled with coals, skull reliefs on the pedestal" &
gen archway 12000 "ruined gothic stone archway, a tall pointed arch on two thick buttressed piers, cracked, fallen stones at the base" &
gen fountain 14000 "gothic stone fountain with a round octagonal basin and a central carved pillar topped by a small hooded saint statue, cracked, dark water stains" &
gen gate 14000 "massive gothic city gatehouse with a tall pointed archway, a raised iron portcullis, two side towers and battlements" &
gen shrine 8000 "small gothic roadside shrine: a stone plinth with a little pointed niche, covered in melted candles, skulls and wax drips" &
( tripo anim retarget 74c8d649-464e-48b6-aedb-2e2e9bc293b3 --animation preset:jump preset:dive preset:turn preset:hurt --animate-in-place -o ../wolf-anim2 --name wolf-anim2 --yes --no-open --quiet --json > ../wolf-anim2.json 2> ../wolf-anim2.log; echo "wolf-anim2 exit $?" ) &
wait
echo ALL DONE
